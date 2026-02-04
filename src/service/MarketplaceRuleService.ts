/**
 * MarketplaceRuleService
 * Admin-configurable marketplace rules
 * 
 * Responsibilities:
 * - Load marketplace rules
 * - Update rules (admin only)
 * - Provide rule constraints to other services
 * - Validate rules are consistent
 */

import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { MarketplaceRule, AllocationStrategy } from '../domain/MarketplaceRule';
import { UpdateMarketplaceRuleRequest } from '../dto/MarketplaceDtos';
import { AuditLog } from '../domain/AuditLog';

@Injectable()
export class MarketplaceRuleService {
    constructor(
        @InjectRepository(MarketplaceRule)
        private ruleRepository: Repository<MarketplaceRule>,
        @InjectRepository(AuditLog)
        private auditRepository: Repository<AuditLog>,
    ) { }

    /**
     * Get current marketplace rules
     * 
     * Loads the active ruleset. In production, this might be cached.
     */
    async getCurrentRules(): Promise<MarketplaceRule> {
        let rules = await this.ruleRepository.findOne({ where: {} });

        if (!rules) {
            // Create default rules if none exist
            rules = new MarketplaceRule();
            rules.id = (Math.random() * 10000).toFixed(0).toString();
            rules.max_bid_per_lender = 50_000_000;    // 500,000 units
            rules.max_bid_per_company = 100_000_000;  // 1,000,000 units
            rules.funding_window_hours = 168;         // 7 days
            rules.allocation_strategy = AllocationStrategy.FIFO;
            rules.created_at = new Date();
            rules.updated_at = new Date();
            rules = await this.ruleRepository.save(rules);
        }

        return rules;
    }

    /**
     * Update marketplace rules (admin only)
     * 
     * Compliance:
     * - Max bid limits must be positive
     * - Funding window must be > 0 hours
     * - Strategy must be valid enum
     * - All changes are audited
     */
    async updateRules(
        request: UpdateMarketplaceRuleRequest,
        adminId: string,
    ): Promise<MarketplaceRule> {
        const rules = await this.getCurrentRules();

        // Validate constraints
        if (request.max_bid_per_lender !== undefined && request.max_bid_per_lender <= 0) {
            throw new BadRequestException('max_bid_per_lender must be positive');
        }

        if (request.max_bid_per_company !== undefined && request.max_bid_per_company <= 0) {
            throw new BadRequestException('max_bid_per_company must be positive');
        }

        if (request.funding_window_hours !== undefined && request.funding_window_hours <= 0) {
            throw new BadRequestException('funding_window_hours must be positive');
        }

        if (request.allocation_strategy !== undefined) {
            if (!Object.values(AllocationStrategy).includes(request.allocation_strategy as AllocationStrategy)) {
                throw new BadRequestException(
                    `allocation_strategy must be one of: ${Object.values(AllocationStrategy).join(', ')}`,
                );
            }
        }

        // Store old values for audit
        const oldValues = {
            max_bid_per_lender: rules.max_bid_per_lender,
            max_bid_per_company: rules.max_bid_per_company,
            funding_window_hours: rules.funding_window_hours,
            allocation_strategy: rules.allocation_strategy,
        };

        // Update
        if (request.max_bid_per_lender !== undefined) {
            rules.max_bid_per_lender = request.max_bid_per_lender;
        }
        if (request.max_bid_per_company !== undefined) {
            rules.max_bid_per_company = request.max_bid_per_company;
        }
        if (request.funding_window_hours !== undefined) {
            rules.funding_window_hours = request.funding_window_hours;
        }
        if (request.allocation_strategy !== undefined) {
            rules.allocation_strategy = request.allocation_strategy as AllocationStrategy;
        }

        rules.updated_at = new Date();
        const updatedRules = await this.ruleRepository.save(rules);

        // Audit the change
        await this.auditAction(
            'RULES_UPDATED',
            adminId,
            {
                old_values: oldValues,
                new_values: {
                    max_bid_per_lender: rules.max_bid_per_lender,
                    max_bid_per_company: rules.max_bid_per_company,
                    funding_window_hours: rules.funding_window_hours,
                    allocation_strategy: rules.allocation_strategy,
                },
            },
        );

        return updatedRules;
    }

    /**
     * Validate bid against current rules
     */
    async validateBidConstraints(
        bidAmount: number,
        lenderTotalBids: number,
        bidderType: 'LENDER' | 'COMPANY',
    ): Promise<{ valid: boolean; message?: string }> {
        const rules = await this.getCurrentRules();

        if (bidderType === 'LENDER') {
            const maxBid = rules.max_bid_per_lender;
            if (lenderTotalBids + bidAmount > maxBid) {
                return {
                    valid: false,
                    message: `Bid would exceed lender limit of ${maxBid}. Current total: ${lenderTotalBids}`,
                };
            }
        } else if (bidderType === 'COMPANY') {
            const maxBid = rules.max_bid_per_company;
            if (lenderTotalBids + bidAmount > maxBid) {
                return {
                    valid: false,
                    message: `Bid would exceed company limit of ${maxBid}. Current total: ${lenderTotalBids}`,
                };
            }
        }

        return { valid: true };
    }

    /**
     * Audit an action
     */
    private async auditAction(action: string, actor_id: string, details: any): Promise<void> {
        const audit = new AuditLog();
        audit.id = parseInt(Math.random().toString().substring(2, 13), 10) as any; // Temporary ID generation
        audit.action = action;
        audit.userId = parseInt(actor_id, 10);
        audit.entity = 'MARKETPLACE_RULES';
        audit.entityId = 0; // Global rules
        audit.metadata = JSON.stringify(details);

        await this.auditRepository.save(audit);
    }
}
