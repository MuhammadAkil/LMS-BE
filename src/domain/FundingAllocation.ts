/**
 * FundingAllocation Domain Entity
 * Represents allocation of a bid to a specific loan request
 * Compliance: One allocation per bid per loan, tracks fund distribution
 */
export class FundingAllocation {
    id: string;
    loan_request_id: string;
    bid_id: string;
    lender_id: string;                // Who ultimately receives the allocation

    allocated_amount: number;         // Amount allocated (in cents/basis points)

    // Audit trail
    created_at: Date;
}
