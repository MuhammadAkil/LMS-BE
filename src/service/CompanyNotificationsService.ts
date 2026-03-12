import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import {
    CompanyNotificationResponse,
    NotificationsListResponse,
    CompanyPaginationQuery,
} from '../dto/CompanyDtos';

/**
 * Company Notifications Service
 * Manages company user notifications
 *
 * Fintech compliance:
 * - Notifications scoped to user (via user_id)
 * - Only company users can see their notifications
 * - Mark as read creates audit log
 * - Notifications tied to events (agreement signed, rules created, etc.)
 */
export class CompanyNotificationsService {
    private auditService: CompanyAuditService;

    constructor() {
        this.auditService = new CompanyAuditService();
    }

    /**
     * Get paginated notifications for user
     * Fintech compliance:
     * - User sees only their notifications
     * - Unread count provided for UI
     */
    async getNotifications(
        userId: number,
        query: CompanyPaginationQuery
    ): Promise<NotificationsListResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const page = query.page || 1;
            const pageSize = Math.min(query.pageSize || 20, 100);
            const offset = (page - 1) * pageSize;

            // Get notifications for user
            const notifications = await queryRunner.query(
                `
        SELECT 
          id,
          type,
          payload,
          read,
          created_at as createdAt
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        `,
                [userId, pageSize, offset]
            );

            // Get total count
            const countResult = await queryRunner.query(
                `
        SELECT COUNT(*) as total
        FROM notifications
        WHERE user_id = ?
        `,
                [userId]
            );

            const total = parseInt(countResult[0]?.total || 0);
            const pages = Math.ceil(total / pageSize);

            // Get unread count
            const unreadResult = await queryRunner.query(
                `
        SELECT COUNT(*) as unreadCount
        FROM notifications
        WHERE user_id = ? AND read = false
        `,
                [userId]
            );

            const unreadCount = parseInt(unreadResult[0]?.unreadCount || 0);

            // Parse notifications
            const notificationList: CompanyNotificationResponse[] = notifications.map((row: any) => {
                let payload: Record<string, any> = {};
                try {
                    payload = row.payload ? JSON.parse(row.payload) : {};
                } catch (e) {
                    // Silent fail on JSON parse
                }

                return {
                    id: row.id,
                    type: row.type,
                    title: this.getTitleForType(row.type),
                    message: (payload as any).message || this.getMessageForType(row.type),
                    payload,
                    read: Boolean(row.read),
                    createdAt: row.createdAt,
                };
            });

            return {
                notifications: notificationList,
                unreadCount,
                pagination: {
                    page,
                    pageSize,
                    total,
                    pages,
                },
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Mark notification as read
     * Fintech compliance:
     * - Creates audit log for compliance
     * - User can only mark their own notifications
     */
    async markAsRead(userId: number, notificationId: number): Promise<CompanyNotificationResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Verify notification belongs to user
            const notification = await queryRunner.query(
                `
        SELECT id, type, payload, read
        FROM notifications
        WHERE id = ? AND user_id = ?
        `,
                [notificationId, userId]
            );

            if (!notification || notification.length === 0) {
                throw new Error('Notification not found');
            }

            // Update read flag
            await queryRunner.query(
                `
        UPDATE notifications
        SET read = true
        WHERE id = ?
        `,
                [notificationId]
            );

            // Create audit log
            await this.auditService.logAction(
                userId,
                'NOTIFICATION_READ',
                'NOTIFICATION',
                notificationId,
                {
                    type: notification[0].type,
                }
            );

            // Parse and return notification
            let payload: Record<string, any> = {};
            try {
                payload = notification[0].payload ? JSON.parse(notification[0].payload) : {};
            } catch (e) {
                // Silent fail
            }

            return {
                id: notification[0].id,
                type: notification[0].type,
                title: this.getTitleForType(notification[0].type),
                message: (payload as any).message || this.getMessageForType(notification[0].type),
                payload,
                read: true,
                createdAt: new Date(),
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Mark multiple notifications as read by ids.
     * Returns number of rows updated for current user scope.
     */
    async markMultipleAsRead(userId: number, ids: Array<number | string>): Promise<{ updatedCount: number }> {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            const normalizedIds = (ids || [])
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0);

            if (!normalizedIds.length) {
                return { updatedCount: 0 };
            }

            const placeholders = normalizedIds.map(() => '?').join(', ');
            const result = await queryRunner.query(
                `
        UPDATE notifications
        SET read = true
        WHERE user_id = ? AND read = false AND id IN (${placeholders})
        `,
                [userId, ...normalizedIds]
            );

            const updatedCount = Number(result?.affectedRows ?? result?.rowCount ?? 0);
            if (updatedCount > 0) {
                await this.auditService.logAction(
                    userId,
                    'NOTIFICATIONS_READ_BULK',
                    'NOTIFICATION',
                    undefined,
                    { ids: normalizedIds, updatedCount }
                );
            }

            return { updatedCount };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Mark all unread notifications as read for the user.
     */
    async markAllAsRead(userId: number): Promise<{ updatedCount: number }> {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            const result = await queryRunner.query(
                `
        UPDATE notifications
        SET read = true
        WHERE user_id = ? AND read = false
        `,
                [userId]
            );

            const updatedCount = Number(result?.affectedRows ?? result?.rowCount ?? 0);
            if (updatedCount > 0) {
                await this.auditService.logAction(
                    userId,
                    'NOTIFICATIONS_READ_ALL',
                    'NOTIFICATION',
                    undefined,
                    { updatedCount }
                );
            }
            return { updatedCount };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get user-friendly title for notification type
     */
    private getTitleForType(type: string): string {
        const titles: Record<string, string> = {
            AGREEMENT_SIGNED: 'Agreement Signed',
            AUTOMATION_RULE_CREATED: 'Automation Rule Created',
            AUTOMATION_RULE_UPDATED: 'Automation Rule Updated',
            AUTOMATION_RULE_DELETED: 'Automation Rule Deleted',
            LENDER_LINKED: 'Lender Linked',
            LENDER_UPDATED: 'Lender Updated',
            LENDER_TOGGLED: 'Lender Status Changed',
            COMPANY_LINKED: 'Company Link Established',
            EXPORT_CREATED: 'Export Created',
            BULK_CLAIMS_CREATED: 'Bulk Claims Created',
            COMPANY_PROFILE_UPDATED: 'Profile Updated',
            NOTIFICATION_READ: 'Notification Marked as Read',
        };

        return titles[type] || type;
    }

    /**
     * Get default message for notification type
     */
    private getMessageForType(type: string): string {
        const messages: Record<string, string> = {
            AGREEMENT_SIGNED: 'Your management agreement has been signed successfully.',
            AUTOMATION_RULE_CREATED: 'A new automation rule has been created.',
            AUTOMATION_RULE_UPDATED: 'An automation rule has been updated.',
            AUTOMATION_RULE_DELETED: 'An automation rule has been deleted.',
            LENDER_LINKED: 'A lender has been linked to your company.',
            LENDER_UPDATED: 'A lender link has been updated.',
            LENDER_TOGGLED: 'A lender status has been changed.',
            COMPANY_LINKED: 'You have been linked to a new company.',
            EXPORT_CREATED: 'Your data export is ready.',
            BULK_CLAIMS_CREATED: 'Bulk claims have been created.',
            COMPANY_PROFILE_UPDATED: 'Your company profile has been updated.',
            NOTIFICATION_READ: 'This notification has been marked as read.',
        };

        return messages[type] || 'You have a new notification.';
    }
}
