import { Request, Response } from 'express';
import { Controller, Post, Get, Param, Req, Res } from 'routing-controllers';
import { BorrowerPaymentsService } from '../service/BorrowerPaymentsService';
import {
    InitiateCommissionPaymentRequest,
    CommissionPaymentStatusDto,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';

/**
 * B-04: BORROWER PAYMENTS CONTROLLER
 * Endpoints:
 * - POST /api/borrower/payments/commission
 * - GET  /api/borrower/payments/status/:id
 * Guards: BorrowerRoleGuard, BorrowerStatusGuard, BorrowerVerificationGuard
 */
@Controller('/borrower/payments')
export class BorrowerPaymentsController {
    private paymentsService: BorrowerPaymentsService;

    constructor() {
        this.paymentsService = new BorrowerPaymentsService();
    }

    /**
     * POST /api/borrower/payments/commission
     * Initiate commission payment
     * Body: { applicationId, paymentMethod, returnUrl? }
     * Response: { redirectUrl, paymentId }
     *
     * Rules:
     * - Commission must be paid before loan activation
     * - Payment provider: PRZELEWY24
     * - Creates immutable payment record
     */
    @Post('/commission')
    async initiateCommissionPayment(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const request: InitiateCommissionPaymentRequest = req.body;

            // Validation
            if (!request.applicationId || !request.paymentMethod) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid request',
                    errors: ['Application ID and payment method are required'],
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const payment = await this.paymentsService.initiateCommissionPayment(
                borrowerId,
                request
            );

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Commission payment initiated',
                data: payment,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<any>);
        } catch (error: any) {
            console.error('Error in initiateCommissionPayment:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/payments/status/:id
     * Get payment status
     * Returns: payment ID, status (PENDING, PAID, FAILED), amounts, dates
     */
    @Get('/status/:id')
    async getPaymentStatus(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const paymentId = req.params.id;

            const payment = await this.paymentsService.getPaymentStatus(borrowerId, paymentId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Payment status retrieved successfully',
                data: payment,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<CommissionPaymentStatusDto>);
        } catch (error: any) {
            console.error('Error in getPaymentStatus:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Webhook endpoint for payment gateway callbacks
     * Called by Przelewy24 after payment completion
     * Path: POST /api/borrower/payments/callback
     * Body: { sessionId, amount, status, signature, ... }
     *
     * This would typically be a separate public endpoint without guards
     * to receive payment gateway callbacks
     */
    async handlePaymentCallback(req: Request, res: Response): Promise<void> {
        try {
            const { sessionId, amount, status, signature } = req.body;

            // Validate signature
            if (!sessionId || !signature) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid request',
                });
                return;
            }

            // Extract payment ID from sessionId
            const paymentId = parseInt(sessionId.split('_')[1], 10);

            await this.paymentsService.handlePaymentCallback(paymentId, status, signature, amount);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Callback processed',
            });
        } catch (error: any) {
            console.error('Error in handlePaymentCallback:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
            });
        }
    }
}
