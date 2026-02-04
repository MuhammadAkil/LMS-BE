/**
 * LoanRequest Domain Entity
 * Extends LoanApplication with marketplace-specific fields
 * Regulated Loan Marketplace - represents a borrower's funding request
 */
export enum LoanRequestStatus {
    OPEN = 'OPEN',                    // Initial state, open for bidding
    BIDDING = 'BIDDING',              // Active bidding window
    FUNDED = 'FUNDED',                // Funding threshold met
    CLOSING = 'CLOSING',              // Loan closing process
    ACTIVE = 'ACTIVE',                // Funded loan is now active
    CANCELLED = 'CANCELLED',          // Loan request cancelled
}

export class LoanRequest {
    id: string;
    borrower_id: string;

    // Funding details
    amount_requested: number;         // Total requested amount (in cents/basis points)
    amount_funded: number;            // Amount actually funded
    min_funding_threshold: number;    // Minimum to proceed (% or fixed amount)

    // Marketplace timing
    funding_window_ends_at: Date;     // Deadline for bids
    auto_close: boolean;              // Auto-close at window end if funded

    status: LoanRequestStatus;

    // Audit trail
    created_at: Date;
    updated_at: Date;

    /**
     * Calculated: remaining amount to be funded
     */
    get remaining_amount(): number {
        return this.amount_requested - this.amount_funded;
    }

    /**
     * Calculated: funding progress percentage
     */
    get funding_progress_percent(): number {
        return (this.amount_funded / this.amount_requested) * 100;
    }

    /**
     * Calculated: is window still open?
     */
    get is_funding_window_open(): boolean {
        return new Date() < this.funding_window_ends_at &&
            (this.status === LoanRequestStatus.OPEN || this.status === LoanRequestStatus.BIDDING);
    }

    /**
     * Calculated: is minimum threshold met?
     */
    get is_minimum_threshold_met(): boolean {
        return this.amount_funded >= this.min_funding_threshold;
    }
}
