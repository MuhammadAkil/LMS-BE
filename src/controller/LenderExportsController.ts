import { Request, Response } from 'express';
import { LenderRemindersService, LenderExportsService } from '../service/LenderExportsService';
import {
    SendReminderRequest,
    ExportCsvRequest,
    ExportXmlRequest,
    GenerateClaimRequest,
} from '../dto/LenderDtos';

/**
 * L-05: LENDER REMINDERS CONTROLLER
 * POST /lender/reminders
 */
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
    async sendReminder(req: Request, res: Response): Promise<void> {
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
export class LenderExportsController {
    private exportsService: LenderExportsService;

    constructor() {
        this.exportsService = new LenderExportsService();
    }

    /**
     * POST /lender/exports/csv
     * Export investments as CSV
     * Body: { dateFrom?: string, dateTo?: string, statusFilter?: string[] }
     * Required guards: LenderRoleGuard, LenderStatusGuard
     */
    async exportCsv(req: Request, res: Response): Promise<void> {
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
    async exportXml(req: Request, res: Response): Promise<void> {
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
     * GET /lender/exports/history
     * Get export history
     * Query params: page, pageSize
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    async getExportHistory(req: Request, res: Response): Promise<void> {
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
    async generateClaim(req: Request, res: Response): Promise<void> {
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
