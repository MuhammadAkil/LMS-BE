import { Request, Response } from 'express';
import { Controller, Post, Get, Param, Req, Res, BodyParam } from 'routing-controllers';
import { LmsPaymentsService } from '../service/LmsPaymentsService';
import { CreatePaymentRequest } from '../dto/PaymentDtos';

/**
 * LMS course payments (Przelewy24).
 * - POST /api/payments/create — create payment, get redirect URL
 * - GET  /api/payments/status/:id — get payment status (authenticated)
 * - GET  /api/payments/status/session/:sessionId — get status by session (e.g. after return from P24)
 */
@Controller('/payments')
export class PaymentsController {
    private service: LmsPaymentsService;

    constructor() {
        this.service = new LmsPaymentsService();
    }

    @Post('/create')
    async create(
        @Req() req: Request,
        @Res() res: Response,
        @BodyParam('courseId') courseId: number,
        @BodyParam('amount') amount?: number
    ): Promise<void> {
        try {
            const user = (req as any).user;
            if (!user?.id && !user?.userId) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            const userId = Number(user.id ?? user.userId);
            if (!courseId || isNaN(courseId)) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Bad Request',
                    errors: ['courseId is required and must be a number'],
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            const body: CreatePaymentRequest = { courseId, amount };
            const data = await this.service.createPayment(userId, body);
            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Payment created',
                data,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('PaymentsController.create:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error?.message ?? 'Create payment failed'],
                timestamp: new Date().toISOString(),
            });
        }
    }

    @Get('/status/session/:sessionId')
    async getStatusBySession(
        @Req() req: Request,
        @Res() res: Response,
        @Param('sessionId') sessionId: string
    ): Promise<void> {
        try {
            if (!sessionId) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'sessionId required',
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            const data = await this.service.getPaymentStatusBySessionId(sessionId);
            if (!data) {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'Payment not found',
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'OK',
                data,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('PaymentsController.getStatusBySession:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                timestamp: new Date().toISOString(),
            });
        }
    }

    @Get('/status/:id')
    async getStatus(@Req() req: Request, @Res() res: Response, @Param('id') id: string): Promise<void> {
        try {
            const user = (req as any).user;
            if (!user?.id && !user?.userId) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            const userId = Number(user.id ?? user.userId);
            const paymentId = parseInt(id, 10);
            if (isNaN(paymentId)) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid payment id',
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            const data = await this.service.getPaymentStatus(userId, paymentId);
            if (!data) {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'Payment not found',
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'OK',
                data,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('PaymentsController.getStatus:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                timestamp: new Date().toISOString(),
            });
        }
    }
}
