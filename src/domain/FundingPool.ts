/**
 * FundingPool Domain Entity
 * Represents the aggregated pool of all bids for a loan request
 * Used to track total available funding in real-time
 */
export class FundingPool {
    id: string;
    loan_request_id: string;

    total_pool_amount: number;        // Sum of all active bid amounts (in cents/basis points)

    // Audit trail
    created_at: Date;

    /**
     * Calculated: pool coverage
     * What % of requested amount is in pool?
     */
    getPoolCoveragePercent(amount_requested: number): number {
        if (amount_requested === 0) return 0;
        return (this.total_pool_amount / amount_requested) * 100;
    }
}
