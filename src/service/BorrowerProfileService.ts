import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
import {
    ProfileDto,
    UpdateProfileRequest,
    UpdateProfileResponse,
    ProfileActivityResponse,
    ActivityItemDto,
} from '../dto/BorrowerDtos';

/**
 * B-09: BORROWER PROFILE SERVICE
 * Manages borrower profile and activity tracking
 *
 * Rules:
 * - Limited editable fields: firstName, lastName, phone, dateOfBirth
 * - Protected fields: email, password, role, status, level (cannot be edited by borrower)
 * - Activity tracking via audit_logs
 * - Changes trigger notifications and audit events
 */
export class BorrowerProfileService {
    private auditRepo: AuditLogRepository;
    private notificationRepo: NotificationRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationRepo = new NotificationRepository();
    }

    /**
     * Get borrower profile
     *
     * SQL:
     * SELECT
     *   u.id,
     *   u.email,
     *   u.first_name,
     *   u.last_name,
     *   u.phone,
     *   u.date_of_birth,
     *   u.role_id,
     *   us.code as status_name,
     *   u.level as verification_level,
     *   u.created_at,
     *   u.updated_at,
     *   CASE WHEN u2fa.id IS NOT NULL THEN 1 ELSE 0 END as twoFAEnabled
     * FROM users u
     * LEFT JOIN user_statuses us ON us.id = u.status_id
     * LEFT JOIN user_2fa u2fa ON u2fa.user_id = u.id AND u2fa.is_enabled = 1
     * WHERE u.id = ?
     */
    async getProfile(borrowerId: string): Promise<ProfileDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);

            // TODO: Query user profile
            const profile: ProfileDto = {
                id: borrowerIdNum,
                email: 'borrower@example.com',
                firstName: 'John',
                lastName: 'Doe',
                phone: '+48501234567',
                dateOfBirth: '1990-01-15',
                roleId: 2, // BORROWER
                statusId: 1,
                statusName: 'ACTIVE',
                verificationLevel: 2,
                createdAt: '2025-01-01',
                updatedAt: '2026-01-01',
                twoFAEnabled: true,
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
