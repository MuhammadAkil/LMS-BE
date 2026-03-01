import { Request, Response } from 'express';
import { Controller, Get, Param, Req, Res } from 'routing-controllers';
import { BorrowerDocumentsService } from '../service/BorrowerDocumentsService';
import {
    DocumentListResponse,
    DocumentDetailDto,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';

/**
 * B-07: BORROWER DOCUMENTS CONTROLLER
 * Endpoints:
 * - GET /api/borrower/documents
 * - GET /api/borrower/documents/:id
 * - GET /api/borrower/documents/:id/download
 * Guards: BorrowerRoleGuard, BorrowerStatusGuard(allowReadOnly=true), BorrowerVerificationGuard(level=0)
 */
@Controller('/borrower/documents')
export class BorrowerDocumentsController {
    private documentsService: BorrowerDocumentsService;

    constructor() {
        this.documentsService = new BorrowerDocumentsService();
    }

    /**
     * GET /api/borrower/documents
     * Get all documents (contracts, verifications, etc.)
     * Query params: page, pageSize
     */
    @Get('/')
    async getDocumentsPaginated(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const page = parseInt(req.query.page as string) || 1;
            const pageSize = parseInt(req.query.pageSize as string) || 10;

            const result = await this.documentsService.getDocumentsPaginated(borrowerId, page, pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Documents retrieved successfully',
                data: result,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<DocumentListResponse>);
        } catch (error: any) {
            console.error('Error in getDocumentsPaginated:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/documents/:id
     * Get document details
     */
    @Get('/:id')
    async getDocumentDetail(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const documentId = req.params.id;

            const detail = await this.documentsService.getDocumentDetail(borrowerId, documentId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Document retrieved successfully',
                data: detail,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<DocumentDetailDto>);
        } catch (error: any) {
            console.error('Error in getDocumentDetail:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/documents/:id/download
     * Download document
     * Returns file stream for download
     */
    @Get('/:id/download')
    async downloadDocument(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const documentId = req.params.id;

            const filePath = await this.documentsService.downloadDocument(borrowerId, documentId);

            // Stream the file if it exists on disk, otherwise return the URL
            const fs = require('fs');
            const path = require('path');
            if (filePath && !filePath.startsWith('http') && fs.existsSync(filePath)) {
                const fileName = path.basename(filePath);
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                res.setHeader('Content-Type', 'application/pdf');
                const fileStream = fs.createReadStream(filePath);
                fileStream.on('error', () => {
                    if (!res.headersSent) {
                        res.status(404).json({
                            statusCode: '404',
                            statusMessage: 'File not found',
                            errors: ['Document file not found on server'],
                            timestamp: new Date().toISOString(),
                        });
                    }
                });
                fileStream.pipe(res);
            } else if (filePath && filePath.startsWith('http')) {
                // External URL (e.g. S3): redirect to it
                res.redirect(302, filePath);
            } else {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'Document not available',
                    errors: ['No file path associated with this document'],
                    timestamp: new Date().toISOString(),
                });
            }
        } catch (error: any) {
            console.error('Error in downloadDocument:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
