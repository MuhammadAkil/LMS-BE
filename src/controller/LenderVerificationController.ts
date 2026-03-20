import { Request, Response } from 'express';
import { Body, Controller, Get, Patch, Post, Req, Res, UseBefore } from 'routing-controllers';
import { LenderVerificationService, LenderProfileService } from '../service/LenderVerificationService';
import { SubmitVerificationRequest, UpdateLenderProfileRequest } from '../dto/LenderDtos';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { LenderRoleGuard } from '../middleware/LenderGuards';
import { withLenderStatusGuard, withLenderVerificationGuard } from '../middleware/LenderGuardWrappers';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import { uploadMultiple } from '../middleware/upload.middleware';
import { s3Service } from '../services/s3.service';

/**
 * L-08: LENDER VERIFICATION CONTROLLER
 * GET  /lender/verifications
 * POST /lender/verifications
 */
@Controller('/lender/verifications')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderVerificationController {
    private verificationService: LenderVerificationService;

    constructor() {
        this.verificationService = new LenderVerificationService();
    }

    /**
     * GET /lender/verifications
     * Get verification status
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getVerifications(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;

            const verifications = await this.verificationService.getVerifications(lenderId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Verifications retrieved successfully',
                data: verifications,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getVerifications:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve verifications',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /lender/verifications
     * Submit verification documents
     * Body (JSON): { verificationType, documents: [{ fileName, filePath }] }
     * Required guards: LenderRoleGuard, LenderStatusGuard
     */
    @Post('/')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(0))
    @UseBefore(uploadMultiple('documents', 10))
    async submitVerification(
        @Req() req: Request,
        @Res() res: Response,
        @Body() body?: SubmitVerificationRequest
    ): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const files = (((req as any).files || []) as Express.Multer.File[]);
            const verificationType = (body || req.body)?.verificationType;
            const uploadedDocuments = await Promise.all(
                files.map(async (file) => {
                    const key = s3Service.generateKey('lender', String(lenderId), file.originalname);
                    await s3Service.uploadFile(file.buffer, key, file.mimetype);
                    return {
                        fileName: file.originalname,
                        filePath: key,
                        mimeType: file.mimetype,
                        size: file.size,
                    };
                })
            );
            const request: SubmitVerificationRequest = {
                verificationType,
                documents: uploadedDocuments as any,
            };

            // Validate request
            const validation = this.validateVerificationRequest(request);
            if (!validation.isValid) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid verification request',
                    errors: validation.errors,
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const verification = await this.verificationService.submitVerification(lenderId, request);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Verification submitted successfully',
                data: verification,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in submitVerification:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to submit verification',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    private validateVerificationRequest(request: SubmitVerificationRequest): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!request.verificationType) {
            errors.push('verificationType is required');
        }

        if (!request.documents || !Array.isArray(request.documents) || request.documents.length === 0) {
            errors.push('At least one document is required');
        }

        if (request.documents) {
            request.documents.forEach((doc, index) => {
                if (!doc.fileName) {
                    errors.push(`Document ${index + 1}: fileName is required`);
                }
                if (!doc.filePath) {
                    errors.push(`Document ${index + 1}: filePath is required`);
                }
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}

/**
 * L-09: LENDER PROFILE CONTROLLER
 * GET   /lender/profile
 * PATCH /lender/profile
 */
@Controller('/lender/profile')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderProfileController {
    private profileService: LenderProfileService;

    constructor() {
        this.profileService = new LenderProfileService();
    }

    /**
     * GET /lender/profile
     * Get lender profile
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getProfile(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;

            const profile = await this.profileService.getProfile(lenderId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Profile retrieved successfully',
                data: profile,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getProfile:', error);
            const statusCode = error.message === 'User not found' ? '404' : '500';
            res.status(parseInt(statusCode)).json({
                statusCode,
                statusMessage: 'Failed to retrieve profile',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PATCH /lender/profile
     * Update lender profile
     * Body: { phone?: string }
     * 
     * Limited editable fields:
     * - phone (optional)
     * 
     * Protected fields (cannot be edited):
     * - email
     * - password
     * - role
     * - status
     * - level
     * 
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Patch('/')
    @UseBefore(withLenderStatusGuard(false), withLenderVerificationGuard(0))
    async updateProfile(
        @Req() req: Request,
        @Res() res: Response,
        @Body() _body?: UpdateLenderProfileRequest
    ): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const request: UpdateLenderProfileRequest = req.body;

            // Validate request (only allow specific fields)
            const validation = this.validateProfileUpdateRequest(request);
            if (!validation.isValid) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid profile update request',
                    errors: validation.errors,
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const result = await this.profileService.updateProfile(lenderId, request);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Profile updated successfully',
                data: result,
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in updateProfile:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to update profile',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /lender/profile/activity
     * Get lender activity log (audit trail)
     * Required guards: LenderRoleGuard, LenderStatusGuard(allowReadOnly=true)
     */
    @Get('/activity')
    @UseBefore(withLenderStatusGuard(true), withLenderVerificationGuard(0))
    async getActivityLog(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user.id;
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
            const offset = (page - 1) * pageSize;

            const auditRepo = new AuditLogRepository();
            const [logs, totalItems] = await auditRepo.findByActor(lenderId, pageSize, offset);

            const activities = logs.map((log: any) => ({
                action: log.action || log.event || 'ACTION',
                timestamp: log.createdAt?.toISOString?.() ?? new Date().toISOString(),
                ipAddress: log.ipAddress || log.ip_address || null,
                device: log.device || log.userAgent || null,
                entity: log.entity || null,
                entityId: log.entityId || null,
            }));

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Activity log retrieved successfully',
                data: {
                    activities,
                    pagination: {
                        page,
                        pageSize,
                        totalItems,
                        totalPages: Math.ceil(totalItems / pageSize),
                    },
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in getActivityLog:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve activity log',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    private validateProfileUpdateRequest(request: UpdateLenderProfileRequest): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        // Check that no protected fields are being modified
        const protectedFields = ['email', 'password', 'role', 'status', 'level', 'roleId', 'statusId'];
        const requestKeys = Object.keys(request);

        protectedFields.forEach((field) => {
            if (requestKeys.includes(field)) {
                errors.push(`Cannot modify protected field: ${field}`);
            }
        });

        // Validate phone format if provided
        if (request.phone && typeof request.phone !== 'string') {
            errors.push('phone must be a string');
        }

        if (request.phone && request.phone.length > 20) {
            errors.push('phone must be less than 20 characters');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}
