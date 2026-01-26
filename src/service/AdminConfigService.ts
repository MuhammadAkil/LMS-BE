import { PlatformConfigRepository } from '../repository/PlatformConfigRepository';
import { AdminAuditService } from './AdminAuditService';
import { PlatformConfig } from '../domain/PlatformConfig';
import { PlatformConfigDto, UpdateLoanRulesRequest, UpdateLevelRulesRequest, UpdateFeesRequest, UpdateRemindersRequest, UpdateRetentionRequest } from '../dto/AdminDtos';

/**
 * Admin Platform Configuration Service
 * Manages platform-wide settings
 * High-risk endpoints require super-admin
 */
export class AdminConfigService {
  private configRepo: PlatformConfigRepository;
  private auditService: AdminAuditService;

  constructor() {
    this.configRepo = new PlatformConfigRepository();
    this.auditService = new AdminAuditService();
  }

  /**
   * Get all configuration
   */
  async getAllConfig(limit: number = 100, offset: number = 0) {
    const [configs, total] = await this.configRepo.findAll(limit, offset);

    const dtos: PlatformConfigDto[] = configs.map(config => ({
      id: config.id,
      key: config.key,
      value: this.parseValue(config.value),
      description: config.description,
      version: config.version,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }));

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get specific config by key
   */
  async getConfigByKey(key: string): Promise<PlatformConfigDto | null> {
    const config = await this.configRepo.findByKey(key);
    if (!config) return null;

    return {
      id: config.id,
      key: config.key,
      value: this.parseValue(config.value),
      description: config.description,
      version: config.version,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Update loan rules
   */
  async updateLoanRules(request: UpdateLoanRulesRequest, adminId: number) {
    const rules = {
      minAmount: request.minAmount,
      maxAmount: request.maxAmount,
      minTenor: request.minTenor,
      maxTenor: request.maxTenor,
      minInterestRate: request.minInterestRate,
      maxInterestRate: request.maxInterestRate,
    };

    const updated = await this.configRepo.updateByKey(
      'LOAN_RULES',
      JSON.stringify(rules),
      'Loan application rules and limits'
    );

    // Audit log
    await this.auditService.logAction(
      adminId,
      'CONFIG_LOAN_RULES_UPDATED',
      'PLATFORM_CONFIG',
      updated?.id || 0,
      { oldRules: request, newRules: rules }
    );

    return updated;
  }

  /**
   * Update level upgrade rules
   */
  async updateLevelRules(request: UpdateLevelRulesRequest, adminId: number) {
    const rules = {
      level0Amount: request.level0Amount,
      level1Amount: request.level1Amount,
      level2Amount: request.level2Amount,
      level3Amount: request.level3Amount,
    };

    const updated = await this.configRepo.updateByKey(
      'LEVEL_RULES',
      JSON.stringify(rules),
      'User verification level upgrade thresholds'
    );

    await this.auditService.logAction(
      adminId,
      'CONFIG_LEVEL_RULES_UPDATED',
      'PLATFORM_CONFIG',
      updated?.id || 0,
      rules
    );

    return updated;
  }

  /**
   * Update fees configuration
   */
  async updateFees(request: UpdateFeesRequest, adminId: number) {
    const fees = {
      processingFee: request.processingFee,
      latePenaltyRate: request.latePenaltyRate,
      prePaymentPenaltyRate: request.prePaymentPenaltyRate,
    };

    const updated = await this.configRepo.updateByKey(
      'FEES_CONFIG',
      JSON.stringify(fees),
      'Platform fees and penalty rates'
    );

    await this.auditService.logAction(
      adminId,
      'CONFIG_FEES_UPDATED',
      'PLATFORM_CONFIG',
      updated?.id || 0,
      fees
    );

    return updated;
  }

  /**
   * Update reminder configuration
   */
  async updateReminders(request: UpdateRemindersRequest, adminId: number) {
    const reminders = {
      dueDateReminderDays: request.dueDateReminderDays,
      latepaymentReminderDays: request.latepaymentReminderDays,
      reminderFrequency: request.reminderFrequency,
    };

    const updated = await this.configRepo.updateByKey(
      'REMINDERS_CONFIG',
      JSON.stringify(reminders),
      'Notification and reminder settings'
    );

    await this.auditService.logAction(
      adminId,
      'CONFIG_REMINDERS_UPDATED',
      'PLATFORM_CONFIG',
      updated?.id || 0,
      reminders
    );

    return updated;
  }

  /**
   * Update retention policy
   * CRITICAL: Requires super-admin
   */
  async updateRetention(request: UpdateRetentionRequest, adminId: number) {
    const retention = {
      dataRetentionDays: request.dataRetentionDays,
      auditLogRetentionYears: request.auditLogRetentionYears,
      archiveExportedData: request.archiveExportedData,
    };

    const updated = await this.configRepo.updateByKey(
      'RETENTION_POLICY',
      JSON.stringify(retention),
      'Data retention and compliance policies'
    );

    await this.auditService.logAction(
      adminId,
      'CONFIG_RETENTION_UPDATED',
      'PLATFORM_CONFIG',
      updated?.id || 0,
      { warning: 'CRITICAL CONFIGURATION CHANGE', data: retention }
    );

    return updated;
  }

  /**
   * Get configuration version history
   */
  async getConfigHistory(key: string, limit: number = 10) {
    return await this.configRepo.getVersionHistory(key, limit);
  }

  /**
   * Get multiple config values efficiently
   */
  async getMultipleValues(keys: string[]) {
    return await this.configRepo.getMultipleValues(keys);
  }

  /**
   * Search configuration by pattern
   */
  async searchConfig(pattern: string, limit: number = 50) {
    return await this.configRepo.findByKeyPattern(pattern, limit);
  }

  private parseValue(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
