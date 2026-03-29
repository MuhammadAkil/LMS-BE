import { Request, Response } from 'express';
import { Controller, Get, Patch, Post, Req, Res, UseBefore, Body, Param } from 'routing-controllers';
import { LenderDashboardService } from '../service/LenderDashboardService';
import { LenderLoansService } from '../service/LenderLoansService';
import { LoanDisbursementService, ConfirmDisbursementRequest } from '../service/LoanDisbursementService';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { LenderRoleGuard } from '../middleware/LenderGuards';
import { withLenderStatusGuard, withLenderVerificationGuard } from '../middleware/LenderGuardWrappers';

/**
 * L-01: LENDER DASHBOARD CONTROLLER
 * GET /lender/dashboard/stats
 * GET /lender/dashboard/alerts
 * All operations are read-only
 */
@Controller('/lender/dashboard')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderDashboardController {
    private dashboardService: LenderDashboardService;

    constructor() {
        this.dashboardService = new LenderDashboardService();
    }

    /**
     * GET /lender/dashboard/stats
     * Returns dashboard statistics
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/stats')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getDashboardStats(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;

            const stats = await this.dashboardService.getDashboardStats(lenderId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Dashboard stats retrieved successfully',
                data: stats,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getDashboardStats:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve dashboard stats',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/dashboard/alerts
     * Returns alerts for overdue repayments, pending actions, automation issues
     * Query params: page, pageSize
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/alerts')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getAlerts(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const page = parseInt((req.query.page as string) || '1');
            const pageSize = parseInt((req.query.pageSize as string) || '20');

            const alerts = await this.dashboardService.getAlerts(lenderId, { page, pageSize });

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Alerts retrieved successfully',
                data: alerts,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getAlerts:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve alerts',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PATCH /lender/dashboard/alerts/:alertId
     * Mark alert as resolved
     * Required guards: LenderRoleGuard, LenderStatusGuard
     */
    @Patch('/alerts/:alertId')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(0))
    async resolveAlert(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const { alertId } = req.params;

            await this.dashboardService.markAlertResolved(lenderId, alertId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Alert marked as resolved',
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in resolveAlert:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to resolve alert',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}

/**
 * L-02: LENDER LOANS CONTROLLER
 * GET /lender/loans
 * GET /lender/loans/:id
 * All operations are read-only
 */
@Controller('/lender/loans')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderLoansController {
    private loansService: LenderLoansService;
    private disbursementService: LoanDisbursementService;

    constructor() {
        this.loansService = new LenderLoansService();
        this.disbursementService = new LoanDisbursementService();
    }

    /**
     * GET /lender/loans
     * Browse available loans for investment
     * Only shows OPEN loan_applications
     * Query params: status, minAmount, maxAmount, minDuration, maxDuration, sortBy, sortOrder, page, pageSize
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async browseLoansPaginated(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;

            const filters = {
                status: (req.query.status as string) || 'OPEN',
                minAmount: req.query.minAmount ? parseInt(req.query.minAmount as string) : undefined,
                maxAmount: req.query.maxAmount ? parseInt(req.query.maxAmount as string) : undefined,
                minDuration: req.query.minDuration ? parseInt(req.query.minDuration as string) : undefined,
                maxDuration: req.query.maxDuration ? parseInt(req.query.maxDuration as string) : undefined,
                sortBy: (req.query.sortBy as any) || 'created_at',
                sortOrder: (req.query.sortOrder as any) || 'DESC',
                page: parseInt((req.query.page as string) || '1'),
                pageSize: parseInt((req.query.pageSize as string) || '10'),
            };

            const loans = await this.loansService.browseLoansPaginated(lenderId, filters);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Loans retrieved successfully',
                data: loans,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in browseLoansPaginated:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve loans',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/loans/:loanId/funding-status
     * Lightweight status for polling (funded %, remaining, offer count).
     */
    @Get('/:loanId/funding-status')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getFundingStatus(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const { loanId } = req.params;
            const status = await this.loansService.getFundingStatus(loanId);
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'OK',
                data: status,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            const code = error.message === 'Loan not found' ? 404 : 500;
            res.status(code).json({
                statusCode: String(code),
                statusMessage: error.message || 'Failed to get funding status',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/loans/:loanId
     * Get specific loan details
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/:loanId')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getLoanDetail(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const { loanId } = req.params;

            const loan = await this.loansService.getLoanDetail(lenderId, loanId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Loan details retrieved successfully',
                data: loan,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getLoanDetail:', error);
            const statusCode = error.message === 'Loan not found' ? '404' : '500';
            res.status(parseInt(statusCode)).json({
                statusCode,
                statusMessage: 'Failed to retrieve loan details',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /lender/loans/:loanId/disbursement
     * Confirm off-platform disbursement (lender direct bank transfer to borrower).
     * Body: { amount, transferDate, referenceNumber? }
     */
    @Post('/:loanId/disbursement')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(0))
    async confirmDisbursement(
        @Req() req: Request,
        @Res() res: Response,
        @Param('loanId') loanId: number,
        @Body() body: ConfirmDisbursementRequest
    ): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            if (!body?.amount || body.amount <= 0 || !body?.transferDate) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'amount and transferDate are required',
                    errors: ['amount and transferDate are required'],
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            const data = await this.disbursementService.confirmByLender(lenderId, loanId, {
                amount: Number(body.amount),
                transferDate: String(body.transferDate),
                referenceNumber: body.referenceNumber,
            });
            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Disbursement confirmed. Borrower has been notified.',
                data,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            const code = error.message?.includes('not found') || error.message?.includes('already been recorded') ? 400 : 500;
            res.status(code).json({
                statusCode: String(code),
                statusMessage: error.message || 'Failed to confirm disbursement',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
