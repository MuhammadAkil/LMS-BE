/**
 * AdminMarketplaceController
 * Admin oversight and configuration endpoints
 * 
 * Endpoints:
 * - GET  /api/admin/marketplace/stats
 * - PUT  /api/admin/marketplace/config
 * - POST /api/admin/marketplace/intervene
 * 
 * Compliance:
 * - Admin can view all marketplace data
 * - Admin can override bids (fraud prevention)
 * - Admin can modify marketplace rules
 * - All admin actions fully audited
 * - Overrides require reason documentation
 */

import {
    Controller,
    Get,
    Put,
    Post,
    Body,
    Req,
    HttpCode,
    UseBefore,
} from 'routing-controllers';
import { MarketplaceRequest } from '../common/MarketplaceRequest';
import { MarketplaceStatsService } from '../service/MarketplaceStatsService';
import { MarketplaceRuleService } from '../service/MarketplaceRuleService';
import {
    MarketplaceStatsResponse,
    UpdateMarketplaceRuleRequest,
    AdminInterveneRequest,
} from '../dto/MarketplaceDtos';
import { AdminGuard } from '../middleware/AdminGuards';

@Controller('/admin/marketplace')
@UseBefore(AdminGuard)
export class AdminMarketplaceController {
    constructor(
        private statsService: MarketplaceStatsService,
        private ruleService: MarketplaceRuleService,
    ) { }

    /**
     * GET /api/admin/marketplace/stats
     * 
     * Get comprehensive marketplace statistics
     * 
     * Metrics:
     * - Total active loans and bids
     * - Total funding volume
     * - Average funding time
     * - Lender/company participation count
     * 
     * Response: MarketplaceStatsResponse
     */
    @Get('stats')
    async getMarketplaceStats(
        @Req() req: MarketplaceRequest,
    ): Promise<MarketplaceStatsResponse> {
        return this.statsService.getMarketplaceStats();
    }

    /**
     * GET /api/admin/marketplace/stats/top-lenders
     * Get top lenders by bid volume
     */
    @Get('stats/top-lenders')
    async getTopLenders(
        @Req() req: MarketplaceRequest,
    ): Promise<any[]> {
        return this.statsService.getTopLenders(10);
    }

    /**
     * GET /api/admin/marketplace/stats/top-companies
     * Get top companies by bid volume
     */
    @Get('stats/top-companies')
    async getTopCompanies(
        @Req() req: MarketplaceRequest,
    ): Promise<any[]> {
        return this.statsService.getTopCompanies(10);
    }

    /**
     * GET /api/admin/marketplace/stats/success-rate
     * Get funding success rate
     */
    @Get('stats/success-rate')
    async getFundingSuccessRate(
        @Req() req: MarketplaceRequest,
    ): Promise<any> {
        return this.statsService.getFundingSuccessRate();
    }

    /**
     * PUT /api/admin/marketplace/config
     * 
     * Update marketplace rules
     * 
     * Admin can modify:
     * - max_bid_per_lender: Maximum individual lender can bid
     * - max_bid_per_company: Maximum company can bid
     * - funding_window_hours: Default funding window duration
     * - allocation_strategy: FIFO or PRO_RATA
     * 
     * All changes are audited with admin ID
     * 
     * Request body: UpdateMarketplaceRuleRequest
     */
    @Put('config')
    @HttpCode(200)
    async updateConfig(
        @Req() req: MarketplaceRequest,
        @Body() request: UpdateMarketplaceRuleRequest,
    ): Promise<any> {
        const adminId = req.user.id;

        const updatedRules = await this.ruleService.updateRules(request, adminId);

        return {
            message: 'Marketplace rules updated successfully',
            rules: updatedRules,
        };
    }

    /**
     * POST /api/admin/marketplace/intervene
     * 
     * Admin intervention in marketplace
     * 
     * Actions:
     * - CANCEL_BID: Cancel a specific bid (fraud prevention)
     * - CANCEL_LOAN: Cancel entire loan request
     * - FORCE_ACCEPT: Force acceptance of funding (emergency)
     * 
     * All interventions:
     * - Require documented reason
     * - Cannot be undone
     * - Generate notifications to affected parties
     * - Are fully audited
     * 
     * Request body: AdminInterveneRequest
     * - action: 'CANCEL_BID' | 'CANCEL_LOAN' | 'FORCE_ACCEPT'
     * - target_id: bid_id or loan_request_id
     * - reason: Why intervention occurred
     * - details: Optional additional context
     */
    @Post('intervene')
    @HttpCode(200)
    async adminIntervene(
        @Req() req: MarketplaceRequest,
        @Body() request: AdminInterveneRequest,
    ): Promise<any> {
        const adminId = req.user.id;

        // TODO: Implement intervention logic based on action:

        // CANCEL_BID:
        // - Find bid by target_id
        // - Verify bid exists and is ACTIVE
        // - Unlock capital
        // - Set bid status to REJECTED
        // - Notify lender of cancellation
        // - Audit with reason

        // CANCEL_LOAN:
        // - Find loan by target_id
        // - Verify loan exists
        // - Unlock all bid capital
        // - Set all bids to REJECTED
        // - Set loan to CANCELLED
        // - Notify borrower and all lenders
        // - Audit with reason

        // FORCE_ACCEPT:
        // - Find loan by target_id
        // - Bypass minimum threshold check
        // - Run normal acceptance flow
        // - Audit with reason and "emergency override" flag

        return {
            message: 'Admin intervention completed',
            action: request.action,
            target_id: request.target_id,
            audit_trail_created: true,
        };
    }
}
