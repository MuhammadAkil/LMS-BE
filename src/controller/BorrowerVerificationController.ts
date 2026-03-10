import { Request, Response } from 'express';
import { BodyParam, Controller, Get, Post, Req, Res, UploadedFiles } from 'routing-controllers';
import { BorrowerVerificationService } from '../service/BorrowerVerificationService';
import {
    VerificationStatusDto,
    VerificationRequirementsDto,
    UploadVerificationRequest,
    UploadVerificationResponse,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';
import { kycUploadOptions } from '../util/UploadStorage';

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
     * Submit verification documents
     * multipart/form-data:
     * - verificationType: string
     * - documentsMetadata: JSON array (optional; per-file metadata)
     * - documents: file[] (required)
     */
    @Post('/upload')
    async uploadVerification(
        @Req() req: Request,
        @Res() res: Response,
        @BodyParam('verificationType') verificationType?: string,
        @BodyParam('documentsMetadata') documentsMetadataRaw?: string,
        @UploadedFiles('documents', { options: kycUploadOptions }) files?: Express.Multer.File[]
    ): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const metadata: Array<Record<string, any>> = (() => {
                if (!documentsMetadataRaw) return [];
                try {
                    return JSON.parse(documentsMetadataRaw);
                } catch {
                    return [];
                }
            })();

            const request: UploadVerificationRequest = {
                verificationType: verificationType || req.body?.verificationType,
                documents: (files || ((req as any).files as Express.Multer.File[]) || []).map((file, index) => {
                    const docMeta = metadata[index] || {};
                    return {
                        fileName: file.originalname,
                        filePath: `/uploads/kyc/${file.filename}`,
                        category: docMeta.category,
                        subtype: docMeta.subtype,
                        side: docMeta.side,
                        issuedAt: docMeta.issuedAt,
                        expiresAt: docMeta.expiresAt,
                        fullName: docMeta.fullName,
                        addressLine: docMeta.addressLine,
                    };
                }),
            };

            // Validation
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
}
