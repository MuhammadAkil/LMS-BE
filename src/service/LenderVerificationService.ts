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

/**
 * L-08: LENDER VERIFICATION SERVICE
 * Submit KYC documents and track verification status
 */
export class LenderVerificationService {
    private auditLogRepository: AuditLogRepository;
    private userRepository: UserRepository;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
        this.userRepository = new UserRepository();
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
            // TODO: Query user_verifications for lender
            // TODO: Join with verification_types and verification_statuses
            // TODO: Fetch required verification types from platform_config
            // TODO: Calculate current level based on approved verifications

            const verifications: any[] = [];
            const requiredVerifications = ['KYC', 'BANK']; // From platform config
            const currentLevel = 0;
            const nextLevelRequires = ['INCOME', 'BUSINESS'];

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} viewed verifications`);

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
            // TODO: Validate verification type is in required list
            // TODO: Validate documents (not empty, valid file paths)
            // TODO: BEGIN TRANSACTION

            try {
                // TODO: INSERT into user_verifications
                const verificationId = 'VER_' + Date.now();

                // TODO: INSERT into verification_documents for each file
                // TODO: COMMIT

                // Audit log placeholder (replace with actual repository method when available)
                console.log(`Audit: User ${lenderId} submitted verification ${verificationId}`);

                // TODO: Send notification to admins for review

                return {
                    verificationId,
                    typeCode: request.verificationType,
                    statusCode: 'PENDING',
                    message: 'Verification submitted. Admin will review within 2 business days.',
                    createdAt: new Date().toISOString(),
                };
            } catch (transactionError: any) {
                // TODO: ROLLBACK
                throw transactionError;
            }
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

            const profile: LenderProfileDto = {
                id: user.id?.toString() || '',
                email: user.email,
                phone: user.phone || undefined,
                level: user.level || 0,
                statusCode: 'ACTIVE', // TODO: Map from status_id
                statusName: 'Active', // TODO: Map from status_id
                createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
                updatedAt: user.updatedAt?.toISOString() || new Date().toISOString(),
                verificationStatus: {
                    level: user.level || 0,
                    completedTypes: [], // TODO: Query approved verifications
                    pendingTypes: [], // TODO: Query pending verifications
                },
                bankAccount: {
                    isVerified: !!user.phone, // Placeholder - replace with actual bank account check
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

            // TODO: Save updates
            // const savedUser = await this.userRepository.save(user);

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
