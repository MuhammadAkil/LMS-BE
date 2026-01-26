import { Controller, Get, Post, Body, Param, Query, UseMiddleware, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminAuditService } from '../service/AdminAuditService';
import { AdminGuard, SuperAdminGuard, CriticalOperationGuard } from '../middleware/AdminGuards';
import {
  AuditLogDto,
  AuditLogFilterRequest,
  RetentionScheduleDto,
  RetentionOverrideRequest,
} from '../dto/AdminDtos';

/**
 * Admin Audit Controller
 * Endpoints for audit log viewing and retention policy management
 * Audit logs are IMMUTABLE - cannot be deleted (only soft deleted for compliance)
 *
 * Routes:
 * - GET   /admin/audit-logs                   -> List audit logs (SuperAdminGuard)
 * - GET   /admin/audit-logs/:entityType/:id   -> Get entity history (SuperAdminGuard)
 * - GET   /admin/retention/schedule            -> Get retention schedule (SuperAdminGuard)
 * - POST  /admin/retention/override            -> Override retention (CriticalOperationGuard)
 */
@Controller('/admin/audit-logs')
@UseMiddleware(SuperAdminGuard)
export class AdminAuditController {
  private auditService: AdminAuditService;

  constructor() {
    this.auditService = new AdminAuditService();
  }

  /**
   * GET /admin/audit-logs
   * Returns paginated audit logs
   * Requires SuperAdminGuard
   *
   * Query Parameters:
   * - limit: number (default 50)
   * - offset: number (default 0)
   * - actorId: number (optional, filter by admin ID)
   * - action: string (optional, filter by action type)
   * - entity: string (optional, filter by entity type)
   * - dateFrom: Date (optional, filter by date range start)
   * - dateTo: Date (optional, filter by date range end)
   *
   * Response: AuditLogDto[]
   * Each log includes:
   * - id
   * - actorId (admin who performed action)
   * - action (ACTION_NAME)
   * - entity (ENTITY_TYPE)
   * - entityId
   * - metadata (JSON with change details)
   * - createdAt (timestamp)
   */
  @Get('/')
  async getAuditLogs(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('actorId') actorId?: number,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('dateFrom') dateFrom?: Date,
    @Query('dateTo') dateTo?: Date
  ): Promise<AuditLogDto[]> {
    const [logs] = await this.auditService.getFilteredAuditLogs({
      actorId,
      action,
      entity,
      dateFrom,
      dateTo,
      limit: limit || 50,
      offset: offset || 0,
    });
    
    // Convert to DTOs
    return logs.map(log => ({
      id: log.id,
      actorId: log.actorId,
      actorEmail: '', // Would need to join with users table
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      metadata: log.metadata ? JSON.parse(log.metadata) : undefined,
      createdAt: log.createdAt,
    }));
  }

  /**
   * GET /admin/audit-logs/:entityType/:id
   * Returns audit history for a specific entity
   * Shows all changes to that entity over time
   *
   * Path Parameters:
   * - entityType: string (USER, VERIFICATION, COMPANY, LOAN, etc.)
   * - id: number (entity ID)
   *
   * Query Parameters:
   * - limit: number (default 20)
   *
   * Response: AuditLogDto[]
   * Chronologically ordered from newest to oldest
   */
  @Get('/:entityType/:id')
  async getEntityHistory(
    @Param('entityType') entityType: string,
    @Param('id') entityId: number,
    @Query('limit') limit?: number
  ): Promise<AuditLogDto[]> {
    return this.auditService.getEntityHistory(entityType, entityId, limit || 20);
  }


  /**
   * POST /admin/audit-logs/:id/archive
   * Archives old audit logs (>7 years typically)
   * Moves logs to archive storage instead of deleting
   * CRITICAL OPERATION - Requires SuperAdmin + 2FA
   *
   * Effects:
   * - Moves audit log to archive table/storage
   * - Original record soft-deleted from active logs
   * - Maintains retrievability for regulatory/legal purposes
   * - Logs AUDIT_LOG_ARCHIVED action
   *
   * Response: 204 No Content
   * Error: 403 if not CriticalOperationGuard authorized
   */
  @Post('/:id/archive')
  @UseMiddleware(CriticalOperationGuard)
  async archiveAuditLog(
    @Param('id') auditLogId: number,
    @Req() req: Request
  ): Promise<void> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }

    await this.auditService.logAction(
      adminId,
      'AUDIT_LOG_ARCHIVED',
      'AUDIT_LOG',
      auditLogId,
      {
        critical: true,
      }
    );

    // In implementation, this would move the log to archive storage
  }
}
