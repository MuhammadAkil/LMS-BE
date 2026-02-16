import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
import {
    NotificationListResponse,
    NotificationListItemDto,
    MarkNotificationReadRequest,
    MarkNotificationReadResponse,
} from '../dto/BorrowerDtos';
import { Notification } from '../domain/Notification';

/**
 * B-08: BORROWER NOTIFICATIONS SERVICE
 * All notifications are stored and read from LMS MySQL (notifications table).
 * Payload is JSON: { title, message, ... } for display in list.
 */
export class BorrowerNotificationsService {
    private auditRepo: AuditLogRepository;
    private notificationRepo: NotificationRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationRepo = new NotificationRepository();
    }

    private mapToDto(n: Notification): NotificationListItemDto {
        let title = n.type;
        let message = '';
        try {
            const payload = typeof n.payload === 'string' ? JSON.parse(n.payload || '{}') : n.payload || {};
            title = payload.title ?? title;
            message = payload.message ?? message;
        } catch {
            // ignore
        }
        return {
            id: n.id,
            type: n.type,
            title,
            message,
            isRead: n.read,
            createdAt: n.createdAt?.toISOString?.() ?? new Date().toISOString(),
            readAt: n.readAt?.toISOString?.(),
        };
    }

    /**
     * Get borrower's notifications (paginated) from MySQL.
     */
    async getNotificationsPaginated(
        borrowerId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<NotificationListResponse> {
        const borrowerIdNum = parseInt(borrowerId, 10) || 0;
        const size = Math.min(Math.max(1, pageSize), 100);
        const offset = (page - 1) * size;

        const [notifications, totalItems] = await this.notificationRepo.findByUserId(
            borrowerIdNum,
            size,
            offset
        );
        const unreadCount = await this.notificationRepo.countUnreadByUserId(borrowerIdNum);

        await this.auditRepo.create({
            actorId: borrowerIdNum,
            action: 'VIEW_NOTIFICATIONS',
            entity: 'NOTIFICATION',
            entityId: 0,
            createdAt: new Date(),
        } as any);

        return {
            notifications: notifications.map((n) => this.mapToDto(n)),
            pagination: {
                page,
                pageSize: size,
                totalItems,
                totalPages: Math.ceil(totalItems / size) || 1,
            },
            unreadCount,
        };
    }

    /**
     * Mark notification(s) as read in MySQL.
     */
    async markNotificationRead(
        borrowerId: string,
        request: MarkNotificationReadRequest
    ): Promise<MarkNotificationReadResponse> {
        const borrowerIdNum = parseInt(borrowerId, 10) || 0;
        let markedCount = 0;

        if (request.notificationId != null && request.notificationId !== undefined) {
            const id = typeof request.notificationId === 'number'
                ? request.notificationId
                : parseInt(String(request.notificationId), 10);
            if (!isNaN(id)) {
                await this.notificationRepo.markAsRead(id);
                markedCount = 1;
            }
        } else {
            const unread = await this.notificationRepo.findUnreadByUserId(borrowerIdNum, 500);
            const ids = unread.map((n) => n.id);
            if (ids.length > 0) {
                await this.notificationRepo.markMultipleAsRead(ids);
                markedCount = ids.length;
            }
        }

        await this.auditRepo.create({
            actorId: borrowerIdNum,
            action: 'NOTIFICATION_READ',
            entity: 'NOTIFICATION',
            entityId: typeof request.notificationId === 'number' ? request.notificationId : 0,
            createdAt: new Date(),
        } as any);

        return {
            markedCount,
            message: `${markedCount} notification(s) marked as read`,
        };
    }

    /**
     * Mark multiple notifications as read by ids.
     */
    async markNotificationsReadByIds(
        borrowerId: string,
        ids: (number | string)[]
    ): Promise<MarkNotificationReadResponse> {
        if (!ids.length) {
            return { markedCount: 0, message: '0 notification(s) marked as read' };
        }
        const borrowerIdNum = parseInt(borrowerId, 10) || 0;
        const numIds = ids
            .map((id) => (typeof id === 'number' ? id : parseInt(String(id), 10)))
            .filter((id) => !isNaN(id));
        if (numIds.length > 0) {
            await this.notificationRepo.markMultipleAsRead(numIds);
        }
        await this.auditRepo.create({
            actorId: borrowerIdNum,
            action: 'NOTIFICATION_READ',
            entity: 'NOTIFICATION',
            entityId: 0,
            createdAt: new Date(),
        } as any);
        return {
            markedCount: numIds.length,
            message: `${numIds.length} notification(s) marked as read`,
        };
    }
}
