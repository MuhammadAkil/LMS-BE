import { Request, Response } from 'express';
import { Body, Controller, Delete, Get, Post, Req, Res, UseBefore } from 'routing-controllers';
import { LenderOffersService } from '../service/LenderOffersService';
import { MakeOfferRequest } from '../dto/LenderDtos';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { LenderBankAccountGuard, LenderManagedGuard, LenderRoleGuard } from '../middleware/LenderGuards';
import { withLenderStatusGuard, withLenderVerificationGuard } from '../middleware/LenderGuardWrappers';

/**
 * L-03: LENDER OFFERS CONTROLLER (CRITICAL)
 * POST /lender/offers
 * GET /lender/offers/validate
 * This is the critical path for the business model
 */
@Controller('/lender/offers')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderOffersController {
    private offersService: LenderOffersService;

    constructor() {
        this.offersService = new LenderOffersService();
    }

    /**
     * GET /lender/offers
     * List current user's offers (My Bids).
     */
    @Get('/')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async listMyOffers(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const offers = await this.offersService.listMyOffers(lenderId);
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'OK',
                data: { offers },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to list offers',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /lender/offers
     * Create a new offer
     * Body: { loanId: string, amount: number }
     * 
     * Required guards (in order):
     * 1. LenderRoleGuard (user must be LENDER)
     * 2. LenderStatusGuard (user must be ACTIVE)
     * 3. LenderVerificationGuard (verification level >= required)
     * 4. LenderBankAccountGuard (must have verified bank account)
     * 
     * Rules enforced:
     * - Remaining amount validation
     * - Lender balance validation
     * - Transaction-based atomicity
     * - Audit logging
     * - Borrower notification
     */
    @Post('/')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(2), LenderBankAccountGuard, LenderManagedGuard)
    async createOffer(@Req() req: Request, @Res() res: Response, @Body() _body?: MakeOfferRequest): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const request: MakeOfferRequest = req.body;

            // Validate request body
            const validation = this.validateOfferRequest(request);
            if (!validation.isValid) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid offer request',
                    errors: validation.errors,
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            // Create offer
            const offer = await this.offersService.createOffer(lenderId, request);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Offer created successfully',
                data: offer,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in createOffer:', error);
            const isDuplicate = error.message?.includes('DUPLICATE_OFFER') || error.message?.includes('already have an active offer');
            const status = isDuplicate ? 409 : 500;
            res.status(status).json({
                statusCode: String(status),
                statusMessage: isDuplicate ? 'You already have an active offer on this loan.' : 'Failed to create offer',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/offers/validate
     * Validate offer before creation (without actually creating)
     * Query params: loanId, amount
     * 
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     * 
     * Returns validation result with:
     * - isValid: boolean
     * - errors: string[]
     * - warnings: string[]
     * - remainingCapacity: number
     * - estimatedROI: number
     */
    @Get('/validate')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async validateOffer(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const { loanId, amount } = req.query;

            if (!loanId || !amount) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Missing required parameters',
                    errors: ['loanId and amount are required'],
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const validation = await this.offersService.validateOffer(
                lenderId,
                loanId as string,
                parseInt(amount as string)
            );

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Offer validation completed',
                data: validation,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in validateOffer:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to validate offer',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * DELETE /lender/offers/:offerId
     * Cancel offer (only if loan is still OPEN).
     */
    @Delete('/:offerId')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(2), LenderBankAccountGuard, LenderManagedGuard)
    async cancelOffer(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const { offerId } = req.params;
            await this.offersService.cancelOffer(String(lenderId), offerId);
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Offer cancelled successfully',
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in cancelOffer:', error);
            const statusCode = error.message === 'Offer not found' || error.message?.includes('not found') ? 404 : 400;
            res.status(statusCode).json({
                statusCode: String(statusCode),
                statusMessage: error.message || 'Failed to cancel offer',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Validate offer request object
     * Returns { isValid: boolean, errors: string[] }
     */
    private validateOfferRequest(request: MakeOfferRequest): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!request.loanId || typeof request.loanId !== 'string') {
            errors.push('loanId is required and must be a string');
        }

        if (!request.amount || typeof request.amount !== 'number' || request.amount <= 0) {
            errors.push('amount is required and must be a positive number');
        }
        if (request.amount != null && request.amount < 10) {
            errors.push('Minimum offer is 10 PLN');
        }

        if (request.amount && request.amount > 1000000) {
            errors.push('amount exceeds maximum allowed value');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}
