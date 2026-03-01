/**
 * MarketplaceRuleService
 * Admin-configurable marketplace rules
 */

import { AppDataSource } from '../config/database';
import { AdminAuditService } from './AdminAuditService';
import { MarketplaceRule, AllocationStrategy } from '../domain/MarketplaceRule';
import { UpdateMarketplaceRuleRequest } from '../dto/MarketplaceDtos';

// In-memory singleton for marketplace rules (persisted in DB when marketplace_rules table exists)
let cachedRules: MarketplaceRule | null = null;

function getDefaultRules(): MarketplaceRule {
    const r = new MarketplaceRule();
    r.id = '1';
    r.max_bid_per_lender = 50_000_000;
    r.max_bid_per_company = 100_000_000;
    r.funding_window_hours = 168;
    r.allocation_strategy = AllocationStrategy.FIFO;
    r.created_at = new Date();
    r.updated_at = new Date();
    return r;
}

export class MarketplaceRuleService {
    private auditService: AdminAuditService;

    constructor() {
        this.auditService = new AdminAuditService();
    }

    async getCurrentRules(): Promise<MarketplaceRule> {
        // Try to load from DB first (table may not exist yet)
        try {
            const rows = await AppDataSource.query(`SELECT * FROM marketplace_rules LIMIT 1`);
            if (rows?.length) {
                cachedRules = Object.assign(new MarketplaceRule(), rows[0]);
                return cachedRules;
            }
        } catch {
            // Table doesn't exist — use in-memory defaults
        }
        if (!cachedRules) cachedRules = getDefaultRules();
        return cachedRules;
    }

    async updateRules(request: UpdateMarketplaceRuleRequest, adminId: number | string): Promise<MarketplaceRule> {
        const rules = await this.getCurrentRules();
        const oldValues = { ...rules };

        // Support both frontend camelCase and legacy snake_case field names
        const maxLender = request.max_bid_per_lender ?? request.maxBidAmount;
        const maxCompany = request.max_bid_per_company;
        const windowHours = request.funding_window_hours ?? request.biddingTimeout;

        if (maxLender !== undefined) {
            if (maxLender <= 0) throw new Error('max_bid_per_lender must be positive');
            rules.max_bid_per_lender = maxLender;
        }
        if (maxCompany !== undefined) {
            if (maxCompany <= 0) throw new Error('max_bid_per_company must be positive');
            rules.max_bid_per_company = maxCompany;
        }
        if (windowHours !== undefined) {
            if (windowHours <= 0) throw new Error('funding_window_hours must be positive');
            rules.funding_window_hours = windowHours;
        }
        if (request.allocation_strategy !== undefined) {
            if (!Object.values(AllocationStrategy).includes(request.allocation_strategy as AllocationStrategy)) {
                throw new Error(`allocation_strategy must be one of: ${Object.values(AllocationStrategy).join(', ')}`);
            }
            rules.allocation_strategy = request.allocation_strategy as AllocationStrategy;
        }
        rules.updated_at = new Date();
        cachedRules = rules;

        // Try to persist to DB
        try {
            await AppDataSource.query(
                `INSERT INTO marketplace_rules (id, max_bid_per_lender, max_bid_per_company, funding_window_hours, allocation_strategy, updated_at)
                 VALUES (1, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE max_bid_per_lender=VALUES(max_bid_per_lender), max_bid_per_company=VALUES(max_bid_per_company),
                   funding_window_hours=VALUES(funding_window_hours), allocation_strategy=VALUES(allocation_strategy), updated_at=NOW()`,
                [rules.max_bid_per_lender, rules.max_bid_per_company, rules.funding_window_hours, rules.allocation_strategy]
            );
        } catch { /* Table may not exist */ }

        await this.auditService.logAction(
            Number(adminId), 'MARKETPLACE_RULES_UPDATED', 'MARKETPLACE_RULES', 0,
            { old_values: oldValues, new_values: rules }
        );

        return rules;
    }

    async validateBidConstraints(bidAmount: number, currentTotal: number, bidderType: 'LENDER' | 'COMPANY'): Promise<{ valid: boolean; message?: string }> {
        const rules = await this.getCurrentRules();
        const limit = bidderType === 'LENDER' ? rules.max_bid_per_lender : rules.max_bid_per_company;
        if (currentTotal + bidAmount > limit) {
            return { valid: false, message: `Bid exceeds ${bidderType.toLowerCase()} limit of ${limit}. Current total: ${currentTotal}` };
        }
        return { valid: true };
    }
}
