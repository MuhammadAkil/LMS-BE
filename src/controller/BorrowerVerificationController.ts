import { Request, Response } from 'express';
import { BorrowerVerificationService } from '../service/BorrowerVerificationService';
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
export class BorrowerVerificationController {
    private verificationService: BorrowerVerificationService;

    constructor() {
        this.verificationService = new BorrowerVerificationService();
    }

    /**
     * GET /api/borrower/verification/status
     * Returns current verification status and completed verifications
     */
    async getVerificationStatus(req: Request, res: Response): Promise<void> {
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
    async getVerificationRequirements(req: Request, res: Response): Promise<void> {
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
     * Body: { verificationType: string, documents: [{ fileName, filePath }] }
     */
    async uploadVerification(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const request: UploadVerificationRequest = req.body;

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
