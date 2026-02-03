import { Request, Response } from 'express';
import { Body, Controller, Delete, Get, Post, Req, Res, UseBefore } from 'routing-controllers';
import { LenderManagementService } from '../service/LenderManagementService';
import { CreateManagementAgreementRequest } from '../dto/LenderDtos';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { LenderBankAccountGuard, LenderRoleGuard } from '../middleware/LenderGuards';
import { withLenderStatusGuard, withLenderVerificationGuard } from '../middleware/LenderGuardWrappers';

/**
 * L-07: LENDER MANAGEMENT AGREEMENTS CONTROLLER
 * GET  /lender/management-companies
 * POST /lender/management-agreements
 * GET  /lender/management-agreements
 * DELETE /lender/management-agreements/:id
 */
@Controller('/lender')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderManagementController {
    private managementService: LenderManagementService;

    constructor() {
        this.managementService = new LenderManagementService();
    }

    /**
     * GET /lender/management-companies
     * Get available management companies
     * Query params: page, pageSize
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/management-companies')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getManagementCompanies(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const page = parseInt((req.query.page as string) || '1');
            const pageSize = parseInt((req.query.pageSize as string) || '10');

            const companies = await this.managementService.getManagementCompanies(lenderId, page, pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Management companies retrieved successfully',
                data: companies,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getManagementCompanies:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve management companies',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /lender/management-agreements
     * Create management agreement with company
     * Body: { companyId: string, amount: number }
     * 
     * Required guards (in order):
     * 1. LenderRoleGuard
     * 2. LenderStatusGuard (must be ACTIVE)
     * 3. LenderVerificationGuard (verification level >= required)
     * 4. LenderBankAccountGuard (must have verified bank account)
     */
    @Post('/management-agreements')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(2), LenderBankAccountGuard)
    async createManagementAgreement(
        @Req() req: Request,
        @Res() res: Response,
        @Body() _body?: CreateManagementAgreementRequest
    ): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const request: CreateManagementAgreementRequest = req.body;

            // Validate request
            const validation = this.validateAgreementRequest(request);
            if (!validation.isValid) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid agreement request',
                    errors: validation.errors,
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const agreement = await this.managementService.createManagementAgreement(lenderId, request);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Management agreement created successfully',
                data: agreement,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in createManagementAgreement:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to create management agreement',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/management-agreements
     * Get lender's management agreements
     * Query params: page, pageSize
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/management-agreements')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getManagementAgreements(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const page = parseInt((req.query.page as string) || '1');
            const pageSize = parseInt((req.query.pageSize as string) || '10');

            const agreements = await this.managementService.getManagementAgreements(lenderId, page, pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Management agreements retrieved successfully',
                data: agreements,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getManagementAgreements:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve management agreements',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * DELETE /lender/management-agreements/:agreementId
     * Terminate management agreement
     * Required guards: LenderRoleGuard, LenderStatusGuard
     */
    @Delete('/management-agreements/:agreementId')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(2))
    async terminateAgreement(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const { agreementId } = req.params;

            const result = await this.managementService.terminateAgreement(lenderId, agreementId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Agreement terminated successfully',
                data: result,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in terminateAgreement:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to terminate agreement',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    private validateAgreementRequest(request: CreateManagementAgreementRequest): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (!request.companyId) {
            errors.push('companyId is required');
        }

        if (!request.amount || request.amount <= 0) {
            errors.push('amount is required and must be positive');
        }

        if (request.amount && request.amount > 10000000) {
            errors.push('amount exceeds maximum allowed value');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}
