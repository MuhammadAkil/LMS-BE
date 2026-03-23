import { Req, Res, Controller, Get, Post, Param, QueryParam, HttpCode } from 'routing-controllers';
import { Request, Response } from 'express';
import { BorrowerLoansService } from '../service/BorrowerLoansService';
import { BorrowerLoanHistoryService } from '../service/BorrowerLoanHistoryService';
import config from '../config/Config';
import {
    ActiveLoanListResponse,
    LoanDetailDto,
    RepaymentScheduleItemDto,
    PaymentHistoryDto,
    LoanHistoryListResponse,
    LoanHistoryDetailDto,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';

/**
 * B-05: BORROWER ACTIVE LOANS CONTROLLER
 * Endpoints:
 * - GET /api/borrower/loans
 * - GET /api/borrower/loans/:id
 * - GET /api/borrower/loans/:id/schedule
 * - GET /api/borrower/loans/:id/payments
 * Guards: BorrowerRoleGuard, BorrowerStatusGuard(allowReadOnly=true), BorrowerVerificationGuard(level=0)
 */
@Controller('/borrower/loans')
export class BorrowerLoansController {
    private loansService: BorrowerLoansService;
    private loanHistoryService: BorrowerLoanHistoryService;

    constructor() {
        this.loansService = new BorrowerLoansService();
        this.loanHistoryService = new BorrowerLoanHistoryService();
    }

    /**
     * GET /api/borrower/loans
     * Get active loans (paginated)
     * Query params: page, pageSize
     */
    @Get('/')
    @HttpCode(200)
    async getActiveLoansPaginated(@Req() req: Request, @Res() res: Response, @QueryParam('page') page?: number, @QueryParam('pageSize') pageSize?: number): Promise<any> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const pageNum = page || 1;
            const pageSizeNum = pageSize || 10;

            const result = await this.loansService.getActiveLoansPaginated(borrowerId, pageNum, pageSizeNum);

            return {
                statusCode: '200',
                statusMessage: 'Active loans retrieved successfully',
                data: result,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<ActiveLoanListResponse>;
        } catch (error: any) {
            console.error('Error in getActiveLoansPaginated:', error);
            res.status(500);
            return {
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * GET /api/borrower/loans/history
     * Get loan history (REPAID and DEFAULTED loans)
     * IMPORTANT: must be declared before /:id to avoid shadowing
     */
    @Get('/history')
    async getLoanHistoryPaginated(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const page = parseInt(req.query.page as string) || 1;
            const pageSize = parseInt(req.query.pageSize as string) || 10;

            const result = await this.loanHistoryService.getLoanHistoryPaginated(borrowerId, page, pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Loan history retrieved successfully',
                data: result,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<LoanHistoryListResponse>);
        } catch (error: any) {
            console.error('Error in getLoanHistoryPaginated:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/loans/history/:histId
     * Get loan history detail with contract
     * IMPORTANT: must be declared before /:id to avoid shadowing
     */
    @Get('/history/:histId')
    async getLoanHistoryDetail(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const loanId = req.params.histId;

            const result = await this.loanHistoryService.getLoanHistoryDetail(borrowerId, loanId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Loan history detail retrieved successfully',
                data: result,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<LoanHistoryDetailDto>);
        } catch (error: any) {
            console.error('Error in getLoanHistoryDetail:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/loans/:id
     * Get loan details with repayment schedule
     */
    @Get('/:id')
    async getLoanDetail(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const loanId = req.params.id;

            const loan = await this.loansService.getLoanDetail(borrowerId, loanId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Loan retrieved successfully',
                data: loan,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<LoanDetailDto>);
        } catch (error: any) {
            console.error('Error in getLoanDetail:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/loans/:id/schedule
     * Get repayment schedule for loan
     */
    @Get('/:id/schedule')
    async getRepaymentSchedule(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const loanId = req.params.id;

            const schedule = await this.loansService.getRepaymentSchedule(borrowerId, loanId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Repayment schedule retrieved successfully',
                data: schedule,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<RepaymentScheduleItemDto[]>);
        } catch (error: any) {
            console.error('Error in getRepaymentSchedule:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /api/borrower/loans/:id/repayments/:repaymentId/confirm
     * Borrower marks an installment as paid (self-report).
     */
    @Post('/:id/repayments/:repaymentId/confirm')
    async confirmRepayment(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const loanId = req.params.id;
            const repaymentId = req.params.repaymentId;
            const headerFlag = String(req.header('X-E2E-Test') ?? '').toLowerCase() === 'true';
            const isE2EMock = headerFlag || Boolean(config.e2e?.mockPayment);

            const result = await this.loansService.confirmRepayment(borrowerId, loanId, repaymentId, {
                isE2EMockPayment: isE2EMock,
            });

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Repayment marked as paid (direct transfer between contract parties)',
                data: result,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in confirmRepayment:', error);
            res.status(400).json({
                statusCode: '400',
                statusMessage: error.message || 'Failed to confirm repayment',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/loans/:id/payments
     * Get payment history for loan
     * Query params: page, pageSize
     */
    @Get('/:id/payments')
    async getPaymentHistory(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const loanId = req.params.id;
            const page = parseInt(req.query.page as string) || 1;
            const pageSize = parseInt(req.query.pageSize as string) || 10;

            const payments = await this.loansService.getPaymentHistory(
                borrowerId,
                loanId,
                page,
                pageSize
            );

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Payment history retrieved successfully',
                data: payments,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<PaymentHistoryDto>);
        } catch (error: any) {
            console.error('Error in getPaymentHistory:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
