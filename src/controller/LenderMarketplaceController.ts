/**
 * LenderMarketplaceController
 * Lender-facing marketplace endpoints
 * 
 * Endpoints:
 * - POST   /api/marketplace/bids (create bid)
 * - GET    /api/lender/bids (view own bids)
 * - DELETE /api/marketplace/bids/:id (withdraw bid)
 * 
 * Compliance:
 * - Funds locked immediately at bid creation
 * - Bid amounts are immutable
 * - Cannot see borrower details
 * - Bid withdrawal only if not accepted
 * - All actions audited
 */

import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    Req,
    HttpCode,
    UseBefore,
} from 'routing-controllers';
import { MarketplaceRequest } from '../common/MarketplaceRequest';
import { MarketplaceBidService } from '../service/MarketplaceBidService';
import { BidOwnershipGuard, CapitalLockGuard, MarketplaceRuleGuard } from '../middleware/MarketplaceGuards';
import { CreateBidRequest, BidResponse, LenderBidsResponse, WithdrawBidRequest } from '../dto/MarketplaceDtos';

@Controller('')
export class LenderMarketplaceController {
    constructor(
        private bidService: MarketplaceBidService,
    ) { }

    /**
     * POST /api/marketplace/bids
     * 
     * Create a new bid for a loan request
     * 
     * Compliance:
     * - Capital locked immediately
     * - Bid amount must be <= remaining loan amount
     * - Must not exceed lender's max bid limit
     * - Bid commitment recorded; investment capital is not held by the portal (see platform fund flow rules).
     * 
     * Request body:
     * - loan_request_id: string
     * - bid_amount: number (in cents/basis points)
     * 
     * Response: BidResponse with:
     * - bid_id: string
     * - bid_amount: number
     * - status: 'ACTIVE'
     * - locked_funds: true
     */
    @Post('/marketplace/bids')
    @UseBefore(MarketplaceRuleGuard)
    @HttpCode(201)
    async createBid(
        @Body() request: CreateBidRequest,
        @Req() req: MarketplaceRequest,
    ): Promise<BidResponse> {
        const userId = req.user.id;
        const bid = await this.bidService.createBid(userId, request, 'LENDER');

        return bid;
    }

    /**
     * GET /api/lender/bids
     * 
     * View all bids placed by this lender
     * 
     * Includes:
     * - Bid amount, allocated amount
     * - Bid status
     * - Loan details (masked)
     * - Created timestamp
     * 
     * Response: LenderBidsResponse with:
     * - bids: BidResponse[]
     * - total_bid_amount: number
     * - total_allocated: number
     * - active_bid_count: number
     */
    @Get('/lender/bids')
    async getLenderBids(
        @Req() req: MarketplaceRequest,
    ): Promise<LenderBidsResponse> {
        const userId = req.user.id;
        const bids = await this.bidService.getBidsByLender(userId);

        const totalBidAmount = bids.reduce((sum, bid) => sum + bid.bid_amount, 0);
        const totalAllocated = bids.reduce((sum, bid) => sum + bid.allocated_amount, 0);
        const activeBidCount = bids.filter((bid) =>
            bid.status === 'ACTIVE' || bid.status === 'PARTIALLY_FILLED'
        ).length;

        return {
            bids,
            total_bid_amount: totalBidAmount,
            total_allocated: totalAllocated,
            active_bid_count: activeBidCount,
        };
    }

    /**
     * DELETE /api/marketplace/bids/:id
     * 
     * Withdraw a bid
     * 
     * Rules:
     * - Only ACTIVE bids can be withdrawn
     * - Must be bid owner (lender)
     * - Cannot withdraw if any funds allocated
     * - Capital is unlocked when withdrawn
     * - Loan status reverts to OPEN if all bids withdrawn
     * 
     * Response: Confirmation with updated bid status
     */
    @Delete('/marketplace/bids/:id')
    @UseBefore(BidOwnershipGuard, CapitalLockGuard)
    @HttpCode(200)
    async withdrawBid(
        @Param('id') bidId: string,
        @Req() req: MarketplaceRequest,
    ): Promise<BidResponse> {
        const userId = req.user.id;
        const bid = await this.bidService.withdrawBid(bidId, userId);

        return bid;
    }
}
