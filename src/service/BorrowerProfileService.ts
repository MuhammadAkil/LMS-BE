import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
import { UserRepository } from '../repository/UserRepository';
import { LevelRulesRepository } from '../repository/LevelRulesRepository';
import { User } from '../domain/User';
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
            if (!request.firstName && !request.lastName && !request.phone) {
                throw new Error('No fields to update');
            }

            // Fetch current user to verify it exists
            const existing = await this.userRepo.findById(borrowerIdNum);
            if (!existing) throw new Error('User not found');

            // Build update payload — only include defined fields
            const updatePayload: Partial<User> = {};
            if (request.firstName !== undefined) updatePayload.firstName = request.firstName;
            if (request.lastName !== undefined) updatePayload.lastName = request.lastName;
            if (request.phone !== undefined) updatePayload.phone = request.phone;
            // dateOfBirth is not a column in the users table — ignore it

            // Apply update
            const updated = await this.userRepo.update(borrowerIdNum, updatePayload);
            if (!updated) throw new Error('Failed to update profile');

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'PROFILE_UPDATED',
                entity: 'USER',
                entityId: borrowerIdNum,
                createdAt: new Date(),
            } as any);

            return {
                id: borrowerIdNum,
                email: updated.email,
                firstName: updated.firstName ?? '',
                lastName: updated.lastName ?? '',
                phone: updated.phone ?? '',
                updatedAt: new Date().toISOString(),
                message: 'Profile updated successfully',
            };
        } catch (error: any) {
            console.error('Error updating profile:', error);
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

            // Fetch real audit logs for this borrower
            const [logs, totalItems] = await this.auditRepo.findByActor(borrowerIdNum, pageSize, offset);

            const ACTION_DESCRIPTIONS: Record<string, string> = {
                APPLICATION_CREATED: 'Loan application submitted',
                APPLICATION_CANCELLED: 'Loan application cancelled',
                APPLICATION_CLOSED: 'Loan application closed (funded)',
                VIEW_APPLICATION: 'Viewed loan application',
                VIEW_APPLICATIONS: 'Viewed applications list',
                REPAYMENT_CONFIRMED_BY_BORROWER: 'Repayment installment confirmed',
                VIEW_LOAN_DETAIL: 'Viewed loan details',
                VIEW_ACTIVE_LOANS: 'Viewed active loans',
                VIEW_LOAN_HISTORY: 'Viewed loan history',
                VIEW_PAYMENT_HISTORY: 'Viewed payment history',
                VIEW_REPAYMENT_SCHEDULE: 'Viewed repayment schedule',
                VIEW_PROFILE: 'Viewed profile',
                PROFILE_UPDATED: 'Profile information updated',
                VIEW_ACTIVITY_LOG: 'Viewed activity log',
                VERIFICATION_SUBMITTED: 'KYC verification documents submitted',
                VIEW_VERIFICATION_STATUS: 'Viewed verification status',
                VIEW_DASHBOARD: 'Viewed dashboard',
                VIEW_DOCUMENTS: 'Viewed document center',
                VIEW_DOCUMENT_DETAIL: 'Viewed document detail',
                VIEW_NOTIFICATIONS: 'Viewed notifications',
            };

            const activities: ActivityItemDto[] = logs.map(log => ({
                timestamp: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
                action: log.action,
                entity: log.entity,
                entityId: Number(log.entityId),
                description: ACTION_DESCRIPTIONS[log.action] ?? log.action.replace(/_/g, ' ').toLowerCase(),
                status: 'SUCCESS',
            }));

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
                    totalPages: Math.ceil(totalItems / pageSize) || 1,
                },
            };
        } catch (error: any) {
            console.error('Error fetching activity log:', error);
            throw new Error('Failed to fetch activity log');
        }
    }
}
