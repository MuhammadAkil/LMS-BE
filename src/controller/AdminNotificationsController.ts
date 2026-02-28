import { Controller, Get, Post, Put, Patch, Param, QueryParam, UseBefore, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminAuditService } from '../service/AdminAuditService';
import { AdminGuard } from '../middleware/AdminGuards';

/**
 * Admin Notifications Controller
 * Admin inbox for system alerts and notifications
 *
 * Routes:
 * - GET   /admin/notifications                  -> Get admin notifications (AdminGuard)
 * - GET   /admin/notifications/unread           -> Get unread notifications (AdminGuard)
 * - PATCH /admin/notifications/:id/read         -> Mark notification as read (AdminGuard)
 * - PATCH /admin/notifications/mark-all-read    -> Mark all notifications as read (AdminGuard)
 */
@Controller('/admin/notifications')
@UseBefore(AdminGuard)
export class AdminNotificationsController {
  private readonly auditService: AdminAuditService;

  constructor() {
    this.auditService = new AdminAuditService();
  }

  /**
   * GET /admin/notifications
   * Returns paginated list of admin notifications
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   * - unreadOnly: boolean (optional, filter to unread only)
   *
   * Response: Notification[]
   */
  @Get('/')
  async getNotifications(
    @Req() req: Request,
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number,
    @QueryParam('unreadOnly') unreadOnly?: boolean
  ) {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found in request');

    const lim = limit || 20;
    const off = offset || 0;

    const unreadRaw = await this.auditService.getUnreadNotifications(adminId, 1000);
    const unreadItems = Array.isArray(unreadRaw) ? unreadRaw : [];
    const unreadCount = unreadItems.length;

    let rawItems: any[];
    if (unreadOnly) {
      rawItems = unreadItems.slice(off, off + lim);
    } else {
      const result = await this.auditService.getUserNotifications(adminId, lim, off);
      rawItems = Array.isArray(result) ? result : (result as any)[0] ?? [];
    }

    const notifications = rawItems.map((n: any) => ({
      id: n.id,
      type: n.type || 'SYSTEM',
      title: n.title || n.payload && (() => { try { return JSON.parse(n.payload)?.title; } catch { return null; } })() || 'Notification',
      message: n.message || n.payload && (() => { try { return JSON.parse(n.payload)?.message; } catch { return null; } })() || '',
      isRead: n.read ?? n.isRead ?? false,
      createdAt: n.createdAt,
      readAt: n.readAt || null,
    }));

    const total = Array.isArray(unreadOnly ? unreadItems : rawItems) ? (unreadOnly ? unreadItems.length : rawItems.length) : 0;

    return {
      statusCode: '200',
      statusMessage: 'OK',
      data: {
        notifications,
        unreadCount,
        pagination: {
          page: Math.floor(off / lim) + 1,
          pageSize: lim,
          totalItems: total,
          totalPages: Math.ceil(total / lim),
        },
      },
    };
  }

  /**
   * GET /admin/notifications/unread
   * Returns unread notifications count and list
   *
   * Response: { notifications: Notification[], count: number }
   */
  @Get('/unread')
  async getUnreadNotifications(
    @Req() req: Request,
    @QueryParam('limit') limit?: number
  ) {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found in request');

    const notifications = await this.auditService.getUnreadNotifications(adminId, limit || 20);
    return {
      notifications,
      count: Array.isArray(notifications) ? notifications.length : 0,
    };
  }

  /**
   * PATCH /admin/notifications/:id/read
   * Marks a specific notification as read
   *
   * Response: { success: boolean }
   */
  @Put('/:id/read')
  @Patch('/:id/read')
  async markAsRead(@Param('id') notificationId: number) {
    await this.auditService.markNotificationAsRead(notificationId);
    return { success: true, message: 'Notification marked as read' };
  }

  /**
   * PATCH /admin/notifications/mark-all-read
   * Marks all admin notifications as read
   * Note: This endpoint must be declared before /:id/read to avoid route conflict
   *
   * Response: { success: boolean }
   */
  @Post('/mark-all-read')
  @Patch('/mark-all-read')
  async markAllAsRead(@Req() req: Request) {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found in request');

    const notifications = await this.auditService.getUnreadNotifications(adminId, 1000);
    const items = Array.isArray(notifications) ? notifications : [];
    await Promise.all(items.map((n: any) => this.auditService.markNotificationAsRead(n.id)));

    return { success: true, message: `${items.length} notifications marked as read` };
  }
}
