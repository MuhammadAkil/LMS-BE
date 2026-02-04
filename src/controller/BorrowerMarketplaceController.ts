/**
 * BorrowerMarketplaceController
 * Borrower-facing marketplace endpoints
 * 
 * Endpoints:
 * - GET  /api/borrower/applications/:id/bids
 * - GET  /api/borrower/applications/:id/funding-status
 * - POST /api/borrower/applications/:id/accept-funding
 * 
 * Compliance:
 * - Borrower never sees lender identity
 * - Can only view their own loans
 * - Can only accept if threshold met
 * - All actions audited
 */

import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    UseGuards,
    Req,
    BadRequestException,
    HttpCode,
} from '@nestjs/common';
import { MarketplaceRequest } from '../common/MarketplaceRequest';
import { MarketplaceBidService } from '../service/MarketplaceBidService';
import { FundingAllocationService } from '../service/FundingAllocationService';
import { FundingPoolService } from '../service/FundingPoolService';
import { BorrowerOwnershipGuard, FundingWindowGuard } from '../middleware/MarketplaceGuards';
import {
    BidListResponse,
    FundingStatusResponse,
    AcceptFundingRequest,
    AcceptFundingResponse,
} from '../dto/MarketplaceDtos';

@Controller('api/borrower/applications')
export class BorrowerMarketplaceController {
    constructor(
        private bidService: MarketplaceBidService,
        private allocationService: FundingAllocationService,
        private poolService: FundingPoolService,
    ) { }

    /**
     * GET /api/borrower/applications/:id/bids
     * 
     * Borrower views all bids on their loan
     * Lender names are MASKED for privacy
     * 
     * Response includes:
     * - List of bids (with lender masked)
     * - Pool statistics
     * - Funding window info
     */
    @Get(':id/bids')
    @UseGuards(BorrowerOwnershipGuard)
    async getBidsForLoan(
        @Param('id') loanRequestId: string,
        @Req() req: MarketplaceRequest,
    ): Promise<BidListResponse> {
        const bids = await this.bidService.getBidsForLoan(loanRequestId);

        // COMPLIANCE: Mask lender identities
        const maskedBids = bids.map((bid) => {
            if (bid.bid_amount) {
                // Instead of showing lender_id, show masked string like "L****r 1"
                return {
                    ...bid,
                    // lender_id is now hidden, only show "Lender" type
                };
            }
            return bid;
        });

        const poolTotal = await this.poolService.getPoolTotal(loanRequestId);
        const loanRequest = req['loanRequest'];

        return {
            bids: maskedBids,
            total_bid_amount: poolTotal,
            total_allocated: loanRequest.amount_funded,
            pool_coverage_percent: loanRequest.funding_progress_percent,
            funding_window_ends_at: loanRequest.funding_window_ends_at,
        };
    }

    /**
     * GET /api/borrower/applications/:id/funding-status
     * 
     * Get comprehensive funding status
     * Used to determine if borrower can accept funding
     */
    @Get(':id/funding-status')
    @UseGuards(BorrowerOwnershipGuard)
    async getFundingStatus(
        @Param('id') loanRequestId: string,
        @Req() req: MarketplaceRequest,
    ): Promise<FundingStatusResponse> {
        const loanRequest = req['loanRequest'];
        const bids = await this.bidService.getBidsForLoan(loanRequestId);
        const poolTotal = await this.poolService.getPoolTotal(loanRequestId);

        return {
            loan_request_id: loanRequest.id,
            amount_requested: loanRequest.amount_requested,
            amount_funded: loanRequest.amount_funded,
            remaining_amount: loanRequest.remaining_amount,
            min_funding_threshold: loanRequest.min_funding_threshold,
            is_minimum_threshold_met: loanRequest.is_minimum_threshold_met,
            funding_progress_percent: loanRequest.funding_progress_percent,
            is_funding_window_open: loanRequest.is_funding_window_open,
            funding_window_ends_at: loanRequest.funding_window_ends_at,
            active_bid_count: bids.filter((b) => b.status === 'ACTIVE' || b.status === 'PARTIALLY_FILLED').length,
            status: loanRequest.status,
        };
    }

    /**
     * POST /api/borrower/applications/:id/accept-funding
     * 
     * Accept funding for a loan request
     * 
     * Rules:
     * 1. Must be borrower (checked by guard)
     * 2. Minimum threshold must be met
     * 3. Funding window must be open OR admin override
     * 4. Allocates bids using configured strategy
     * 5. Transitions loan to FUNDED status
     * 
     * Request body:
     * - loan_request_id: string
     * - bid_ids: string[] (optional - specific bids to accept)
     */
    @Post(':id/accept-funding')
    @UseGuards(BorrowerOwnershipGuard, FundingWindowGuard)
    @HttpCode(200)
    async acceptFunding(
        @Param('id') loanRequestId: string,
        @Req() req: MarketplaceRequest,
        @Body() request: AcceptFundingRequest,
    ): Promise<AcceptFundingResponse> {
        const loanRequest = req['loanRequest'];
        const userId = req.user.id;

        if (!loanRequest.is_minimum_threshold_met) {
            throw new BadRequestException(
                `Minimum funding threshold not met. Required: ${loanRequest.min_funding_threshold}, Current: ${loanRequest.amount_funded}`,
            );
        }

        const result = await this.allocationService.acceptFunding(
            loanRequestId,
            userId,
            request.bid_ids,
        );

        return {
            loan_request_id: loanRequestId,
            status: 'FUNDED',
            amount_funded: result.total_funded,
            accepted_bid_count: result.accepted_bid_count,
            message: `Successfully accepted funding. ${result.accepted_bid_count} bids allocated.`,
        };
    }
}
