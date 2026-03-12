import { Body, Controller, Get, Patch, Post, Put, Req, Res, UseBefore } from 'routing-controllers';
import { Request, Response } from 'express';
import { NotificationRepository } from '../repository/NotificationRepository';
import { Notification } from '../domain/Notification';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { LenderRoleGuard } from '../middleware/LenderGuards';

/**
 * LENDER NOTIFICATIONS CONTROLLER
 * GET   /lender/notifications
 * PATCH /lender/notifications/:id/read
 */
@Controller('/lender')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderNotificationsController {
    private notificationRepo: NotificationRepository;

    constructor() {
        this.notificationRepo = new NotificationRepository();
    }

    private mapToDto(n: Notification): object {
        let title = n.type;
        let message = '';
        try {
            const payload =
                typeof n.payload === 'string' ? JSON.parse(n.payload || '{}') : n.payload || {};
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
            readAt: n.readAt?.toISOString?.() ?? null,
        };
    }

    /**
     * GET /lender/notifications
     * Returns paginated notifications for the authenticated lender
     */
    @Get('/notifications')
    async getNotifications(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const page = Math.max(1, parseInt((req.query.page as string) || '1'));
            const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || '20')));
            const offset = (page - 1) * pageSize;

            const [notifications, totalItems] = await this.notificationRepo.findByUserId(
                lenderId,
                pageSize,
                offset
            );

            const unreadCount = notifications.filter((n) => !n.read).length;

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Notifications retrieved successfully',
                data: {
                    notifications: notifications.map((n) => this.mapToDto(n)),
                    totalCount: totalItems,
                    unreadCount,
                    pagination: {
                        page,
                        pageSize,
                        totalItems,
                        totalPages: Math.ceil(totalItems / pageSize),
                    },
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in LenderNotificationsController.getNotifications:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve notifications',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PATCH /lender/notifications/:id/read
     * Mark a specific notification as read
     */
    @Put('/notifications/:id/read')
    @Patch('/notifications/:id/read')
    async markAsRead(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const notificationId = parseInt(req.params.id);
            if (isNaN(notificationId)) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid notification ID',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const notification = await this.notificationRepo.findById(notificationId);
            if (!notification) {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'Notification not found',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            if (notification.userId !== lenderId) {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Forbidden: Notification does not belong to this user',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const updated = await this.notificationRepo.markAsRead(notificationId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Notification marked as read',
                data: updated ? this.mapToDto(updated) : null,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in LenderNotificationsController.markAsRead:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to mark notification as read',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PUT|PATCH /lender/notifications/read
     * Mark multiple notifications as read by ids.
     * Body: { ids: number[] }
     */
    @Put('/notifications/read')
    @Patch('/notifications/read')
    async markMultipleAsRead(
        @Req() req: Request,
        @Res() res: Response,
        @Body() body?: { ids?: Array<number | string> }
    ): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const ids = Array.isArray(body?.ids) ? body!.ids : [];
            const normalizedIds = ids
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0);

            if (!normalizedIds.length) {
                res.status(200).json({
                    statusCode: '200',
                    statusMessage: 'No notifications selected',
                    data: { updatedCount: 0 },
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const [owned] = await this.notificationRepo.findByUserId(lenderId, 1000, 0);
            const ownedIdSet = new Set((owned || []).map((n) => n.id));
            const authorizedIds = normalizedIds.filter((id) => ownedIdSet.has(id));

            await this.notificationRepo.markMultipleAsRead(authorizedIds);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Notifications marked as read',
                data: { updatedCount: authorizedIds.length },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in LenderNotificationsController.markMultipleAsRead:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to mark notifications as read',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PUT|PATCH|POST /lender/notifications/mark-all-read
     * Mark all unread notifications for this lender as read.
     */
    @Post('/notifications/mark-all-read')
    @Put('/notifications/mark-all-read')
    @Patch('/notifications/mark-all-read')
    async markAllAsRead(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const unread = await this.notificationRepo.findUnreadByUserId(lenderId, 5000);
            const unreadIds = unread.map((n) => n.id);
            await this.notificationRepo.markMultipleAsRead(unreadIds);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'All notifications marked as read',
                data: { updatedCount: unreadIds.length },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in LenderNotificationsController.markAllAsRead:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to mark all notifications as read',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
