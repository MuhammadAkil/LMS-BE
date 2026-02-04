/**
 * MarketplaceBid Domain Entity
 * Represents a lender or company's offer to fund a loan request
 * Compliance: All bids must have funds locked immediately
 */
export enum BidStatus {
    ACTIVE = 'ACTIVE',                // Bid is open and accepting allocations
    PARTIALLY_FILLED = 'PARTIALLY_FILLED', // Some funding allocated
    FILLED = 'FILLED',                // Bid fully allocated/accepted
    EXPIRED = 'EXPIRED',              // Funding window closed
    REJECTED = 'REJECTED',            // Admin or system rejection
}

export class MarketplaceBid {
    id: string;
    loan_request_id: string;

    // Bidder identity (one must be set)
    lender_id: string | null;         // Individual lender (null for company auto-bid)
    company_id: string | null;        // Company auto-bid (null for manual lender bid)

    // Bid amount and allocation
    bid_amount: number;               // Total bid amount (in cents/basis points)
    allocated_amount: number;         // Amount actually allocated to loan

    // Capital lock state - CRITICAL for compliance
    locked_funds: boolean;            // Funds locked in wallet at bid creation

    // Status tracking
    status: BidStatus;

    // Audit trail
    created_at: Date;
    updated_at: Date;

    /**
     * Calculated: remaining unallocated bid amount
     * This is what's still available for allocation to the loan
     */
    get remaining_bid_amount(): number {
        return this.bid_amount - this.allocated_amount;
    }

    /**
     * Calculated: bid fill percentage
     */
    get fill_percentage(): number {
        if (this.bid_amount === 0) return 0;
        return (this.allocated_amount / this.bid_amount) * 100;
    }

    /**
     * Validation: Can this bid receive more allocations?
     */
    get can_accept_allocation(): boolean {
        return this.status === BidStatus.ACTIVE ||
            this.status === BidStatus.PARTIALLY_FILLED;
    }

    /**
     * Is bid from a company auto-strategy?
     */
    get is_company_bid(): boolean {
        return this.company_id !== null && this.lender_id === null;
    }

    /**
     * Is bid from manual lender?
     */
    get is_lender_bid(): boolean {
        return this.lender_id !== null && this.company_id === null;
    }
}
