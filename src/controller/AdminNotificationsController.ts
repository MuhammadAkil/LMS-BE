import { Controller, Get, Post, Put, Patch, Param, QueryParam, UseBefore, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminAuditService } from '../service/AdminAuditService';
import { AdminGuard } from '../middleware/AdminGuards';

function parseNotificationPayload(payload: string | undefined | null): Record<string, unknown> {
  if (payload == null || payload === '') return {};
  try {
    const v = JSON.parse(payload) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function humanizeNotificationType(type: string): string {
  if (!type) return 'System notification';
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function summarizePayload(p: Record<string, unknown>): string {
  const skip = new Set(['title', 'message', 'subject', 'body', 'description']);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (skip.has(k) || v == null || typeof v === 'object') continue;
    parts.push(`${k}: ${String(v)}`);
  }
  return parts.slice(0, 4).join(' · ');
}

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
    let totalItems: number;
    if (unreadOnly) {
      rawItems = unreadItems.slice(off, off + lim);
      totalItems = unreadItems.length;
    } else {
      // getUserNotifications returns TypeORM [rows, count] tuple — do not use the tuple as a list
      const result = await this.auditService.getUserNotifications(adminId, lim, off);
      const tuple = result as unknown as [any[], number];
      if (Array.isArray(tuple) && tuple.length === 2 && Array.isArray(tuple[0]) && typeof tuple[1] === 'number') {
        rawItems = tuple[0];
        totalItems = tuple[1];
      } else {
        rawItems = [];
        totalItems = 0;
      }
    }

    const notifications = rawItems.map((n: any) => {
      const parsed = parseNotificationPayload(n.payload);
      const titleFromPayload =
        (typeof parsed.title === 'string' && parsed.title) ||
        (typeof parsed.subject === 'string' && parsed.subject) ||
        '';
      const messageFromPayload =
        (typeof parsed.message === 'string' && parsed.message) ||
        (typeof parsed.body === 'string' && parsed.body) ||
        (typeof parsed.description === 'string' && parsed.description) ||
        '';
      const typeStr = n.type || 'SYSTEM';
      const title = n.title || titleFromPayload || humanizeNotificationType(typeStr);
      const message = n.message || messageFromPayload || summarizePayload(parsed) || '';
      const isRead = Boolean(n.read ?? n.isRead);
      return {
        id: n.id,
        userId: n.userId,
        type: typeStr,
        title,
        message,
        read: isRead,
        isRead,
        payload: n.payload,
        createdAt: n.createdAt,
        readAt: n.readAt || null,
      };
    });

    const total = totalItems;

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
          totalPages: Math.max(1, Math.ceil((total || 0) / lim)),
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
  @Put('/mark-all-read')
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
