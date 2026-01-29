import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
import {
    VerificationStatusDto,
    VerificationItemDto,
    VerificationRequirementsDto,
    RequirementDto,
    UploadVerificationRequest,
    UploadVerificationResponse,
} from '../dto/BorrowerDtos';

/**
 * B-02: BORROWER VERIFICATION SERVICE
 * Handles KYC/AML verification and progressive verification levels
 * Levels: F (0) → 1 → 2 → 3
 */
export class BorrowerVerificationService {
    private auditRepo: AuditLogRepository;
    private notificationRepo: NotificationRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationRepo = new NotificationRepository();
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

            // TODO: Query user's current level and all verifications
            const verifications: VerificationItemDto[] = [];

            // TODO: Query user_verifications table
            // SELECT * FROM user_verifications WHERE user_id = ? ORDER BY created_at DESC

            const status: VerificationStatusDto = {
                level: 2,
                levelName: '2',
                isVerified: true,
                verifications: verifications,
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

            // TODO: Get user's current level
            // TODO: Query verification_requirements for next level
            // TODO: Check which requirements are already completed

            const requirements: RequirementDto[] = [
                {
                    id: 'REQ_001',
                    type: 'EMAIL',
                    description: 'Verify your email address',
                    isRequired: true,
                    isCompleted: true,
                },
                {
                    id: 'REQ_002',
                    type: 'PHONE',
                    description: 'Verify your phone number',
                    isRequired: true,
                    isCompleted: true,
                },
                {
                    id: 'REQ_003',
                    type: 'KYC',
                    description: 'Complete KYC verification with ID',
                    isRequired: true,
                    isCompleted: false,
                    expiresAt: '2026-03-01',
                },
            ];

            const dto: VerificationRequirementsDto = {
                currentLevel: 2,
                nextLevel: 3,
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

            // TODO: Transaction start
            // 1. Get verification_type_id from verification_types lookup
            // 2. Get PENDING status_id from verification_statuses lookup
            // 3. INSERT into user_verifications
            // 4. INSERT documents into verification_documents
            // 5. Audit log
            // 6. Notify admin

            const verificationId = Math.floor(Math.random() * 1000000);

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VERIFICATION_SUBMITTED',
                entity: 'VERIFICATION',
                entityId: verificationId,
                createdAt: new Date(),
            } as any);

            // Notification to admin
            // TODO: Insert into notifications table
            // notificationRepo.create({
            //   recipient_id: ADMIN_ID,
            //   type: 'VERIFICATION_SUBMITTED',
            //   message: `New verification submission from borrower ${borrowerId}`,
            //   related_entity: 'VERIFICATION',
            //   related_entity_id: verificationId,
            // });

            return {
                verificationId,
                type: request.verificationType,
                status: 'PENDING',
                submittedAt: new Date().toISOString(),
                message: 'Verification documents submitted successfully',
            };
        } catch (error: any) {
            console.error('Error submitting verification:', error);
            // TODO: Transaction rollback on error
            throw new Error('Failed to submit verification');
        }
    }
}
