import { AuditLogRepository } from '../repository/AuditLogRepository';
import { VerificationRepositoryBase } from '../repository/VerificationRepositoryBase';
import { LmsNotificationService } from './LmsNotificationService';
import { UserRepository } from '../repository/UserRepository';
import { Verification } from '../domain/Verification';
import { VerificationDocument } from '../domain/VerificationDocument';
import { VerificationDocumentRepository } from '../repository/VerificationDocumentRepository';
import {
    VerificationStatusDto,
    VerificationItemDto,
    VerificationRequirementsDto,
    RequirementDto,
    UploadVerificationRequest,
    UploadVerificationResponse,
} from '../dto/BorrowerDtos';
import {
    getApplicantTypeFromRoleId,
    getStatusCodeById,
    VERIFICATION_STATUS_IDS,
    VerificationWorkflowStatusCode,
} from '../util/KycVerification';
import { KycDocumentValidationService } from './KycDocumentValidationService';

/**
 * B-02: BORROWER VERIFICATION SERVICE
 * Handles KYC/AML verification and progressive verification levels
 * Levels: F (0) → 1 → 2 → 3
 */
export class BorrowerVerificationService {
    private auditRepo: AuditLogRepository;
    private notificationService: LmsNotificationService;
    private verificationRepo: VerificationRepositoryBase;
    private userRepo: UserRepository;
    private verificationDocumentRepo: VerificationDocumentRepository;
    private kycValidationService: KycDocumentValidationService;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationService = new LmsNotificationService();
        this.verificationRepo = new VerificationRepositoryBase();
        this.userRepo = new UserRepository();
        this.verificationDocumentRepo = new VerificationDocumentRepository();
        this.kycValidationService = new KycDocumentValidationService();
    }

    /**
     * Get borrower's verification status
     *
     * SQL:
     * SELECT
     *   u.level,
     *   uv.id,
     *   vt.code as type,
     *   vs.code as status,
     *   uv.created_at as submittedAt,
     *   uv.updated_at as approvedAt
     * FROM users u
     * LEFT JOIN user_verifications uv ON uv.user_id = u.id
     * LEFT JOIN verification_types vt ON vt.id = uv.verification_type_id
     * LEFT JOIN verification_statuses vs ON vs.id = uv.status_id
     * WHERE u.id = ?
     */
    async getVerificationStatus(borrowerId: string): Promise<VerificationStatusDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);

            // Get user's current level
            const user = await this.userRepo.findById(borrowerIdNum);
            if (!user) {
                throw new Error('User not found');
            }

            // Query user_verifications table
            const verifications = await this.verificationRepo.findByUserId(borrowerIdNum);

            const verificationDtos: VerificationItemDto[] = verifications.map((v) => {
                const typeMap: { [key: number]: string } = {
                    1: 'INDIVIDUAL_IDENTITY',
                    2: 'INDIVIDUAL_PROOF_OF_ADDRESS',
                    3: 'INCOME',
                    4: 'BIK',
                    5: 'PHONE',
                    6: 'EMAIL',
                    7: 'COMPANY_REGISTRATION',
                    8: 'COMPANY_DIRECTOR_IDENTITY',
                    9: 'COMPANY_PROOF_OF_ADDRESS',
                };

                return {
                    id: v.id,
                    type: typeMap[v.typeId] || `TYPE_${v.typeId}`,
                    status: getStatusCodeById(v.statusId),
                    submittedAt: v.submittedAt?.toISOString(),
                    approvedAt: v.reviewedAt?.toISOString(),
                    rejectionReason: v.reviewComment,
                };
            });

            const levelNames: { [key: number]: string } = {
                0: 'F',
                1: '1',
                2: '2',
                3: '3',
            };

            const status: VerificationStatusDto = {
                level: user.level,
                levelName: levelNames[user.level] || 'UNKNOWN',
                isVerified: user.level > 0,
                verifications: verificationDtos,
            };

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_VERIFICATION_STATUS',
                entity: 'VERIFICATION',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return status;
        } catch (error: any) {
            console.error('Error fetching verification status:', error);
            throw new Error('Failed to fetch verification status');
        }
    }

    /**
     * Get verification requirements for next level
     *
     * SQL:
     * SELECT
     *   r.id,
     *   vt.code as type,
     *   r.description,
     *   1 as isRequired,
     *   CASE WHEN uv.id IS NOT NULL THEN 1 ELSE 0 END as isCompleted
     * FROM verification_requirements r
     * JOIN verification_types vt ON vt.id = r.verification_type_id
     * LEFT JOIN user_verifications uv ON uv.user_id = ? AND uv.verification_type_id = r.verification_type_id AND uv.status_id = 3
     * WHERE r.required_level = (SELECT level + 1 FROM users WHERE id = ?)
     */
    async getVerificationRequirements(borrowerId: string): Promise<VerificationRequirementsDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);

            // Get user's current level
            const user = await this.userRepo.findById(borrowerIdNum);
            if (!user) {
                throw new Error('User not found');
            }

            const nextLevel = Math.min(user.level + 1, 3);

            // Check completion status for each requirement
            const completedVerifications = await this.verificationRepo.findApprovedByUser(borrowerIdNum);
            const completedTypes = new Set(completedVerifications.map((v) => v.typeId));

            const typeMap: { [key: string]: number } = {
                EMAIL: 6,
                PHONE: 5,
                INDIVIDUAL_IDENTITY: 1,
                INDIVIDUAL_PROOF_OF_ADDRESS: 2,
                INCOME: 3,
                BIK: 4,
                COMPANY_REGISTRATION: 7,
                COMPANY_DIRECTOR_IDENTITY: 8,
                COMPANY_PROOF_OF_ADDRESS: 9,
            };

            const applicantType = getApplicantTypeFromRoleId(user.roleId);
            const requirements = this.kycValidationService.buildRequirementCards(
                applicantType,
                completedTypes,
                typeMap
            ) as RequirementDto[];

            const dto: VerificationRequirementsDto = {
                currentLevel: user.level,
                nextLevel: nextLevel,
                requirements: requirements,
            };

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_VERIFICATION_REQUIREMENTS',
                entity: 'VERIFICATION',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return dto;
        } catch (error: any) {
            console.error('Error fetching verification requirements:', error);
            throw new Error('Failed to fetch verification requirements');
        }
    }

    /**
     * Submit verification documents
     * Creates user_verifications record with PENDING status
     * Stores documents in verification_documents table
     *
     * ATOMIC TRANSACTION:
     * BEGIN
     *   INSERT INTO user_verifications (user_id, verification_type_id, status_id, created_at)
     *   VALUES (?, VERIFICATION_TYPE_ID, PENDING_STATUS, NOW())
     *   INSERT INTO verification_documents (verification_id, file_path, created_at)
     *   VALUES (?, ?, NOW())
     *   INSERT INTO audit_logs (actor_id, action, entity, entity_id, created_at)
     *   VALUES (?, 'VERIFICATION_SUBMITTED', 'VERIFICATION', verification_id, NOW())
     *   INSERT INTO notifications (user_id, type, message, created_at)
     *   VALUES (?, 'VERIFICATION_SUBMITTED', ..., NOW())
     * COMMIT
     */
    async submitVerification(
        borrowerId: string,
        request: UploadVerificationRequest
    ): Promise<UploadVerificationResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);

            // Get verification type ID
            const typeMap: { [key: string]: number } = {
                EMAIL: 6,
                PHONE: 5,
                INDIVIDUAL_IDENTITY: 1,
                INDIVIDUAL_PROOF_OF_ADDRESS: 2,
                INCOME: 3,
                BIK: 4,
                COMPANY_REGISTRATION: 7,
                COMPANY_DIRECTOR_IDENTITY: 8,
                COMPANY_PROOF_OF_ADDRESS: 9,
            };

            const typeId = typeMap[request.verificationType];
            if (!typeId) {
                throw new Error('Invalid verification type');
            }

            const user = await this.userRepo.findById(borrowerIdNum);
            if (!user) {
                throw new Error('User not found');
            }

            const applicantType = getApplicantTypeFromRoleId(user.roleId);
            const validation = this.kycValidationService.validateSubmission(applicantType, request.documents || [], {
                requireAllCategories: false,
                targetCategory: request.verificationType as any,
            });
            if (!validation.valid) {
                throw new Error(validation.errors.join('; '));
            }

            // Create verification record with PENDING_VERIFICATION status (statusId = 1)
            const verification = new Verification();
            verification.userId = borrowerIdNum;
            verification.typeId = typeId;
            verification.statusId = VERIFICATION_STATUS_IDS.PENDING_VERIFICATION;
            verification.submittedAt = new Date();
            verification.metadata = { documents: request.documents || [] } as Record<string, any>;

            const savedVerification = await this.verificationRepo.save(verification);

            const documentEntities = (request.documents || []).map((doc) => {
                const entity = new VerificationDocument();
                entity.verificationId = savedVerification.id;
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
            if (documentEntities.length > 0) {
                await this.verificationDocumentRepo.saveMany(documentEntities);
            }

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VERIFICATION_SUBMITTED',
                entity: 'VERIFICATION',
                entityId: savedVerification.id,
                createdAt: new Date(),
            } as any);

            await this.notificationService.notify(
                borrowerIdNum,
                'VERIFICATION_SUBMITTED',
                'Verification Submitted',
                `Your ${request.verificationType} verification has been submitted for review`,
                { verificationType: request.verificationType }
            );

            return {
                verificationId: savedVerification.id,
                type: request.verificationType,
                status: VerificationWorkflowStatusCode.PENDING_VERIFICATION,
                submittedAt: new Date().toISOString(),
                message: 'Verification documents submitted successfully. Our team will review them soon.',
            };
        } catch (error: any) {
            console.error('Error submitting verification:', error);
            throw new Error('Failed to submit verification');
        }
    }
}
