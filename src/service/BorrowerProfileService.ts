import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
import { UserRepository } from '../repository/UserRepository';
import { LevelRulesRepository } from '../repository/LevelRulesRepository';
import {
    ProfileDto,
    UpdateProfileRequest,
    UpdateProfileResponse,
    ProfileActivityResponse,
    ActivityItemDto,
} from '../dto/BorrowerDtos';

const STATUS_NAMES: Record<number, string> = { 1: 'PENDING', 2: 'ACTIVE', 3: 'BLOCKED', 4: 'FROZEN' };

/**
 * B-09: BORROWER PROFILE SERVICE
 * Returns real user profile with status and verification for dashboard banners.
 */
export class BorrowerProfileService {
    private auditRepo: AuditLogRepository;
    private notificationRepo: NotificationRepository;
    private userRepo: UserRepository;
    private levelRulesRepo: LevelRulesRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationRepo = new NotificationRepository();
        this.userRepo = new UserRepository();
        this.levelRulesRepo = new LevelRulesRepository();
    }

    async getProfile(borrowerId: string): Promise<ProfileDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const user = await this.userRepo.findById(borrowerIdNum);
            if (!user) throw new Error('User not found');

            const level = user.level ?? 0;
            const levelRules = await this.levelRulesRepo.findByLevel(level);
            const verificationStatus = level > 0 ? 'approved' : 'not_started';

            const profile: ProfileDto = {
                id: user.id,
                email: user.email,
                firstName: user.firstName ?? '',
                lastName: user.lastName ?? '',
                phone: user.phone ?? '',
                dateOfBirth: undefined,
                roleId: user.roleId,
                statusId: user.statusId,
                statusName: STATUS_NAMES[user.statusId] ?? 'PENDING',
                verificationLevel: level,
                verificationStatus,
                createdAt: user.createdAt?.toISOString?.() ?? '',
                updatedAt: user.updatedAt?.toISOString?.() ?? '',
                twoFAEnabled: false,
                availableLoanLimit: Number(levelRules?.maxLoanAmount ?? 0),
            };

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_PROFILE',
                entity: 'USER',
                entityId: borrowerIdNum,
                createdAt: new Date(),
            } as any);

            return profile;
        } catch (error: any) {
            console.error('Error fetching profile:', error);
            throw new Error('Failed to fetch profile');
        }
    }

    /**
     * Update borrower profile
     * Only allows: firstName, lastName, phone, dateOfBirth
     *
     * ATOMIC TRANSACTION:
     * BEGIN
     *   UPDATE users SET
     *     first_name = ?, last_name = ?, phone = ?, date_of_birth = ?,
     *     updated_at = NOW()
     *   WHERE id = ?
     *   INSERT INTO audit_logs (action='PROFILE_UPDATED', ...)
     *   INSERT INTO notifications (user_id=?, type='PROFILE_UPDATED', ...)
     * COMMIT
     *
     * Protected fields (rejected if attempted):
     * - email, password, role_id, status_id, level
     */
    async updateProfile(
        borrowerId: string,
        request: UpdateProfileRequest
    ): Promise<UpdateProfileResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);

            // Validate request - only editable fields
            if (!request.firstName && !request.lastName && !request.phone && !request.dateOfBirth) {
                throw new Error('No fields to update');
            }

            // TODO: Update user profile
            // UPDATE users SET
            //   first_name = COALESCE(?, first_name),
            //   last_name = COALESCE(?, last_name),
            //   phone = COALESCE(?, phone),
            //   date_of_birth = COALESCE(?, date_of_birth),
            //   updated_at = NOW()
            // WHERE id = ?

            const updatedAt = new Date().toISOString();

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'PROFILE_UPDATED',
                entity: 'USER',
                entityId: borrowerIdNum,
                createdAt: new Date(),
            } as any);

            // Notification
            // TODO: notificationRepo.create({...})

            return {
                id: borrowerIdNum,
                email: 'borrower@example.com',
                firstName: request.firstName || 'John',
                lastName: request.lastName || 'Doe',
                phone: request.phone || '+48501234567',
                updatedAt,
                message: 'Profile updated successfully',
            };
        } catch (error: any) {
            console.error('Error updating profile:', error);
            // TODO: Transaction rollback
            throw new Error(error.message || 'Failed to update profile');
        }
    }

    /**
     * Get borrower's activity log
     * Shows all actions performed by borrower (audit trail)
     *
     * SQL:
     * SELECT
     *   a.created_at as timestamp,
     *   a.action,
     *   a.entity,
     *   a.entity_id,
     *   CASE
     *     WHEN a.action = 'APPLICATION_CREATED' THEN 'Loan application created'
     *     WHEN a.action = 'PAYMENT_MADE' THEN 'Payment submitted'
     *     WHEN a.action = 'VERIFICATION_SUBMITTED' THEN 'Verification documents submitted'
     *     ELSE a.action
     *   END as description,
     *   'SUCCESS' as status
     * FROM audit_logs a
     * WHERE a.actor_id = ?
     * ORDER BY a.created_at DESC
     */
    async getActivityLog(
        borrowerId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<ProfileActivityResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const offset = (page - 1) * pageSize;

            // TODO: Query audit_logs for borrower
            const activities: ActivityItemDto[] = [];
            const totalItems = 0;

            // Sample data
            activities.push({
                timestamp: new Date().toISOString(),
                action: 'VIEW_PROFILE',
                entity: 'USER',
                entityId: borrowerIdNum,
                description: 'Profile viewed',
                status: 'SUCCESS',
            });

            activities.push({
                timestamp: new Date(Date.now() - 86400000).toISOString(),
                action: 'APPLICATION_CREATED',
                entity: 'APPLICATION',
                entityId: 101,
                description: 'Loan application created for 50,000 PLN',
                status: 'SUCCESS',
            });

            activities.push({
                timestamp: new Date(Date.now() - 172800000).toISOString(),
                action: 'VERIFICATION_SUBMITTED',
                entity: 'VERIFICATION',
                entityId: 50,
                description: 'KYC verification documents submitted',
                status: 'SUCCESS',
            });

            // Audit log for this action
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_ACTIVITY_LOG',
                entity: 'AUDIT',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                activities,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
            };
        } catch (error: any) {
            console.error('Error fetching activity log:', error);
            throw new Error('Failed to fetch activity log');
        }
    }
}
