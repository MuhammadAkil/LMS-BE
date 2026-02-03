import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
import { VerificationRepositoryBase } from '../repository/VerificationRepositoryBase';
import { UserRepository } from '../repository/UserRepository';
import { Verification } from '../domain/Verification';
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
    private verificationRepo: VerificationRepositoryBase;
    private userRepo: UserRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationRepo = new NotificationRepository();
        this.verificationRepo = new VerificationRepositoryBase();
        this.userRepo = new UserRepository();
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
                const statusMap: { [key: number]: string } = {
                    1: 'PENDING',
                    2: 'APPROVED',
                    3: 'REJECTED',
                };

                const typeMap: { [key: number]: string } = {
                    1: 'ID',
                    2: 'ADDRESS',
                    3: 'INCOME',
                    4: 'BIK',
                    5: 'PHONE',
                    6: 'EMAIL',
                };

                return {
                    id: v.id,
                    type: typeMap[v.typeId] || `TYPE_${v.typeId}`,
                    status: statusMap[v.statusId] || 'UNKNOWN',
                    submittedAt: v.createdAt?.toISOString(),
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

            const nextLevel = user.level + 1;
            if (nextLevel > 3) {
                // User has maximum verification level
                return {
                    currentLevel: user.level,
                    nextLevel: user.level,
                    requirements: [],
                };
            }

            // Define verification requirements per level
            const requirementsByLevel: { [key: number]: RequirementDto[] } = {
                1: [
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
                ],
                2: [
                    {
                        id: 'REQ_003',
                        type: 'ID',
                        description: 'Government-issued ID verification',
                        isRequired: true,
                        isCompleted: false,
                        expiresAt: '2026-03-01',
                    },
                    {
                        id: 'REQ_004',
                        type: 'ADDRESS',
                        description: 'Proof of address (utility bill, lease, etc.)',
                        isRequired: true,
                        isCompleted: false,
                    },
                ],
                3: [
                    {
                        id: 'REQ_005',
                        type: 'INCOME',
                        description: 'Income verification (tax return, pay stub)',
                        isRequired: true,
                        isCompleted: false,
                    },
                    {
                        id: 'REQ_006',
                        type: 'BIK',
                        description: 'Credit bureau check',
                        isRequired: false,
                        isCompleted: false,
                    },
                ],
            };

            const requirements = requirementsByLevel[nextLevel] || [];

            // Check completion status for each requirement
            const completedVerifications = await this.verificationRepo.findApprovedByUser(borrowerIdNum);
            const completedTypes = new Set(completedVerifications.map((v) => v.typeId));

            const typeMap: { [key: string]: number } = {
                EMAIL: 6,
                PHONE: 5,
                ID: 1,
                ADDRESS: 2,
                INCOME: 3,
                BIK: 4,
            };

            requirements.forEach((req) => {
                const typeId = typeMap[req.type];
                req.isCompleted = typeId ? completedTypes.has(typeId) : false;
            });

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
                ID: 1,
                ADDRESS: 2,
                INCOME: 3,
                BIK: 4,
            };

            const typeId = typeMap[request.verificationType];
            if (!typeId) {
                throw new Error('Invalid verification type');
            }

            // Create verification record with PENDING status (statusId = 1)
            const verification = new Verification();
            verification.userId = borrowerIdNum;
            verification.typeId = typeId;
            verification.statusId = 1; // PENDING
            verification.submittedAt = new Date();
            verification.metadata = JSON.stringify(request.documents || []);

            const savedVerification = await this.verificationRepo.save(verification);

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VERIFICATION_SUBMITTED',
                entity: 'VERIFICATION',
                entityId: savedVerification.id,
                createdAt: new Date(),
            } as any);

            // Notification
            await this.notificationRepo.create({
                userId: borrowerIdNum,
                type: 'VERIFICATION_SUBMITTED',
                title: 'Verification Submitted',
                message: `Your ${request.verificationType} verification has been submitted for review`,
                createdAt: new Date(),
            } as any);

            return {
                verificationId: savedVerification.id,
                type: request.verificationType,
                status: 'PENDING',
                submittedAt: new Date().toISOString(),
                message: 'Verification documents submitted successfully. Our team will review them soon.',
            };
        } catch (error: any) {
            console.error('Error submitting verification:', error);
            throw new Error('Failed to submit verification');
        }
    }
}
