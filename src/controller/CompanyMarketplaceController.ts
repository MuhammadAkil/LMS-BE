/**
 * CompanyMarketplaceController
 * Company-facing marketplace endpoints (auto-bidding)
 * 
 * Endpoints:
 * - POST /api/company/marketplace/auto-bid
 * - GET  /api/company/marketplace/activity
 * 
 * Compliance:
 * - Management agreement must be signed
 * - Cannot front-run manual lender bids
 * - Respects queue ordering (FIFO)
 * - Auto-bid rules: max per loan, max borrower exposure
 * - Funds locked from company pool
 * - All actions audited
 */

import {
    Controller,
    Get,
    Post,
    Body,
    UseGuards,
    Req,
    HttpCode,
    Query,
    Param,
} from '@nestjs/common';
import { MarketplaceRequest } from '../common/MarketplaceRequest';
import { MarketplaceBidService } from '../service/MarketplaceBidService';
import { AgreementGuard, MarketplaceRuleGuard } from '../middleware/MarketplaceGuards';
import {
    CreateCompanyAutoBidRequest,
    BidResponse,
    CompanyActivityResponse,
} from '../dto/MarketplaceDtos';

@Controller('api/company/marketplace')
export class CompanyMarketplaceController {
    constructor(
        private bidService: MarketplaceBidService,
    ) { }

    /**
     * POST /api/company/marketplace/auto-bid
     * 
     * Create an auto-bid for a loan request
     * 
     * Compliance Rules:
     * 1. Company must have signed management agreement
     * 2. Cannot exceed max_bid_per_company limit
     * 3. Must not violate max borrower exposure rules
     * 4. Cannot front-run manual lender bids (respects queue)
     * 5. Funds locked from company pool
     * 
     * Request body:
     * - loan_request_id: string
     * - bid_amount: number (in cents/basis points)
     * 
     * Response: BidResponse with:
     * - company_id set instead of lender_id
     * - status: 'ACTIVE'
     * - locked_funds: true
     */
    @Post('auto-bid')
    @UseGuards(AgreementGuard, MarketplaceRuleGuard)
    @HttpCode(201)
    async createAutoBid(
        @Body() request: CreateCompanyAutoBidRequest,
        @Req() req: MarketplaceRequest,
    ): Promise<BidResponse> {
        const companyId = req['companyId'];

        // TODO: Validate company-specific rules:
        // 1. Check ManagementAgreement is active and signed
        // 2. Check max_bid_per_loan for this company
        // 3. Check max_borrower_exposure (don't over-concentrate)
        // 4. Verify company pool has sufficient funds
        // 5. Check company isn't trying to front-run manual bids in queue

        const bid = await this.bidService.createBid(
            companyId,
            {
                loan_request_id: request.loan_request_id,
                bid_amount: request.bid_amount,
            },
            'COMPANY',
        );

        return bid;
    }

    /**
     * GET /api/company/marketplace/activity
     * 
     * View company's marketplace bidding activity
     * 
     * Query parameters:
     * - status: Filter by bid status (ACTIVE, FILLED, etc.)
     * - limit: Number of records (default: 50)
     * - offset: Pagination offset (default: 0)
     * 
     * Response: CompanyActivityResponse[]
     * - bid_id, loan_request_id, bid_amount, status
     * - Borrower name MASKED for privacy
     * - Created timestamp
     */
    @Get('activity')
    async getCompanyActivity(
        @Req() req: MarketplaceRequest,
        @Query('status') status?: string,
        @Query('limit') limit: number = 50,
        @Query('offset') offset: number = 0,
    ): Promise<CompanyActivityResponse[]> {
        const companyId = req.user.id;

        // TODO: Query company's bids with masked borrower information
        // SELECT 
        //   mb.id AS bid_id,
        //   mb.loan_request_id,
        //   mb.bid_amount,
        //   mb.allocated_amount,
        //   mb.status,
        //   mb.created_at,
        //   CONCAT(LEFT(b.name, 1), '****', RIGHT(b.name, 1)) AS borrower_name_masked
        // FROM marketplace_bids mb
        // JOIN loan_requests lr ON mb.loan_request_id = lr.id
        // JOIN users b ON lr.borrower_id = b.id
        // WHERE mb.company_id = ?
        // AND (? IS NULL OR mb.status = ?)

        const activity: CompanyActivityResponse[] = [];

        // Placeholder until repository is implemented
        return activity;
    }
}
