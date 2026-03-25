import { Request, Response } from 'express';
import { Body, Controller, Get, Param, Post, Req, Res, UseBefore } from 'routing-controllers';
import { BorrowerVerificationService } from '../service/BorrowerVerificationService';
import { uploadMultiple } from '../middleware/upload.middleware';
import { s3Service } from '../services/s3.service';
import {
    VerificationStatusDto,
    VerificationRequirementsDto,
    UploadVerificationRequest,
    UploadVerificationResponse,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';

/**
 * B-02: BORROWER VERIFICATION CONTROLLER
 * Endpoints:
 * - GET  /api/borrower/verification/status
 * - GET  /api/borrower/verification/requirements
 * - POST /api/borrower/verification/upload
 * Guards: BorrowerRoleGuard, BorrowerStatusGuard(allowReadOnly=true), BorrowerVerificationGuard(level=0)
 */
@Controller('/borrower/verification')
export class BorrowerVerificationController {
    private verificationService: BorrowerVerificationService;

    constructor() {
        this.verificationService = new BorrowerVerificationService();
    }

    /**
     * GET /api/borrower/verification/status
     * Returns current verification status and completed verifications
     */
    @Get('/status')
    async getVerificationStatus(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();

            const status = await this.verificationService.getVerificationStatus(borrowerId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Verification status retrieved successfully',
                data: status,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<VerificationStatusDto>);
        } catch (error: any) {
            console.error('Error in getVerificationStatus:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/verification/requirements
     * Returns next level verification requirements
     */
    @Get('/requirements')
    async getVerificationRequirements(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();

            const requirements = await this.verificationService.getVerificationRequirements(
                borrowerId
            );

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Verification requirements retrieved successfully',
                data: requirements,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<VerificationRequirementsDto>);
        } catch (error: any) {
            console.error('Error in getVerificationRequirements:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /api/borrower/verification/upload
     * Multipart: verificationType + documents[] → S3; or JSON with filePath keys (legacy).
     */
    @Post('/upload')
    @UseBefore(uploadMultiple('documents', 10))
    async uploadVerification(
        @Req() req: Request,
        @Res() res: Response,
        @Body() body?: UploadVerificationRequest
    ): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const files = (((req as any).files || []) as Express.Multer.File[]);
            let request: UploadVerificationRequest = body || req.body;

            if (files.length > 0) {
                const verificationType = req.body?.verificationType || request?.verificationType;
                const uploadedDocuments = await Promise.all(
                    files.map(async (file) => {
                        const key = s3Service.generateKey('borrower', String(borrowerId), file.originalname);
                        await s3Service.uploadFile(file.buffer, key, file.mimetype);
                        return {
                            fileName: file.originalname,
                            filePath: key,
                        };
                    })
                );
                request = {
                    verificationType,
                    documents: uploadedDocuments,
                };
            }

            if (!request.verificationType || !request.documents || request.documents.length === 0) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid request',
                    errors: ['Verification type and documents are required'],
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const response = await this.verificationService.submitVerification(borrowerId, request);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Verification submitted successfully',
                data: response,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<UploadVerificationResponse>);
        } catch (error: any) {
            console.error('Error in uploadVerification:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    @Get('/:verificationId/documents/:documentId/download')
    async downloadVerificationDocument(
        @Req() req: Request,
        @Res() res: Response,
        @Param('verificationId') verificationId: string,
        @Param('documentId') documentId: string
    ): Promise<void> {
        try {
            const borrowerId = (req as any).user.id.toString();
            const result = await this.verificationService.getDocumentPresignedUrl(
                borrowerId,
                verificationId,
                documentId
            );
            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Presigned URL generated successfully',
                data: result,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            res.status(404).json({
                statusCode: '404',
                statusMessage: 'Failed to fetch document',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
