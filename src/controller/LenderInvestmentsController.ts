import { Request, Response } from 'express';
import { Controller, Get, Req, Res, UseBefore } from 'routing-controllers';
import { LenderInvestmentsService } from '../service/LenderInvestmentsService';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { LenderRoleGuard } from '../middleware/LenderGuards';
import { withLenderStatusGuard, withLenderVerificationGuard } from '../middleware/LenderGuardWrappers';

/**
 * L-04: LENDER INVESTMENTS CONTROLLER
 * GET /lender/investments
 * GET /lender/investments/:id
 * GET /lender/investments/:id/repayments
 * All operations are read-only
 */
@Controller('/lender/investments')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderInvestmentsController {
    private investmentsService: LenderInvestmentsService;

    constructor() {
        this.investmentsService = new LenderInvestmentsService();
    }

    /**
     * GET /lender/investments
     * Get all investments for lender (paginated). Includes direct and company-managed loans.
     * Query params: page, pageSize, view (all | direct | company_managed)
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getInvestmentsPaginated(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const page = parseInt((req.query.page as string) || '1');
            const pageSize = parseInt((req.query.pageSize as string) || '10');
            const view = (req.query.view as string) || 'all';
            const viewFilter = view === 'direct' ? 'direct' : view === 'company_managed' ? 'company_managed' : 'all';

            const investments = await this.investmentsService.getInvestmentsPaginated(lenderId, page, pageSize, viewFilter);

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
    @Get('/:investmentId')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getInvestmentDetail(@Req() req: Request, @Res() res: Response): Promise<void> {
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
            if (error.message?.startsWith('FORBIDDEN:')) {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Forbidden: Access denied to this investment',
                    timestamp: new Date().toISOString(),
                });
                return;
            }
            const statusCode = error.message === 'Investment not found' ? '404' : '500';
            res.status(parseInt(statusCode)).json({
                statusCode,
                statusMessage: error.message === 'Investment not found' ? 'Investment not found' : 'Failed to retrieve investment detail',
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
    @Get('/:investmentId/repayments')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getInvestmentRepayments(@Req() req: Request, @Res() res: Response): Promise<void> {
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
