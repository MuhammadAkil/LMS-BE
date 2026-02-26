import { Controller, Get, Patch, Body, Param, QueryParam, UseBefore, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminConfigService } from '../service/AdminConfigService';
import { AdminGuard, SuperAdminGuard, CriticalOperationGuard } from '../middleware/AdminGuards';
import {
  PlatformConfigDto,
  UpdateLoanRulesRequest,
  UpdateLevelRulesRequest,
  UpdateFeesRequest,
  UpdateRemindersRequest,
  UpdateRetentionRequest,
} from '../dto/AdminDtos';

/**
 * Admin Configuration Controller
 * Endpoints for platform-wide configuration management
 * Configurations are versioned - each update increments version
 *
 * Routes:
 * - GET   /admin/config                 -> List all configs (AdminGuard)
 * - GET   /admin/config/:key            -> Get config by key (AdminGuard)
 * - GET   /admin/config/:key/history    -> Get version history (AdminGuard)
 * - PATCH /admin/config/loan-rules      -> Update loan rules (SuperAdminGuard)
 * - PATCH /admin/config/level-rules     -> Update level rules (SuperAdminGuard)
 * - PATCH /admin/config/fees            -> Update fees (SuperAdminGuard)
 * - PATCH /admin/config/reminders       -> Update reminders (SuperAdminGuard)
 * - PATCH /admin/config/retention       -> Update retention (CriticalOperationGuard)
 */
@Controller('/admin/config')
@UseBefore(AdminGuard)
export class AdminConfigController {
  private readonly configService: AdminConfigService;

  constructor() {
    this.configService = new AdminConfigService();
  }

  /**
   * GET /admin/config
   * Returns all platform configurations
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   *
   * Response: PlatformConfigDto[]
   * Each config includes: id, key, value, description, version, createdAt, updatedAt
   */
  @Get('/')
  async getAllConfig(
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number
  ): Promise<PlatformConfigDto[]> {
    const result = await this.configService.getAllConfig(limit || 20, offset || 0);
    return result.data || [];
  }

  /**
   * GET /admin/config/:key
   * Returns specific configuration by key
   *
   * Path Parameters:
   * - key: string (e.g., LOAN_RULES, FEES_CONFIG)
   *
   * Response: PlatformConfigDto with version and history
   */
  @Get('/:key')
  async getConfigByKey(@Param('key') key: string): Promise<PlatformConfigDto> {
    return this.configService.getConfigByKey(key);
  }

  /**
   * GET /admin/config/:key/history
   * Returns version history of a configuration
   * Used for understanding changes and potential rollbacks
   *
   * Path Parameters:
   * - key: string
   *
   * Query Parameters:
   * - limit: number (default 10)
   *
   * Response: PlatformConfigDto[] (all versions)
   */
  @Get('/:key/history')
  async getConfigHistory(
    @Param('key') key: string,
    @QueryParam('limit') limit?: number
  ): Promise<PlatformConfigDto[]> {
    return this.configService.getConfigHistory(key, limit || 10);
  }

  /**
   * PATCH /admin/config/loan-rules
   * Updates loan eligibility and approval rules
   * Requires SuperAdminGuard
   *
   * Body: UpdateLoanRulesRequest
   * - maxLoanAmount: number
   * - minLoanAmount: number
   * - maxRepaymentMonths: number
   * - interestRate: number
   * - minCreditScore: number (optional)
   * - maxDTIRatio: number (optional)
   *
   * Effects:
   * - Updates LOAN_RULES config
   * - Increments version
   * - Logs CONFIG_LOAN_RULES_UPDATED
   * - Notifies admins of change
   *
   * Response: PlatformConfigDto
   */
  @Patch('/loan-rules')
  @UseBefore(SuperAdminGuard)
  async updateLoanRules(@Body() request: UpdateLoanRulesRequest, @Req() req: Request): Promise<PlatformConfigDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.configService.updateLoanRules(request, adminId);
  }

  /**
   * PATCH /admin/config/level-rules
   * Updates user verification level upgrade rules
   * Requires SuperAdminGuard
   *
   * Body: UpdateLevelRulesRequest
   * - level1: { minVerifications: number, ... }
   * - level2: { minVerifications: number, ... }
   * - ...
   *
   * Response: PlatformConfigDto
   */
  @Patch('/level-rules')
  @UseBefore(SuperAdminGuard)
  async updateLevelRules(@Body() request: UpdateLevelRulesRequest, @Req() req: Request): Promise<PlatformConfigDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.configService.updateLevelRules(request, adminId);
  }

  /**
   * PATCH /admin/config/fees
   * Updates platform fee structure
   * Requires SuperAdminGuard
   *
   * Body: UpdateFeesRequest
   * - originationFeePercent: number
   * - servicingFeePercent: number
   * - lateFeePercent: number
   * - prepaymentPenaltyPercent: number (optional)
   *
   * Response: PlatformConfigDto
   */
  @Patch('/fees')
  @UseBefore(SuperAdminGuard)
  async updateFees(@Body() request: UpdateFeesRequest, @Req() req: Request): Promise<PlatformConfigDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.configService.updateFees(request, adminId);
  }

  /**
   * PATCH /admin/config/reminders
   * Updates notification reminder settings
   * Requires SuperAdminGuard
   *
   * Body: UpdateRemindersRequest
   * - paymentDueReminderDays: number
   * - overdueLoanReminderDays: number
   * - verificationPendingReminderDays: number
   *
   * Response: PlatformConfigDto
   */
  @Patch('/reminders')
  @UseBefore(SuperAdminGuard)
  async updateReminders(@Body() request: UpdateRemindersRequest, @Req() req: Request): Promise<PlatformConfigDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.configService.updateReminders(request, adminId);
  }

  /**
   * PATCH /admin/config/retention
   * Updates data retention and privacy policy
   * CRITICAL OPERATION - Requires SuperAdmin + 2FA
   *
   * Body: UpdateRetentionRequest
   * - retentionPeriodDays: number
   * - auditLogRetentionDays: number
   * - gdprComplianceLevel: string
   * - anonymizationEnabled: boolean
   * - reason: string (required - must explain change)
   *
   * Effects:
   * - Updates RETENTION_POLICY config
   * - Increments version
   * - Logs CONFIG_RETENTION_UPDATED with CRITICAL flag
   * - Notifies SuperAdmins of policy change
   * - Triggers compliance audit
   *
   * Response: PlatformConfigDto
   * Error: 403 if not CriticalOperationGuard authorized
   */
  @Patch('/retention')
  @UseBefore(CriticalOperationGuard)
  async updateRetention(@Body() request: UpdateRetentionRequest, @Req() req: Request): Promise<PlatformConfigDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.configService.updateRetention(request, adminId);
  }
}
