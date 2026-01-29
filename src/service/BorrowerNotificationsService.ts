import { AuditLogRepository } from '../repository/AuditLogRepository';
import {
    NotificationListResponse,
    NotificationListItemDto,
    MarkNotificationReadRequest,
    MarkNotificationReadResponse,
} from '../dto/BorrowerDtos';

/**
 * B-08: BORROWER NOTIFICATIONS SERVICE
 * Provides notification management
 *
 * Rules:
 * - Notifications only for logged-in borrower
 * - Includes: verification status, payment reminders, loan offers, etc.
 */
export class BorrowerNotificationsService {
    private auditRepo: AuditLogRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
    }

    /**
     * Get borrower's notifications (paginated)
     *
     * SQL:
     * SELECT
     *   n.id,
     *   nt.code as type,
     *   n.title,
     *   n.message,
     *   n.is_read,
     *   n.created_at,
     *   n.read_at
     * FROM notifications n
     * JOIN notification_types nt ON nt.id = n.notification_type_id
     * WHERE n.user_id = ?
     * ORDER BY n.created_at DESC
     */
    async getNotificationsPaginated(
        borrowerId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<NotificationListResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const offset = (page - 1) * pageSize;

            // TODO: Query notifications table
            const notifications: NotificationListItemDto[] = [];
            const totalItems = 0;
            let unreadCount = 0;

            // Sample data
            notifications.push({
                id: 1,
                type: 'VERIFICATION_REQUIRED',
                title: 'Verification Needed',
                message: 'Your email verification is required to proceed',
                isRead: false,
                createdAt: new Date().toISOString(),
            });

            notifications.push({
                id: 2,
                type: 'PAYMENT_DUE',
                title: 'Payment Due',
                message: 'Your loan repayment of 500 PLN is due on 2026-02-01',
                isRead: true,
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                readAt: new Date().toISOString(),
            });

            // Count unread
            unreadCount = notifications.filter((n) => !n.isRead).length;

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_NOTIFICATIONS',
                entity: 'NOTIFICATION',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                notifications,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
                unreadCount,
            };
        } catch (error: any) {
            console.error('Error fetching notifications:', error);
            throw new Error('Failed to fetch notifications');
        }
    }

    /**
     * Mark notification(s) as read
     *
     * SQL:
     * UPDATE notifications SET is_read = 1, read_at = NOW()
     * WHERE user_id = ? AND (id = ? OR ? IS NULL)
     *
     * If notificationId is null, marks all unread notifications as read
     */
    async markNotificationRead(
        borrowerId: string,
        request: MarkNotificationReadRequest
    ): Promise<MarkNotificationReadResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            let markedCount = 0;

            if (request.notificationId) {
                // Mark specific notification
                // TODO: UPDATE notifications SET is_read = 1, read_at = NOW()
                // WHERE id = ? AND user_id = ?
                markedCount = 1;
            } else {
                // Mark all unread as read
                // TODO: UPDATE notifications SET is_read = 1, read_at = NOW()
                // WHERE user_id = ? AND is_read = 0
                markedCount = 5; // Placeholder
            }

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'NOTIFICATION_READ',
                entity: 'NOTIFICATION',
                entityId: request.notificationId || 0,
                createdAt: new Date(),
            } as any);

            return {
                markedCount,
                message: `${markedCount} notification(s) marked as read`,
            };
        } catch (error: any) {
            console.error('Error marking notification as read:', error);
            throw new Error('Failed to mark notification as read');
        }
    }
}
