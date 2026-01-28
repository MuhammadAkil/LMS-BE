import { Request, Response } from 'express';
import { LenderOffersService } from '../service/LenderOffersService';
import { MakeOfferRequest } from '../dto/LenderDtos';

/**
 * L-03: LENDER OFFERS CONTROLLER (CRITICAL)
 * POST /lender/offers
 * GET /lender/offers/validate
 * This is the critical path for the business model
 */
export class LenderOffersController {
    private offersService: LenderOffersService;

    constructor() {
        this.offersService = new LenderOffersService();
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
    async createOffer(req: Request, res: Response): Promise<void> {
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
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to create offer',
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
    async validateOffer(req: Request, res: Response): Promise<void> {
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

        if (request.amount && request.amount > 1000000) {
            errors.push('amount exceeds maximum allowed value');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}
