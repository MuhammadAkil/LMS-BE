/**
 * MarketplaceRule Domain Entity
 * Admin-configurable marketplace rules and constraints
 * Compliance: All marketplace operations must respect these rules
 */
export enum AllocationStrategy {
    FIFO = 'FIFO',                    // First-In, First-Out
    PRO_RATA = 'PRO_RATA',            // Proportional allocation based on bid amounts
}

export class MarketplaceRule {
    id: string;

    // Bid constraints
    max_bid_per_lender: number;       // Maximum bid amount per individual lender (in cents)
    max_bid_per_company: number;      // Maximum bid amount per company (in cents)

    // Timing
    funding_window_hours: number;     // Default funding window duration

    // Allocation strategy
    allocation_strategy: AllocationStrategy;

    // Audit trail
    created_at: Date;
    updated_at: Date;
}
