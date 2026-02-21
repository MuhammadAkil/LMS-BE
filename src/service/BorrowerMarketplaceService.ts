import { Request, Response } from 'express';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { BorrowerApiResponse } from '../dto/BorrowerDtos';

/**
 * BorrowerMarketplaceService
 * Express-compatible wrapper for marketplace endpoints.
 * Handles: GET bids, GET funding-status, POST accept-funding
 */
export class BorrowerMarketplaceService {
    private loanAppRepo: LoanApplicationRepository;
    private loanOfferRepo: LoanOfferRepository;

    constructor() {
        this.loanAppRepo = new LoanApplicationRepository();
        this.loanOfferRepo = new LoanOfferRepository();
    }

    /**
     * GET /api/borrower/applications/:id/bids
     * Returns all bids (offers) on a loan application with lender identities masked.
     */
    async getBids(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const applicationId = parseInt(req.params.id, 10);

            // Verify ownership
            const application = await this.loanAppRepo.findById(applicationId);
            if (!application || application.borrowerId?.toString() !== borrowerId) {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'Application not found',
                    timestamp: new Date().toISOString(),
                } as BorrowerApiResponse<null>);
                return;
            }

            const offers = await this.loanOfferRepo.findByLoanId(applicationId);

            const maskedBids = (offers ?? []).map((offer: any, index: number) => ({
                id: offer.id,
                lenderMasked: `Lender ${index + 1}`,
                amount: offer.amount,
                annualRate: offer.annualRate ?? offer.interest_rate,
                status: offer.status ?? 'ACTIVE',
                timestamp: offer.createdAt ?? offer.created_at,
            }));

            const totalBidAmount = maskedBids.reduce((sum: number, b: any) => sum + (Number(b.amount) ?? 0), 0);
            const fundedAmount = Number(application.fundedPercent ?? 0) * Number(application.amount) / 100;
            const fundingPercent = Number(application.fundedPercent ?? 0);

            const fundingWindowHours = (application as any).fundingWindowHours ?? 72;
            const createdAt = application.createdAt ?? new Date();
            const fundingWindowEnd = new Date(new Date(createdAt).getTime() + fundingWindowHours * 3600 * 1000);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Bids retrieved successfully',
                data: {
                    bids: maskedBids,
                    total_bid_amount: totalBidAmount,
                    total_allocated: fundedAmount,
                    pool_coverage_percent: fundingPercent,
                    funding_window_ends_at: fundingWindowEnd,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getBids:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/applications/:id/funding-status
     * Returns comprehensive funding status for a loan application.
     */
    async getFundingStatus(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const applicationId = parseInt(req.params.id, 10);

            const application = await this.loanAppRepo.findById(applicationId);
            if (!application || application.borrowerId?.toString() !== borrowerId) {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'Application not found',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const offers = await this.loanOfferRepo.findByLoanId(applicationId);
            const amount = Number(application.amount ?? 0);
            const fundingPercent = Number(application.fundedPercent ?? 0);
            const fundedAmount = amount * fundingPercent / 100;
            const remainingAmount = amount - fundedAmount;
            const minThreshold = (application as any).minFundingThreshold ?? 50;
            const isMinThresholdMet = fundingPercent >= minThreshold;
            const fundingWindowHours = (application as any).fundingWindowHours ?? 72;
            const createdAt = application.createdAt ?? new Date();
            const fundingWindowEnd = new Date(new Date(createdAt).getTime() + fundingWindowHours * 3600 * 1000);
            const isFundingWindowOpen = fundingWindowEnd > new Date() && (application.statusId === 1 || application.statusId === 2);
            const activeBidCount = (offers ?? []).filter((o: any) => o.status === 'OPEN' || o.status === 'ACTIVE').length;

            const statusMap: Record<number, string> = { 1: 'OPEN', 2: 'FUNDED', 3: 'ACTIVE', 4: 'REPAID', 5: 'DEFAULTED', 6: 'CANCELLED' };

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Funding status retrieved successfully',
                data: {
                    loan_request_id: String(applicationId),
                    amount_requested: amount,
                    amount_funded: fundedAmount,
                    remaining_amount: remainingAmount,
                    min_funding_threshold: minThreshold,
                    is_minimum_threshold_met: isMinThresholdMet,
                    funding_progress_percent: fundingPercent,
                    is_funding_window_open: isFundingWindowOpen,
                    funding_window_ends_at: fundingWindowEnd,
                    active_bid_count: activeBidCount,
                    status: statusMap[application.statusId] ?? 'OPEN',
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getFundingStatus:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /api/borrower/applications/:id/accept-funding
     * Accepts funding for a loan application — transitions to FUNDED status.
     * Body: { loan_request_id, bid_ids? }
     */
    async acceptFunding(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const applicationId = parseInt(req.params.id, 10);

            const application = await this.loanAppRepo.findById(applicationId);
            if (!application || application.borrowerId?.toString() !== borrowerId) {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'Application not found',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const amount = Number(application.amount ?? 0);
            const fundingPercent = Number(application.fundedPercent ?? 0);
            const fundedAmount = amount * fundingPercent / 100;
            const minThreshold = (application as any).minFundingThreshold ?? 50;

            if (fundingPercent < minThreshold) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: `Minimum funding threshold not met. Required: ${minThreshold}%, Current: ${fundingPercent.toFixed(1)}%`,
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            // Update application status to FUNDED (statusId = 2)
            await this.loanAppRepo.update(applicationId, { statusId: 2 } as any);

            const offers = await this.loanOfferRepo.findByLoanId(applicationId);
            const acceptedBidCount = (offers ?? []).length;

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Funding accepted successfully',
                data: {
                    loan_request_id: String(applicationId),
                    status: 'FUNDED',
                    amount_funded: fundedAmount,
                    accepted_bid_count: acceptedBidCount,
                    message: `Successfully accepted funding. ${acceptedBidCount} bids allocated.`,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in acceptFunding:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
