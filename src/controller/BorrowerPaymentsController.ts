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
 * - POST /api/borrower/payments/commission          — Step 1: Portal commission
 * - POST /api/borrower/payments/voluntary/:appId    — Step 3: Voluntary commission
 * - PUT  /api/borrower/payments/voluntary/:appId/amount — Set voluntary commission amount
 * - GET  /api/borrower/payments/steps/:appId        — Get all payment steps for application
 * - GET  /api/borrower/payments/status/:id          — Get payment status
 */
@Controller('/borrower/payments')
export class BorrowerPaymentsController {
    private paymentsService: BorrowerPaymentsService;

    constructor() {
        this.paymentsService = new BorrowerPaymentsService();
    }

    /**
     * POST /api/borrower/payments/commission
     * Step 1: Initiate portal commission payment via Przelewy24.
     * Must be completed before voluntary commission.
     */
    @Post('/commission')
    async initiateCommissionPayment(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const request: InitiateCommissionPaymentRequest = req.body;

            if (!request.applicationId) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Application ID is required',
                    errors: ['applicationId is required'],
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const payment = await this.paymentsService.initiateCommissionPayment(borrowerId, request);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Portal commission payment initiated. Redirect user to paymentUrl.',
                data: payment,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<any>);
        } catch (error: any) {
            res.status(400).json({
                statusCode: '400',
                statusMessage: error.message,
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /api/borrower/payments/voluntary/:applicationId
     * Step 3: Initiate voluntary lender commission payment via Przelewy24.
     * Requires portal commission to be PAID first.
     */
    @Post('/voluntary/:applicationId')
    async initiateVoluntaryCommission(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const applicationId = parseInt(req.params.applicationId, 10);

            const payment = await this.paymentsService.initiateVoluntaryCommissionPayment(borrowerId, applicationId);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Voluntary commission payment initiated. Redirect user to paymentUrl.',
                data: payment,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<any>);
        } catch (error: any) {
            res.status(400).json({
                statusCode: '400',
                statusMessage: error.message,
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PUT /api/borrower/payments/voluntary/:applicationId/amount
     * Set the voluntary commission amount for a loan application.
     * Body: { amount: number }
     */
    @Post('/voluntary/:applicationId/amount')
    async setVoluntaryCommissionAmount(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const applicationId = parseInt(req.params.applicationId, 10);
            const { amount } = req.body;

            if (amount === undefined || amount === null) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Amount is required',
                    errors: ['amount is required'],
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            await this.paymentsService.setVoluntaryCommission(borrowerId, applicationId, Number(amount));

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Voluntary commission amount set successfully',
                data: { applicationId, voluntaryCommission: Number(amount) },
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<any>);
        } catch (error: any) {
            res.status(400).json({
                statusCode: '400',
                statusMessage: error.message,
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/payments/steps/:applicationId
     * Get all payment steps and their statuses for a loan application.
     */
    @Get('/steps/:applicationId')
    async getPaymentSteps(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const applicationId = parseInt(req.params.applicationId, 10);

            const steps = await this.paymentsService.getPaymentSteps(borrowerId, applicationId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Payment steps retrieved',
                data: steps,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<any>);
        } catch (error: any) {
            res.status(400).json({
                statusCode: '400',
                statusMessage: error.message,
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/payments/status/:id
     * Get payment status by payment ID.
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
            res.status(400).json({
                statusCode: '400',
                statusMessage: error.message,
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
