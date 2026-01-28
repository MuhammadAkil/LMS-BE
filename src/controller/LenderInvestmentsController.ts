import { Request, Response } from 'express';
import { LenderInvestmentsService } from '../service/LenderInvestmentsService';

/**
 * L-04: LENDER INVESTMENTS CONTROLLER
 * GET /lender/investments
 * GET /lender/investments/:id
 * GET /lender/investments/:id/repayments
 * All operations are read-only
 */
export class LenderInvestmentsController {
    private investmentsService: LenderInvestmentsService;

    constructor() {
        this.investmentsService = new LenderInvestmentsService();
    }

    /**
     * GET /lender/investments
     * Get all investments for lender (paginated)
     * Query params: page, pageSize
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    async getInvestmentsPaginated(req: Request, res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const page = parseInt((req.query.page as string) || '1');
            const pageSize = parseInt((req.query.pageSize as string) || '10');

            const investments = await this.investmentsService.getInvestmentsPaginated(lenderId, page, pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Investments retrieved successfully',
                data: investments,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getInvestmentsPaginated:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve investments',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/investments/:investmentId
     * Get specific investment detail with repayment schedule
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    async getInvestmentDetail(req: Request, res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const { investmentId } = req.params;

            const investment = await this.investmentsService.getInvestmentDetail(lenderId, investmentId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Investment detail retrieved successfully',
                data: investment,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getInvestmentDetail:', error);
            const statusCode = error.message === 'Investment not found' ? '404' : '500';
            res.status(parseInt(statusCode)).json({
                statusCode,
                statusMessage: 'Failed to retrieve investment detail',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/investments/:investmentId/repayments
     * Get repayment schedule for specific investment
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    async getInvestmentRepayments(req: Request, res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const { investmentId } = req.params;

            const repayments = await this.investmentsService.getInvestmentRepayments(lenderId, investmentId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Repayment schedule retrieved successfully',
                data: repayments,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getInvestmentRepayments:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve repayment schedule',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
