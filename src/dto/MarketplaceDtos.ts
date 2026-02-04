/**
 * Marketplace DTOs
 * Request/Response objects for marketplace endpoints
 * Compliance: Mask borrower/lender PII as required
 */

// ============================================
// BID REQUEST/RESPONSE DTOs
// ============================================

export class CreateBidRequest {
    loan_request_id: string;
    bid_amount: number;               // Amount willing to fund (in cents/basis points)
}

export class BidResponse {
    id: string;
    loan_request_id: string;
    bid_amount: number;
    allocated_amount: number;
    status: string;                   // BidStatus enum
    locked_funds: boolean;
    created_at: Date;
    updated_at: Date;

    // Derived fields
    remaining_bid_amount: number;
    fill_percentage: number;
    can_accept_allocation: boolean;
}

export class WithdrawBidRequest {
    bid_id: string;
}

// ============================================
// BORROWER MARKETPLACE DTOs
// ============================================

export class BidListResponse {
    bids: BidResponse[];
    total_bid_amount: number;
    total_allocated: number;
    pool_coverage_percent: number;
    funding_window_ends_at: Date;
}

export class FundingStatusResponse {
    loan_request_id: string;
    amount_requested: number;
    amount_funded: number;
    remaining_amount: number;
    min_funding_threshold: number;
    is_minimum_threshold_met: boolean;
    funding_progress_percent: number;
    is_funding_window_open: boolean;
    funding_window_ends_at: Date;
    active_bid_count: number;
    status: string;                   // LoanRequestStatus
}

export class AcceptFundingRequest {
    loan_request_id: string;
    // Optional: specific bids to accept (defaults to all active bids)
    bid_ids?: string[];
}

export class AcceptFundingResponse {
    loan_request_id: string;
    status: string;
    amount_funded: number;
    accepted_bid_count: number;
    message: string;
}

// ============================================
// LENDER MARKETPLACE DTOs
// ============================================

export class LenderBidsResponse {
    bids: BidResponse[];
    total_bid_amount: number;
    total_allocated: number;
    active_bid_count: number;
}

// ============================================
// COMPANY AUTO-BID DTOs
// ============================================

export class CreateCompanyAutoBidRequest {
    loan_request_id: string;
    bid_amount: number;
    // Company rules are applied server-side from ManagementAgreement
}

export class CompanyActivityResponse {
    bid_id: string;
    loan_request_id: string;
    bid_amount: number;
    allocated_amount: number;
    status: string;
    created_at: Date;
    borrower_name_masked: string;     // e.g., "B****r Name"
}

// ============================================
// ADMIN MARKETPLACE DTOs
// ============================================

export class MarketplaceStatsResponse {
    total_active_loans: number;
    total_bids: number;
    total_bids_filled: number;
    total_funding_volume: number;
    average_funding_time_hours: number;
    lender_participation_count: number;
    company_participation_count: number;
}

export class UpdateMarketplaceRuleRequest {
    max_bid_per_lender?: number;
    max_bid_per_company?: number;
    funding_window_hours?: number;
    allocation_strategy?: string;     // 'FIFO' | 'PRO_RATA'
}

export class AdminInterveneRequest {
    action: 'CANCEL_BID' | 'CANCEL_LOAN' | 'FORCE_ACCEPT';
    target_id: string;                // bid_id or loan_request_id
    reason: string;                   // Audit reason
    details?: any;
}

// ============================================
// ERROR/VALIDATION DTOs
// ============================================

export class MarketplaceErrorResponse {
    code: string;
    message: string;
    details?: any;
}
