import { Request, Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseBefore } from 'routing-controllers';
import { LenderManagementService } from '../service/LenderManagementService';
import { CreateManagementAgreementRequest, ManagementAgreementEligibilityResponse } from '../dto/LenderDtos';
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
     * GET /lender/management-agreements/eligibility
     * Whether the lender can select a management company (account active, verified, bank account).
     * No manual approval: unlocks automatically when conditions are met.
     */
    @Get('/management-agreements/eligibility')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getManagementAgreementEligibility(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const eligibility: ManagementAgreementEligibilityResponse =
                await this.managementService.getManagementAgreementEligibility(lenderId);
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Eligibility retrieved',
                data: eligibility,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getManagementAgreementEligibility:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve eligibility',
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
     * POST /lender/management-agreements/:agreementId/sign
     * Lender signs the agreement (name, role, signature). Required before company can complete.
     */
    @Post('/management-agreements/:agreementId/sign')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(2))
    async signAgreement(
        @Req() req: Request,
        @Res() res: Response,
        @Param('agreementId') agreementId: string,
        @Body() body: { signerName?: string; signerRole?: string; signatureData?: string }
    ): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const agreement = await this.managementService.signAgreement(lenderId, agreementId, {
                signerName: body.signerName ?? '',
                signerRole: body.signerRole ?? '',
                signatureData: body.signatureData,
            });
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Agreement signed successfully',
                data: agreement,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in signAgreement:', error);
            res.status(error.message?.includes('not found') ? 404 : 400).json({
                statusCode: error.message?.includes('not found') ? '404' : '400',
                statusMessage: 'Failed to sign agreement',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/management-agreements/:agreementId/download
     * Download signed agreement PDF (when both parties have signed).
     */
    @Get('/management-agreements/:agreementId/download')
    @UseBefore(withLenderStatusGuard(true))
    async downloadAgreement(@Req() req: Request, @Res() res: Response, @Param('agreementId') agreementId: string): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const path = await this.managementService.getSignedDocumentPath(lenderId, agreementId);
            if (!path || !existsSync(path)) {
                res.status(404).json({ statusCode: '404', statusMessage: 'Signed document not found' });
                return;
            }
            const data = readFileSync(path);
            const fileName = basename(path);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(data);
        } catch (e: any) {
            res.status(500).json({ statusCode: '500', statusMessage: e?.message || 'Download failed' });
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
