import { Request, Response } from 'express';
import { BorrowerLoanHistoryService } from '../service/BorrowerLoanHistoryService';
import {
    LoanHistoryListResponse,
    LoanHistoryDetailDto,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';

/**
 * B-06: BORROWER LOAN HISTORY CONTROLLER
 * Endpoints:
 * - GET /api/borrower/loans/history
 * - GET /api/borrower/loans/history/:id
 * Guards: BorrowerRoleGuard, BorrowerStatusGuard(allowReadOnly=true), BorrowerVerificationGuard(level=0)
 */
export class BorrowerLoanHistoryController {
    private loanHistoryService: BorrowerLoanHistoryService;

    constructor() {
        this.loanHistoryService = new BorrowerLoanHistoryService();
    }

    /**
     * GET /api/borrower/loans/history
     * Get loan history (REPAID and DEFAULTED loans)
     * Query params: page, pageSize
     */
    async getLoanHistoryPaginated(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const page = parseInt(req.query.page as string) || 1;
            const pageSize = parseInt(req.query.pageSize as string) || 10;

            const result = await this.loanHistoryService.getLoanHistoryPaginated(
                borrowerId,
                page,
                pageSize
            );

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
     * GET /api/borrower/loans/history/:id
     * Get loan history detail with contract
     */
    async getLoanHistoryDetail(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const loanId = req.params.id;

            const detail = await this.loanHistoryService.getLoanHistoryDetail(borrowerId, loanId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Loan history retrieved successfully',
                data: detail,
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
}
