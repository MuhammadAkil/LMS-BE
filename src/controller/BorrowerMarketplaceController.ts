/**
 * BorrowerMarketplaceController
 * Borrower-facing marketplace endpoints — direct DB implementation
 *
 * Endpoints:
 * - GET  /api/borrower/applications/:id/bids
 * - GET  /api/borrower/applications/:id/funding-status
 * - POST /api/borrower/applications/:id/accept-funding
 */

import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Req,
    HttpCode,
} from 'routing-controllers';
import { Request } from 'express';
import { AppDataSource } from '../config/database';

@Controller('/borrower/applications')
export class BorrowerMarketplaceController {

    /** Resolve loan_request for the authenticated borrower — throws if not found / not owner */
    private async resolveLoanRequest(loanRequestId: number, borrowerId: number) {
        const rows: any[] = await AppDataSource.query(
            `SELECT lr.*, COALESCE(SUM(b.bid_amount),0) AS computed_funded
             FROM loan_requests lr
             LEFT JOIN marketplace_bids b ON b.loan_request_id = lr.id AND b.status IN ('ACTIVE','PARTIALLY_FILLED')
             WHERE lr.id = ?
             GROUP BY lr.id`,
            [loanRequestId]
        );
        const lr = rows[0];
        if (!lr) {
            const err: any = new Error('Loan request not found');
            err.httpCode = 404;
            throw err;
        }
        if (Number(lr.borrower_id) !== borrowerId) {
            const err: any = new Error('Forbidden');
            err.httpCode = 403;
            throw err;
        }
        const amountFunded = Number(lr.amount_funded ?? lr.computed_funded ?? 0);
        const amountRequested = Number(lr.amount_requested ?? 0);
        const minThreshold = Number(lr.min_funding_threshold ?? 0);
        const fundingWindowEndsAt = lr.funding_window_ends_at ? new Date(lr.funding_window_ends_at) : null;
        return {
            id: lr.id,
            borrower_id: lr.borrower_id,
            amount_requested: amountRequested,
            amount_funded: amountFunded,
            remaining_amount: Math.max(0, amountRequested - amountFunded),
            min_funding_threshold: minThreshold,
            is_minimum_threshold_met: amountFunded >= minThreshold,
            funding_progress_percent: amountRequested > 0 ? Math.round((amountFunded / amountRequested) * 100) : 0,
            is_funding_window_open: fundingWindowEndsAt ? fundingWindowEndsAt > new Date() : true,
            funding_window_ends_at: fundingWindowEndsAt ? fundingWindowEndsAt.toISOString() : null,
            status: lr.status,
        };
    }

    /**
     * GET /api/borrower/applications/:id/bids
     * Borrower views all bids on their loan application (lender identities masked)
     */
    @Get('/:id/bids')
    async getBidsForLoan(
        @Param('id') loanRequestId: string,
        @Req() req: Request & { user?: any },
    ) {
        const borrowerId = Number((req as any).user?.id);
        const lrId = Number(loanRequestId);
        const loanRequest = await this.resolveLoanRequest(lrId, borrowerId);

        const bids: any[] = await AppDataSource.query(
            `SELECT id, bid_amount, status, created_at
             FROM marketplace_bids
             WHERE loan_request_id = ?
             ORDER BY created_at DESC`,
            [lrId]
        );

        // COMPLIANCE: Lender identity masked — only show bid stats
        const maskedBids = bids.map((b, idx) => ({
            id: b.id,
            lender: `Lender ${idx + 1}`,   // masked
            bid_amount: Number(b.bid_amount),
            status: b.status,
            placed_at: b.created_at,
        }));

        return {
            statusCode: '200',
            data: {
                loan_request_id: lrId,
                bids: maskedBids,
                total_bid_count: maskedBids.length,
                total_bid_amount: loanRequest.amount_funded,
                funding_progress_percent: loanRequest.funding_progress_percent,
                funding_window_ends_at: loanRequest.funding_window_ends_at,
            },
        };
    }

    /**
     * GET /api/borrower/applications/:id/funding-status
     * Get comprehensive funding status for a loan application
     */
    @Get('/:id/funding-status')
    async getFundingStatus(
        @Param('id') loanRequestId: string,
        @Req() req: Request & { user?: any },
    ) {
        const borrowerId = Number((req as any).user?.id);
        const lrId = Number(loanRequestId);
        const loanRequest = await this.resolveLoanRequest(lrId, borrowerId);

        const bids: any[] = await AppDataSource.query(
            `SELECT id, status FROM marketplace_bids WHERE loan_request_id = ?`,
            [lrId]
        );
        const activeBidCount = bids.filter(b => b.status === 'ACTIVE' || b.status === 'PARTIALLY_FILLED').length;

        return {
            statusCode: '200',
            data: {
                loan_request_id: lrId,
                amount_requested: loanRequest.amount_requested,
                amount_funded: loanRequest.amount_funded,
                remaining_amount: loanRequest.remaining_amount,
                min_funding_threshold: loanRequest.min_funding_threshold,
                is_minimum_threshold_met: loanRequest.is_minimum_threshold_met,
                funding_progress_percent: loanRequest.funding_progress_percent,
                is_funding_window_open: loanRequest.is_funding_window_open,
                funding_window_ends_at: loanRequest.funding_window_ends_at,
                active_bid_count: activeBidCount,
                status: loanRequest.status,
            },
        };
    }

    /**
     * POST /api/borrower/applications/:id/accept-funding
     * Accept funding once minimum threshold is met
     */
    @Post('/:id/accept-funding')
    @HttpCode(200)
    async acceptFunding(
        @Param('id') loanRequestId: string,
        @Req() req: Request & { user?: any },
        @Body() _body: any,
    ) {
        const borrowerId = Number((req as any).user?.id);
        const lrId = Number(loanRequestId);
        const loanRequest = await this.resolveLoanRequest(lrId, borrowerId);

        if (!loanRequest.is_minimum_threshold_met) {
            const err: any = new Error(
                `Minimum funding threshold not met. Required: ${loanRequest.min_funding_threshold}, Current: ${loanRequest.amount_funded}`
            );
            err.httpCode = 400;
            throw err;
        }

        await AppDataSource.query(
            `UPDATE loan_requests SET status = 'FUNDED' WHERE id = ?`,
            [lrId]
        );

        return {
            statusCode: '200',
            data: {
                loan_request_id: lrId,
                status: 'FUNDED',
                amount_funded: loanRequest.amount_funded,
                message: 'Funding accepted successfully.',
            },
        };
    }
}
