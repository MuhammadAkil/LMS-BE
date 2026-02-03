import { Request, Response } from 'express';
import { Controller, Get, Put, Param, Req, Res } from 'routing-controllers';
import { BorrowerNotificationsService } from '../service/BorrowerNotificationsService';
import {
    NotificationListResponse,
    MarkNotificationReadRequest,
    MarkNotificationReadResponse,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';

/**
 * B-08: BORROWER NOTIFICATIONS CONTROLLER
 * Endpoints:
 * - GET /api/borrower/notifications
 * - PUT /api/borrower/notifications/:id/read
 * - PUT /api/borrower/notifications/mark-all-read
 * Guards: BorrowerRoleGuard, BorrowerStatusGuard(allowReadOnly=true), BorrowerVerificationGuard(level=0)
 */
@Controller('/borrower/notifications')
export class BorrowerNotificationsController {
    private notificationsService: BorrowerNotificationsService;

    constructor() {
        this.notificationsService = new BorrowerNotificationsService();
    }

    /**
     * GET /api/borrower/notifications
     * Get notifications (paginated)
     * Query params: page, pageSize
     */
    @Get('/')
    async getNotificationsPaginated(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const page = parseInt(req.query.page as string) || 1;
            const pageSize = parseInt(req.query.pageSize as string) || 10;

            const result = await this.notificationsService.getNotificationsPaginated(
                borrowerId,
                page,
                pageSize
            );

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Notifications retrieved successfully',
                data: result,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<NotificationListResponse>);
        } catch (error: any) {
            console.error('Error in getNotificationsPaginated:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PUT /api/borrower/notifications/:id/read
     * Mark specific notification as read
     */
    @Put('/:id/read')
    async markNotificationRead(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const notificationId = parseInt(req.params.id, 10);

            const request: MarkNotificationReadRequest = {
                notificationId,
            };

            const response = await this.notificationsService.markNotificationRead(
                borrowerId,
                request
            );

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Notification marked as read',
                data: response,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<MarkNotificationReadResponse>);
        } catch (error: any) {
            console.error('Error in markNotificationRead:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PUT /api/borrower/notifications/mark-all-read
     * Mark all unread notifications as read
     */
    @Put('/mark-all-read')
    async markAllNotificationsRead(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();

            const request: MarkNotificationReadRequest = {
                notificationId: undefined, // Undefined means mark all
            };

            const response = await this.notificationsService.markNotificationRead(
                borrowerId,
                request
            );

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'All notifications marked as read',
                data: response,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<MarkNotificationReadResponse>);
        } catch (error: any) {
            console.error('Error in markAllNotificationsRead:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
