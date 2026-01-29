import { Request, Response } from 'express';
import { BorrowerLoansService } from '../service/BorrowerLoansService';
import {
    ActiveLoanListResponse,
    LoanDetailDto,
    RepaymentScheduleItemDto,
    PaymentHistoryDto,
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
export class BorrowerLoansController {
    private loansService: BorrowerLoansService;

    constructor() {
        this.loansService = new BorrowerLoansService();
    }

    /**
     * GET /api/borrower/loans
     * Get active loans (paginated)
     * Query params: page, pageSize
     */
    async getActiveLoansPaginated(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const page = parseInt(req.query.page as string) || 1;
            const pageSize = parseInt(req.query.pageSize as string) || 10;

            const result = await this.loansService.getActiveLoansPaginated(borrowerId, page, pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Active loans retrieved successfully',
                data: result,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<ActiveLoanListResponse>);
        } catch (error: any) {
            console.error('Error in getActiveLoansPaginated:', error);
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
    async getLoanDetail(req: Request, res: Response): Promise<void> {
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
    async getRepaymentSchedule(req: Request, res: Response): Promise<void> {
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
     * GET /api/borrower/loans/:id/payments
     * Get payment history for loan
     * Query params: page, pageSize
     */
    async getPaymentHistory(req: Request, res: Response): Promise<void> {
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
