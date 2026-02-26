import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
import { AuditLog } from '../domain/AuditLog';
import { Notification } from '../domain/Notification';
import { AdminActionCode } from '../util/Enums';

/**
 * Cross-cutting concerns utility for all admin actions
 * Ensures every write action:
 * 1. Creates audit log entry
 * 2. Triggers notification event
 */
export class AdminAuditService {
  private auditLogRepo: AuditLogRepository;
  private notificationRepo: NotificationRepository;

  constructor() {
    this.auditLogRepo = new AuditLogRepository();
    this.notificationRepo = new NotificationRepository();
  }

  /**
   * Log admin action (optionally with client IP for GDPR/compliance)
   */
  async logAction(
    actorId: number,
    action: string,
    entity: string,
    entityId: number,
    metadata?: Record<string, any>,
    ip?: string
  ): Promise<AuditLog> {
    const auditLog = new AuditLog();
    auditLog.userId = actorId;
    auditLog.action = action;
    auditLog.entity = entity;
    auditLog.entityId = entityId;
    auditLog.metadata = metadata ? JSON.stringify(metadata) : undefined;
    auditLog.ip = ip ?? undefined;

    return await this.auditLogRepo.create(auditLog);
  }

  /**
   * Create notification event
   */
  async notifyUser(
    userId: number,
    type: string,
    payload: Record<string, any>
  ): Promise<Notification> {
    const notification = new Notification();
    notification.userId = userId;
    notification.type = type;
    notification.payload = JSON.stringify(payload);

    return await this.notificationRepo.create(notification);
  }

  /**
   * Broadcast notification to multiple users
   */
  async notifyMultiple(
    userIds: number[],
    type: string,
    payload: Record<string, any>
  ): Promise<Notification[]> {
    const promises = userIds.map(userId =>
      this.notifyUser(userId, type, payload)
    );
    return Promise.all(promises);
  }

  /**
   * Log action and notify affected user
   */
  async logAndNotify(
    actorId: number,
    action: string,
    entity: string,
    entityId: number,
    affectedUserId: number,
    notificationType: string,
    notificationPayload: Record<string, any>,
    auditMetadata?: Record<string, any>
  ): Promise<{ audit: AuditLog; notification: Notification }> {
    const audit = await this.logAction(
      actorId,
      action,
      entity,
      entityId,
      auditMetadata
    );

    const notification = await this.notifyUser(
      affectedUserId,
      notificationType,
      notificationPayload
    );

    return { audit, notification };
  }

  /**
   * Get audit logs for entity
   */
  async getEntityHistory(entity: string, entityId: number): Promise<AuditLog[]> {
    return await this.auditLogRepo.findByEntity(entity, entityId);
  }

  /**
   * Get audit logs by action
   */
  async getActionLogs(action: string, limit: number = 50, offset: number = 0) {
    return await this.auditLogRepo.findByAction(action, limit, offset);
  }

  /**
   * Get filtered audit logs with multiple filters
   */
  async getFilteredAuditLogs(filter: {
    actorId?: number;
    action?: string;
    entity?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<[AuditLog[], number]> {
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    // If specific filters are provided, use them
    if (filter.action && filter.entity) {
      return await this.auditLogRepo.findByActionAndEntity(filter.action, filter.entity, limit, offset);
    } else if (filter.action) {
      return await this.auditLogRepo.findByAction(filter.action, limit, offset);
    } else if (filter.actorId) {
      return await this.auditLogRepo.findByActor(filter.actorId, limit, offset);
    } else if (filter.dateFrom && filter.dateTo) {
      return await this.auditLogRepo.findByDateRange(filter.dateFrom, filter.dateTo, limit, offset);
    } else {
      // Default: return all logs
      return await this.auditLogRepo.findAll(limit, offset);
    }
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(userId: number, limit: number = 20, offset: number = 0) {
    return await this.notificationRepo.findByUserId(userId, limit, offset);
  }

  /**
   * Get unread notifications for user
   */
  async getUnreadNotifications(userId: number, limit: number = 20) {
    return await this.notificationRepo.findUnreadByUserId(userId, limit);
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: number) {
    return await this.notificationRepo.markAsRead(notificationId);
  }
}
