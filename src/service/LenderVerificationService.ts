import {
    VerificationListResponse,
    SubmitVerificationRequest,
    SubmitVerificationResponse,
    LenderProfileDto,
    UpdateLenderProfileRequest,
    UpdateLenderProfileResponse,
} from '../dto/LenderDtos';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import { UserRepository } from '../repository/UserRepository';
import { VerificationRepositoryBase } from '../repository/VerificationRepositoryBase';
import { VerificationDocumentRepository } from '../repository/VerificationDocumentRepository';
import { Verification } from '../domain/Verification';
import { VerificationDocument } from '../domain/VerificationDocument';
import { KycDocumentValidationService } from './KycDocumentValidationService';
import {
    VERIFICATION_STATUS_IDS,
    VerificationWorkflowStatusCode,
    getApplicantTypeFromRoleId,
    getStatusCodeById,
} from '../util/KycVerification';

/**
 * L-08: LENDER VERIFICATION SERVICE
 * Submit KYC documents and track verification status
 */
export class LenderVerificationService {
    private auditLogRepository: AuditLogRepository;
    private userRepository: UserRepository;
    private verificationRepository: VerificationRepositoryBase;
    private verificationDocumentRepository: VerificationDocumentRepository;
    private kycValidationService: KycDocumentValidationService;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
        this.userRepository = new UserRepository();
        this.verificationRepository = new VerificationRepositoryBase();
        this.verificationDocumentRepository = new VerificationDocumentRepository();
        this.kycValidationService = new KycDocumentValidationService();
    }

    /**
     * Get verification status for lender
     * Shows required types and completion status
     * 
     * SQL:
     * SELECT 
     *   uv.id,
     *   vt.code as type_code,
     *   vt.description as type_name,
     *   vs.code as status_code,
     *   vs.name as status_name,
     *   u.email as reviewed_by,
     *   uv.reviewed_at,
     *   uv.created_at
     * FROM user_verifications uv
     * LEFT JOIN verification_types vt ON vt.id = uv.verification_type_id
     * LEFT JOIN verification_statuses vs ON vs.id = uv.status_id
     * LEFT JOIN users u ON u.id = uv.reviewed_by
     * WHERE uv.user_id = ?
     * ORDER BY uv.created_at DESC
     */
    async getVerifications(lenderId: string): Promise<VerificationListResponse> {
        try {
            const lenderIdNum = parseInt(lenderId, 10);
            const user = await this.userRepository.findById(lenderIdNum);
            if (!user) {
                throw new Error('User not found');
            }

            const verificationsRaw = await this.verificationRepository.findByUserId(lenderIdNum);
            const typeMap: Record<number, string> = {
                1: 'INDIVIDUAL_IDENTITY',
                2: 'INDIVIDUAL_PROOF_OF_ADDRESS',
                7: 'COMPANY_REGISTRATION',
                8: 'COMPANY_DIRECTOR_IDENTITY',
                9: 'COMPANY_PROOF_OF_ADDRESS',
            };
            const verifications = await Promise.all(
                verificationsRaw.map(async (v) => ({
                    id: String(v.id),
                    typeCode: typeMap[v.typeId] || `TYPE_${v.typeId}`,
                    typeName: typeMap[v.typeId] || `TYPE_${v.typeId}`,
                    statusCode: getStatusCodeById(v.statusId),
                    statusName: getStatusCodeById(v.statusId),
                    reviewedAt: v.reviewedAt?.toISOString(),
                    createdAt: v.submittedAt?.toISOString(),
                    documents: (await this.verificationDocumentRepository.findByVerificationId(v.id)).map((d) => ({
                        id: String(d.id),
                        filePath: d.filePath || '',
                        uploadedAt: d.uploadedAt?.toISOString() || new Date().toISOString(),
                    })),
                }))
            );

            const applicantType = getApplicantTypeFromRoleId(user.roleId);
            const requiredVerifications =
                applicantType === 'COMPANY'
                    ? ['COMPANY_REGISTRATION', 'COMPANY_DIRECTOR_IDENTITY', 'COMPANY_PROOF_OF_ADDRESS']
                    : ['INDIVIDUAL_IDENTITY', 'INDIVIDUAL_PROOF_OF_ADDRESS'];
            const currentLevel = user.level || 0;
            const nextLevelRequires: string[] = requiredVerifications.filter(
                (reqType) => !verifications.some((v) => v.typeCode === reqType && v.statusCode === VerificationWorkflowStatusCode.APPROVED)
            );

            return {
                verifications,
                requiredVerifications,
                currentLevel,
                nextLevelRequires,
            };
        } catch (error: any) {
            console.error('Error fetching verifications:', error);
            throw new Error('Failed to fetch verifications');
        }
    }

    /**
     * Submit verification documents
     * Steps:
     * 1. INSERT into user_verifications with status = PENDING
     * 2. INSERT documents into verification_documents
     * 3. Audit log
     * 4. Notify admin for review
     * 
     * SQL:
     * INSERT INTO user_verifications (user_id, verification_type_id, status_id, created_at)
     * VALUES (?, (SELECT id FROM verification_types WHERE code = ?), (SELECT id FROM verification_statuses WHERE code = 'PENDING'), NOW())
     * 
     * INSERT INTO verification_documents (verification_id, file_path, uploaded_at)
     * VALUES (?, ?, NOW())
     */
    async submitVerification(
        lenderId: string,
        request: SubmitVerificationRequest
    ): Promise<SubmitVerificationResponse> {
        try {
            const lenderIdNum = parseInt(lenderId, 10);
            const user = await this.userRepository.findById(lenderIdNum);
            if (!user) {
                throw new Error('User not found');
            }

            const typeMap: Record<string, number> = {
                INDIVIDUAL_IDENTITY: 1,
                INDIVIDUAL_PROOF_OF_ADDRESS: 2,
                COMPANY_REGISTRATION: 7,
                COMPANY_DIRECTOR_IDENTITY: 8,
                COMPANY_PROOF_OF_ADDRESS: 9,
            };
            const typeId = typeMap[request.verificationType];
            if (!typeId) {
                throw new Error('Invalid verification type');
            }

            const validation = this.kycValidationService.validateSubmission(
                getApplicantTypeFromRoleId(user.roleId),
                request.documents || []
            );
            if (!validation.valid) {
                throw new Error(validation.errors.join('; '));
            }

            const verification = new Verification();
            verification.userId = lenderIdNum;
            verification.typeId = typeId;
            verification.statusId = VERIFICATION_STATUS_IDS.PENDING_VERIFICATION;
            verification.submittedAt = new Date();
            verification.metadata = { documents: request.documents || [] } as Record<string, any>;
            const saved = await this.verificationRepository.save(verification);

            const docs = (request.documents || []).map((doc) => {
                const entity = new VerificationDocument();
                entity.verificationId = saved.id;
                entity.fileName = doc.fileName;
                entity.filePath = doc.filePath;
                entity.category = doc.category || request.verificationType;
                entity.subtype = doc.subtype;
                entity.side = doc.side;
                entity.issuedAt = doc.issuedAt ? new Date(doc.issuedAt) : undefined;
                entity.expiresAt = doc.expiresAt ? new Date(doc.expiresAt) : undefined;
                entity.fullName = doc.fullName;
                entity.addressLine = doc.addressLine;
                return entity;
            });
            if (docs.length > 0) {
                await this.verificationDocumentRepository.saveMany(docs);
            }

            return {
                verificationId: String(saved.id),
                typeCode: request.verificationType,
                statusCode: VerificationWorkflowStatusCode.PENDING_VERIFICATION,
                message: 'Verification submitted. Admin will review within 2 business days.',
                createdAt: new Date().toISOString(),
            };
        } catch (error: any) {
            console.error('Error submitting verification:', error);
            throw error;
        }
    }
}

