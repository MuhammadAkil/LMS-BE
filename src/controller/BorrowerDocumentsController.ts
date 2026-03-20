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
     * Returns a short-lived presigned URL
     */
    @Get('/:id/download')
    async downloadDocument(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const documentId = req.params.id;

            const data = await this.documentsService.downloadDocument(borrowerId, documentId);
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Presigned URL generated successfully',
                data,
                timestamp: new Date().toISOString(),
            });
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
