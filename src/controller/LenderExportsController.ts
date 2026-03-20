import { Request, Response } from 'express';
import { Body, Controller, Get, Post, Req, Res, UseBefore } from 'routing-controllers';
import { LenderRemindersService, LenderExportsService } from '../service/LenderExportsService';
import {
    SendReminderRequest,
    ExportCsvRequest,
    ExportXmlRequest,
    GenerateClaimRequest,
} from '../dto/LenderDtos';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { LenderRoleGuard } from '../middleware/LenderGuards';
import { withLenderStatusGuard, withLenderVerificationGuard } from '../middleware/LenderGuardWrappers';
import { ExportRepository } from '../repository/ExportRepository';
import { s3Service } from '../services/s3.service';

/**
 * L-05: LENDER REMINDERS CONTROLLER
 * POST /lender/reminders
 */
@Controller('/lender/reminders')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderRemindersController {
    private remindersService: LenderRemindersService;

    constructor() {
        this.remindersService = new LenderRemindersService();
    }

    /**
     * POST /lender/reminders
     * Send reminder to borrower
     * Body: { loanId: string, templateCode?: string }
     * Required guards: LenderRoleGuard, LenderStatusGuard
     */
    @Post('/')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(1))
    async sendReminder(@Req() req: Request, @Res() res: Response, @Body() _body?: SendReminderRequest): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const request: SendReminderRequest = req.body;

            // Validate request
            const validation = this.validateReminderRequest(request);
            if (!validation.isValid) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid reminder request',
                    errors: validation.errors,
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const reminder = await this.remindersService.sendReminder(lenderId, request);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Reminder sent successfully',
                data: reminder,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in sendReminder:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to send reminder',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    private validateReminderRequest(request: SendReminderRequest): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!request.loanId) {
            errors.push('loanId is required');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}

/**
 * L-06: LENDER EXPORTS & CLAIMS CONTROLLER
 * POST /lender/exports/csv
 * POST /lender/exports/xml
 * GET  /lender/exports/history
 * POST /lender/claims/generate
 */
@Controller('/lender')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderExportsController {
    private exportsService: LenderExportsService;
    private exportRepo: ExportRepository;

    constructor() {
        this.exportsService = new LenderExportsService();
        this.exportRepo = new ExportRepository();
    }

    /**
     * POST /lender/exports/csv
     * Export investments as CSV
     * Body: { dateFrom?: string, dateTo?: string, statusFilter?: string[] }
     * Required guards: LenderRoleGuard, LenderStatusGuard
     */
    @Post('/exports/csv')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(1))
    async exportCsv(@Req() req: Request, @Res() res: Response, @Body() _body?: ExportCsvRequest): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const request: ExportCsvRequest = req.body || {};

            const result = await this.exportsService.exportCsv(lenderId, request);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'CSV export generated successfully',
                data: {
                    downloadUrl: result.filePath,
                    fileSize: result.fileSize,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in exportCsv:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to export CSV',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /lender/exports/xml
     * Export investments as XML (max 500 items)
     * Body: { dateFrom?: string, dateTo?: string, statusFilter?: string[], limit?: number }
     * Required guards: LenderRoleGuard, LenderStatusGuard
     */
    @Post('/exports/xml')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(1))
    async exportXml(@Req() req: Request, @Res() res: Response, @Body() _body?: ExportXmlRequest): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const request: ExportXmlRequest = req.body || {};

            // Validate limit
            if (request.limit && request.limit > 500) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid XML export request',
                    errors: ['XML export limited to 500 items'],
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const result = await this.exportsService.exportXml(lenderId, request);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'XML export generated successfully',
                data: {
                    downloadUrl: result.filePath,
                    fileSize: result.fileSize,
                    itemCount: result.itemCount,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in exportXml:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to export XML',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/exports/xml-template
     * Download pre-defined XML borrowing template (lender loan data).
     * PENDING: Template structure/fields to be finalized when data schema is confirmed.
     * Lender has NO ability to edit, customize, or add variables — read/download only.
     */
    @Get('/exports/xml-template')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async downloadXmlTemplate(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            // PENDING: Wire to actual schema when field list is finalized. Placeholder structure only.
            const placeholderXml = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<!-- PENDING: Lender XML borrowing template - schema/fields TBD when data schema is confirmed -->',
                '<LenderLoanDataExport xmlns="https://lms.example/schema/lender-export" version="1.0" generatedAt="' + new Date().toISOString() + '" lenderId="' + lenderId + '">',
                '  <Description>Pre-defined template. Read-only; structure will reflect your loan data when schema is finalized.</Description>',
                '  <Loans />',
                '</LenderLoanDataExport>',
            ].join('\n');
            res.setHeader('Content-Disposition', 'attachment; filename="lender-loan-data-template.xml"');
            res.setHeader('Content-Type', 'application/xml');
            res.send(placeholderXml);
        } catch (error: any) {
            console.error('Error in downloadXmlTemplate:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to download XML template',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/exports/download/:exportId
     * Returns a presigned URL for the export file.
     */
    @Get('/exports/download/:exportId')
    @UseBefore(withLenderStatusGuard(true))
    async downloadExport(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = Number((req as any).user?.id);
            const exportId = parseInt(req.params.exportId, 10);

            if (isNaN(exportId)) {
                res.status(400).json({ statusCode: '400', statusMessage: 'Invalid export ID' });
                return;
            }

            const exportRecord = await this.exportRepo.findById(exportId);
            if (!exportRecord) {
                res.status(404).json({ statusCode: '404', statusMessage: 'Export not found' });
                return;
            }
            if (Number(exportRecord.createdBy) !== lenderId) {
                res.status(403).json({ statusCode: '403', statusMessage: 'Access denied to this export' });
                return;
            }

            const key = exportRecord.documentKey || exportRecord.filePath;
            if (!key) {
                res.status(404).json({ statusCode: '404', statusMessage: 'Export file key not found' });
                return;
            }

            const expiresIn = 3600;
            const url = await s3Service.getPresignedUrl(key, expiresIn);
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Presigned URL generated',
                data: { url, key, expiresIn },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in downloadExport:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to download export',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/exports/history
     * Get export history
     * Query params: page, pageSize
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/exports/history')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getExportHistory(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const page = parseInt((req.query.page as string) || '1');
            const pageSize = parseInt((req.query.pageSize as string) || '10');

            const history = await this.exportsService.getExportHistory(lenderId, page, pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Export history retrieved successfully',
                data: history,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getExportHistory:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve export history',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /lender/claims/generate
     * Generate insurance claim for defaulted loan
     * Body: { loanId: string, reason: string }
     * Required guards: LenderRoleGuard, LenderStatusGuard
     */
    @Post('/claims/generate')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(2))
    async generateClaim(@Req() req: Request, @Res() res: Response, @Body() _body?: GenerateClaimRequest): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const request: GenerateClaimRequest = req.body;

            // Validate request
            const validation = this.validateClaimRequest(request);
            if (!validation.isValid) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid claim request',
                    errors: validation.errors,
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const claim = await this.exportsService.generateClaim(lenderId, request);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Claim generated successfully',
                data: claim,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in generateClaim:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to generate claim',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    private validateClaimRequest(request: GenerateClaimRequest): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!request.loanId) {
            errors.push('loanId is required');
        }

        if (!request.reason) {
            errors.push('reason is required');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}