/**
 * L-09: LENDER PROFILE SERVICE
 * View and edit limited profile fields
 */
export class LenderProfileService {
    private userRepository: UserRepository;
    private auditLogRepository: AuditLogRepository;

    constructor() {
        this.userRepository = new UserRepository();
        this.auditLogRepository = new AuditLogRepository();
    }

    /**
     * Get lender profile
     * Read-only operation
     * 
     * SQL:
     * SELECT 
     *   u.id,
     *   u.email,
     *   u.phone,
     *   u.level,
     *   us.code as status_code,
     *   us.name as status_name,
     *   u.created_at,
     *   u.updated_at,
     *   COUNT(DISTINCT CASE WHEN uv.status_id = 2 THEN uv.id END) as verification_count,
     *   GROUP_CONCAT(vt.code) as completed_types
     * FROM users u
     * JOIN user_statuses us ON us.id = u.status_id
     * LEFT JOIN user_verifications uv ON uv.user_id = u.id AND uv.status_id = 2
     * LEFT JOIN verification_types vt ON vt.id = uv.verification_type_id
     * WHERE u.id = ?
     * GROUP BY u.id
     */
    async getProfile(lenderId: string): Promise<LenderProfileDto> {
        try {
            const user = await this.userRepository.findById(parseInt(lenderId, 10));

            if (!user) {
                throw new Error('User not found');
            }

            // TODO: Query verification status
            // TODO: Query bank account verification status

            const statusMap: Record<number, string> = { 1: 'PENDING', 2: 'ACTIVE', 3: 'BLOCKED', 4: 'FROZEN' };
            const statusCode = statusMap[user.statusId] ?? 'PENDING';
            const statusName = statusCode.charAt(0) + statusCode.slice(1).toLowerCase();
            const profile: LenderProfileDto = {
                id: user.id?.toString() || '',
                email: user.email,
                phone: user.phone || undefined,
                level: user.level || 0,
                statusCode,
                statusName,
                createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
                updatedAt: user.updatedAt?.toISOString() || new Date().toISOString(),
                verificationStatus: {
                    level: user.level || 0,
                    completedTypes: [], // TODO: Query approved verifications
                    pendingTypes: [], // TODO: Query pending verifications
                },
                bankAccount: {
                    isVerified: !!(user.bankAccount && String(user.bankAccount).trim().length > 0),
                },
            };

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} viewed profile`);

            return profile;
        } catch (error: any) {
            console.error('Error fetching profile:', error);
            throw new Error('Failed to fetch profile');
        }
    }

    /**
     * Update lender profile
     * Only editable fields: phone
     * Cannot edit: email, password, role, status, level
     * 
     * SQL:
     * UPDATE users SET phone = ?, updated_at = NOW() WHERE id = ?
     */
    async updateProfile(
        lenderId: string,
        request: UpdateLenderProfileRequest
    ): Promise<UpdateLenderProfileResponse> {
        try {
            const user = await this.userRepository.findById(parseInt(lenderId, 10));

            if (!user) {
                throw new Error('User not found');
            }

            const updatedFields: string[] = [];

            // Only allow phone to be updated
            if (request.phone !== undefined && request.phone !== user.phone) {
                user.phone = request.phone;
                updatedFields.push('phone');
            }

            if (updatedFields.length > 0) {
                await this.userRepository.save(user);
            }

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} updated profile`);

            // Return updated profile
            const profile = await this.getProfile(lenderId);

            return {
                profile,
                updatedFields,
                message: 'Profile updated successfully',
            };
        } catch (error: any) {
            console.error('Error updating profile:', error);
            throw error;
        }
    }
}
