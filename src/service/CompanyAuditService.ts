import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
import { AuditLog } from '../domain/AuditLog';
import { Notification } from '../domain/Notification';

/**
 * Company Audit Service
 * Cross-cutting concerns utility for all company actions
 *
 * Fintech compliance:
 * Ensures every write action:
 * 1. Creates audit log entry (immutable event record)
 * 2. Triggers notification event
 * 3. Maintains regulatory audit trail
 */
export class CompanyAuditService {
    private auditLogRepo: AuditLogRepository;
    private notificationRepo: NotificationRepository;

    constructor() {
        this.auditLogRepo = new AuditLogRepository();
        this.notificationRepo = new NotificationRepository();
    }

    /**
     * Log company action
     * Immutable write to audit_logs table
     * Fintech rule: All write operations must be auditable
     */
    async logAction(
        actorId: number,
        action: string,
        entity: string,
        entityId: number,
        metadata?: Record<string, any>
    ): Promise<AuditLog> {
        const auditLog = new AuditLog();
        auditLog.userId = actorId;
        auditLog.action = action;
        auditLog.entity = entity;
        auditLog.entityId = entityId;
        auditLog.metadata = metadata ? JSON.stringify(metadata) : undefined;

        return await this.auditLogRepo.create(auditLog);
    }

    /**
     * Create notification event
     * Allows company users to see action results in real-time
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
     * Broadcast notification to multiple users (e.g., admin, company admins)
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
     * Combined operation ensuring consistency
     */
    async logAndNotify(
        actorId: number,
        action: string,
        entity: string,
        entityId: number,
        affectedUserId: number,
        payload: Record<string, any>,
        metadata?: Record<string, any>
    ): Promise<{ audit: AuditLog; notification: Notification }> {
        const audit = await this.logAction(actorId, action, entity, entityId, metadata);
        const notification = await this.notifyUser(affectedUserId, action, payload);

        return { audit, notification };
    }

    /**
     * Validation audit log
     * Used for gating rule violations, access denied events
     */
    async logValidationFailure(
        actorId: number,
        action: string,
        entity: string,
        entityId: number,
        reason: string
    ): Promise<AuditLog> {
        return this.logAction(
            actorId,
            `${action}_REJECTED`,
            entity,
            entityId,
            { reason, timestamp: new Date() }
        );
    }
}
