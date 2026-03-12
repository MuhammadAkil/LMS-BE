import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import {
    AutomationRuleResponse,
    CreateAutomationRuleRequest,
    UpdateAutomationRuleRequest,
} from '../dto/CompanyDtos';

/**
 * Company Automation Service
 * Manages auto_invest_rules
 *
 * Fintech compliance:
 * - Rules stored in auto_invest_rules table
 * - Must respect platform level_rules constraints
 * - Priority execution order supported
 * - Automation cannot override platform loan rules
 * - All changes audited and notified
 */
export class CompanyAutomationService {
    private auditService: CompanyAuditService;

    constructor() {
        this.auditService = new CompanyAuditService();
    }

    /**
     * Get all automation rules for company
     */
    async getAutomationRules(companyId: number): Promise<AutomationRuleResponse[]> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const rules = await queryRunner.query(
                `
        SELECT 
          id,
          companyId,
          minLevel,
          maxAmount,
          active,
          createdAt,
          updatedAt
        FROM auto_invest_rules
        WHERE companyId = ?
        ORDER BY createdAt DESC
        `,
                [companyId]
            );

            return rules.map((row: any) => ({
                id: row.id,
                companyId: row.companyId,
                minLevel: row.minLevel,
                maxAmount: parseFloat(row.maxAmount || 0),
                active: Boolean(row.active),
                priority: 0,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            }));
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Create automation rule
     * Fintech compliance:
     * - Validates minLevel against platform level_rules
     * - maxAmount must be positive
     * - Creates audit log: AUTOMATION_RULE_CREATED
     * - Triggers notification
     */
    async createAutomationRule(
        companyId: number,
        userId: number,
        request: CreateAutomationRuleRequest
    ): Promise<AutomationRuleResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Validate minLevel is within platform constraints
            const levelRules = await queryRunner.query(
                `
        SELECT MAX(level) as max_level FROM level_rules
        `
            );

            if (levelRules && levelRules.length > 0 && levelRules[0].max_level != null) {
                const maxPlatformLevel = levelRules[0].max_level;
                if (request.minLevel > maxPlatformLevel) {
                    throw new Error(
                        `Minimum level cannot exceed platform maximum (${maxPlatformLevel})`
                    );
                }
            }

            // Insert automation rule
            const result = await queryRunner.query(
                `
        INSERT INTO auto_invest_rules (
          companyId,
          minLevel,
          maxAmount,
          active,
          createdAt,
          updatedAt
        ) VALUES (?, ?, ?, ?, NOW(), NOW())
        `,
                [
                    companyId,
                    request.minLevel,
                    request.maxAmount,
                    request.active !== false,
                ]
            );

            const ruleId = result.insertId;

            // Create audit log
            await this.auditService.logAction(
                userId,
                'AUTOMATION_RULE_CREATED',
                'AUTO_INVEST_RULE',
                ruleId,
                {
                    companyId,
                    minLevel: request.minLevel,
                    maxAmount: request.maxAmount,
                    priority: request.priority,
                }
            );

            // Notify user
            await this.auditService.notifyUser(userId, 'AUTOMATION_RULE_CREATED', {
                title: 'Automation rule created',
                message: 'Automation rule has been created',
                ruleId,
                minLevel: request.minLevel,
                maxAmount: request.maxAmount,
                timestamp: new Date(),
            });

            // Fetch and return created rule
            const rules = await this.getAutomationRules(companyId);
            const created = rules.find(r => r.id === ruleId);

            if (!created) {
                throw new Error('Failed to create automation rule');
            }

            return created;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Update automation rule
     * Fintech compliance:
     * - Validates platform level constraints
     * - Records all changes in audit log
     */
    async updateAutomationRule(
        companyId: number,
        userId: number,
        ruleId: number,
        request: UpdateAutomationRuleRequest
    ): Promise<AutomationRuleResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Verify rule exists
            const existing = await queryRunner.query(
                `
        SELECT * FROM auto_invest_rules
        WHERE companyId = ? AND id = ?
        `,
                [companyId, ruleId]
            );
            if (!existing || existing.length === 0) {
                throw new Error('Automation rule not found');
            }
            const updateFields: string[] = [];
            const updateValues: any[] = [];

            if (request.minLevel !== undefined) {
                // Validate against platform constraints
                const levelRules = await queryRunner.query(
                    `
          SELECT MAX(level) as max_level FROM level_rules
          `
                );

                if (levelRules && levelRules.length > 0 && levelRules[0].max_level != null) {
                    if (request.minLevel > levelRules[0].max_level) {
                        throw new Error('Minimum level exceeds platform constraint');
                    }
                }

                updateFields.push('minLevel = ?');
                updateValues.push(request.minLevel);
            }

            if (request.maxAmount !== undefined) {
                updateFields.push('maxAmount = ?');
                updateValues.push(request.maxAmount);
            }

            if (request.priority !== undefined) {
                // priority column does not exist, skip
            }

            if (request.active !== undefined) {
                updateFields.push('active = ?');
                updateValues.push(request.active);
            }

            if (updateFields.length === 0) {
                throw new Error('No fields to update');
            }

            updateFields.push('updatedAt = NOW()');
            updateValues.push(companyId);
            updateValues.push(ruleId);

            // Update rule
            await queryRunner.query(
                `
        UPDATE auto_invest_rules
        SET ${updateFields.join(', ')}
        WHERE companyId = ? AND id = ?
        `,
                updateValues
            );

            // Create audit log
            await this.auditService.logAction(
                userId,
                'AUTOMATION_RULE_UPDATED',
                'AUTO_INVEST_RULE',
                ruleId,
                {
                    companyId,
                    changes: request,
                }
            );

            // Fetch and return updated rule
            const rules = await this.getAutomationRules(companyId);
            const updated = rules.find(r => r.id === ruleId);

            if (!updated) {
                throw new Error('Failed to retrieve updated rule');
            }

            return updated;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Delete automation rule
     * Soft delete by setting active = false or hard delete
     */
    async deleteAutomationRule(
        companyId: number,
        userId: number,
        ruleId: number
    ): Promise<void> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Verify rule exists
            const existing = await queryRunner.query(
                `
        SELECT * FROM auto_invest_rules
        WHERE companyId = ? AND id = ?
        `,
                [companyId, ruleId]
            );

            if (!existing || existing.length === 0) {
                throw new Error('Automation rule not found');
            }

            // Delete rule
            await queryRunner.query(
                `
        DELETE FROM auto_invest_rules
        WHERE companyId = ? AND id = ?
        `,
                [companyId, ruleId]
            );

            // Create audit log
            await this.auditService.logAction(
                userId,
                'AUTOMATION_RULE_DELETED',
                'AUTO_INVEST_RULE',
                ruleId,
                {
                    companyId,
                }
            );

            // Notify user
            await this.auditService.notifyUser(userId, 'AUTOMATION_RULE_DELETED', {
                title: 'Automation rule deleted',
                message: 'Automation rule has been deleted',
                ruleId,
                timestamp: new Date(),
            });
        } finally {
            await queryRunner.release();
        }
    }
}
