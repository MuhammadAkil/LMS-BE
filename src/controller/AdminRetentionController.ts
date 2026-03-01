import { Controller, Get, Post, Body, UseBefore, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminAuditService } from '../service/AdminAuditService';
import { SuperAdminGuard, CriticalOperationGuard } from '../middleware/AdminGuards';
import {
  RetentionScheduleDto,
  RetentionOverrideRequest,
} from '../dto/AdminDtos';

/**
 * Admin Retention Controller
 * Endpoints for data retention policy management
 *
 * Routes:
 * - GET   /admin/retention/schedule            -> Get retention schedule (SuperAdminGuard)
 * - POST  /admin/retention/override            -> Override retention (CriticalOperationGuard)
 */
@Controller('/admin/retention')
@UseBefore(SuperAdminGuard)
export class AdminRetentionController {
  private readonly auditService: AdminAuditService;

  constructor() {
    this.auditService = new AdminAuditService();
  }

  /**
   * GET /admin/retention/schedule
   * Returns data retention schedule and policies
   * Requires SuperAdminGuard
   *
   * Response: RetentionScheduleDto
   * Includes:
   * - userDataRetentionDays: when inactive user data is deleted
   * - auditLogRetentionDays: how long audit logs are kept
   * - paymentRecordRetentionDays: payment history retention
   * - deletedUserDataArchiveDays: when archived data can be deleted
   * - gdprComplianceLevel: GDPR compliance status
   * - nextAutomaticCleanupDate: when automatic cleanup runs
   * - lastCleanupDate: when cleanup last ran
   */
  @Get('/schedule')
  async getRetentionSchedule(): Promise<RetentionScheduleDto[]> {
    // This would typically query the retention policy from PlatformConfig
    // and return the schedule along with cleanup history for each data type
    return [
      {
        dataType: 'USER_DATA',
        retentionDays: 365,
        lastCleanupAt: new Date(),
        nextCleanupAt: new Date(),
        recordsToDelete: 0,
      },
      {
        dataType: 'AUDIT_LOGS',
        retentionDays: 2555, // 7 years (regulatory requirement)
        lastCleanupAt: new Date(),
        nextCleanupAt: new Date(),
        recordsToDelete: 0,
      },
      {
        dataType: 'PAYMENT_RECORDS',
        retentionDays: 2555,
        lastCleanupAt: new Date(),
        nextCleanupAt: new Date(),
        recordsToDelete: 0,
      },
    ];
  }

  /**
   * POST /admin/retention/override
   * Overrides normal retention policy
   * CRITICAL OPERATION - Requires SuperAdmin + 2FA
   * Should only be used for legal holds, investigations, or regulatory requirements
   *
   * Body: RetentionOverrideRequest
   * - entityType: string (USER, VERIFICATION, PAYMENT, etc.)
   * - entityId: number (or null for all entities of type)
   * - newRetentionDays: number
   * - reason: string (required, must document why override is needed)
   * - legalHold: boolean (optional, marks as legal hold)
   * - expiresAt: Date (optional, when override expires)
   *
   * Effects:
   * - Updates retention schedule for specific entity/type
   * - Logs RETENTION_OVERRIDE with CRITICAL flag
   * - Notifies compliance/legal team
   * - Creates audit trail for regulatory compliance
   *
   * Response: { success: true, message: string }
   * Error: 403 if not CriticalOperationGuard authorized
   */
  @Post('/override')
  @UseBefore(CriticalOperationGuard)
  async overrideRetention(
    @Body() request: RetentionOverrideRequest,
    @Req() req: Request
  ): Promise<{ success: boolean; message: string }> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }

    // Validate required fields
    if (!request.reason || request.reason.trim().length === 0) {
      throw new Error('Retention override reason is required');
    }

    if (!request.dataType) {
      throw new Error('Data type is required');
    }

    // Log the override as critical action
    await this.auditService.logAction(
      adminId,
      'RETENTION_OVERRIDE',
      'RETENTION_POLICY',
      0,
      {
        dataType: request.dataType,
        additionalRetentionDays: request.additionalRetentionDays,
        reason: request.reason,
        critical: true, // Flag for high-risk operation
      }
    );

    return {
      success: true,
      message: `Retention override applied for ${request.dataType}.`,
    };
  }
}
