/**
 * BorrowerMarketplaceController
 * Borrower-facing marketplace endpoints — uses loan_applications / loan_offers / loans tables
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
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { LoanRepository } from '../repository/LoanRepository';

// Minimum funding threshold (%) required before borrower can accept funding
const DEFAULT_MIN_FUNDING_THRESHOLD_PERCENT = 50;
// Default funding window in hours (used when not stored on application)
const DEFAULT_FUNDING_WINDOW_HOURS = 72;

// statusId mapping for loan_applications
const STATUS_MAP: Record<number, string> = {
    1: 'OPEN',
    2: 'FUNDED',
    3: 'ACTIVE',
    4: 'REPAID',
    5: 'DEFAULTED',
    6: 'CANCELLED',
};

@Controller('/borrower/applications')
export class BorrowerMarketplaceController {

    private loanAppRepo = new LoanApplicationRepository();
    private loanOfferRepo = new LoanOfferRepository();
    private loanRepo = new LoanRepository();

    /**
     * Resolve a loan application owned by the authenticated borrower.
     * Throws with httpCode set for use by routing-controllers error handler.
     */
    private async resolveApplication(applicationId: number, borrowerId: number) {
        const application = await this.loanAppRepo.findById(applicationId);
        if (!application) {
            const err: any = new Error('Application not found');
            err.httpCode = 404;
            throw err;
        }
        if (Number(application.borrowerId) !== borrowerId) {
            const err: any = new Error('Forbidden');
            err.httpCode = 403;
            throw err;
        }

        const amount = Number(application.amount ?? 0);
        const fundedPercent = Number(application.fundedPercent ?? 0);
        const fundedAmount = Number(application.fundedAmount ?? (amount * fundedPercent / 100));
        const remainingAmount = Math.max(0, amount - fundedAmount);
        const minThreshold = (application as any).minFundingThreshold ?? DEFAULT_MIN_FUNDING_THRESHOLD_PERCENT;
        const fundingWindowHours = (application as any).fundingWindowHours ?? DEFAULT_FUNDING_WINDOW_HOURS;
        const fundingWindowEnd = new Date(new Date(application.createdAt).getTime() + fundingWindowHours * 3_600_000);

        return {
            application,
            amount,
            fundedPercent,
            fundedAmount,
            remainingAmount,
            minThreshold,
            isFundingWindowOpen: fundingWindowEnd > new Date() && application.statusId === 1,
            fundingWindowEnd,
        };
    }

    /**
     * GET /api/borrower/applications/:id/bids
     * Returns all offers on the borrower's loan application (lender identities masked).
     */
    @Get('/:id/bids')
    async getBidsForLoan(
        @Param('id') applicationId: string,
        @Req() req: Request & { user?: any },
    ) {
        const borrowerId = Number((req as any).user?.id);
        const appId = Number(applicationId);
        const { application, fundedPercent, fundedAmount, fundingWindowEnd } =
            await this.resolveApplication(appId, borrowerId);

        const loan = await this.loanRepo.findByApplicationId(appId);
        const offers = loan ? await this.loanOfferRepo.findByLoanId(loan.id) : [];

        // COMPLIANCE: Lender identity masked — only show bid stats
        const maskedBids = offers.map((offer, idx) => ({
            id: offer.id,
            lender: `Lender ${idx + 1}`,
            bid_amount: Number(offer.amount),
            status: (offer as any).status ?? 'ACTIVE',
            placed_at: offer.createdAt,
        }));

        return {
            statusCode: '200',
            data: {
                loan_request_id: appId,
                bids: maskedBids,
                total_bid_count: maskedBids.length,
                total_bid_amount: fundedAmount,
                funding_progress_percent: fundedPercent,
                funding_window_ends_at: fundingWindowEnd.toISOString(),
            },
        };
    }

    /**
     * GET /api/borrower/applications/:id/funding-status
     * Returns comprehensive funding status for a loan application.
     */
    @Get('/:id/funding-status')
    async getFundingStatus(
        @Param('id') applicationId: string,
        @Req() req: Request & { user?: any },
    ) {
        const borrowerId = Number((req as any).user?.id);
        const appId = Number(applicationId);
        const { application, amount, fundedPercent, fundedAmount, remainingAmount, minThreshold, isFundingWindowOpen, fundingWindowEnd } =
            await this.resolveApplication(appId, borrowerId);

        const loan = await this.loanRepo.findByApplicationId(appId);
        const offers = loan ? await this.loanOfferRepo.findByLoanId(loan.id) : [];
        const activeBidCount = offers.filter((o: any) => (o.status ?? 'ACTIVE') === 'ACTIVE').length;

        return {
            statusCode: '200',
            data: {
                loan_request_id: String(appId),
                amount_requested: amount,
                amount_funded: fundedAmount,
                remaining_amount: remainingAmount,
                min_funding_threshold: minThreshold,
                is_minimum_threshold_met: fundedPercent >= minThreshold,
                funding_progress_percent: fundedPercent,
                is_funding_window_open: isFundingWindowOpen,
                funding_window_ends_at: fundingWindowEnd.toISOString(),
                active_bid_count: activeBidCount,
                status: STATUS_MAP[application.statusId] ?? 'OPEN',
            },
        };
    }

    /**
     * POST /api/borrower/applications/:id/accept-funding
     * Accepts funding once the minimum threshold is met — transitions application to FUNDED (statusId=2).
     */
    @Post('/:id/accept-funding')
    @HttpCode(200)
    async acceptFunding(
        @Param('id') applicationId: string,
        @Req() req: Request & { user?: any },
        @Body() _body: any,
    ) {
        const borrowerId = Number((req as any).user?.id);
        const appId = Number(applicationId);
        const { application, fundedPercent, fundedAmount, minThreshold } =
            await this.resolveApplication(appId, borrowerId);

        if (application.statusId !== 1) {
            const err: any = new Error(`Application is not in OPEN status (current: ${STATUS_MAP[application.statusId] ?? application.statusId})`);
            err.httpCode = 400;
            throw err;
        }

        if (fundedPercent < minThreshold) {
            const err: any = new Error(
                `Minimum funding threshold not met. Required: ${minThreshold}%, Current: ${fundedPercent.toFixed(1)}%`
            );
            err.httpCode = 400;
            throw err;
        }

        // Transition to FUNDED (statusId = 2)
        await this.loanAppRepo.update(appId, { statusId: 2 } as any);

        return {
            statusCode: '200',
            data: {
                loan_request_id: String(appId),
                status: 'FUNDED',
                amount_funded: fundedAmount,
                message: 'Funding accepted successfully.',
            },
        };
    }
}
