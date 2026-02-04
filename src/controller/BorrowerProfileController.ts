import { Request, Response } from 'express';
import { Controller, Get, Put, Req, Res } from 'routing-controllers';
import { BorrowerProfileService } from '../service/BorrowerProfileService';
import {
    ProfileDto,
    UpdateProfileRequest,
    UpdateProfileResponse,
    ProfileActivityResponse,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';

/**
 * B-09: BORROWER PROFILE CONTROLLER
 * Endpoints:
 * - GET  /api/borrower/profile
 * - PUT  /api/borrower/profile
 * - GET  /api/borrower/profile/activity
 * Guards: BorrowerRoleGuard, BorrowerStatusGuard, BorrowerVerificationGuard
 */
@Controller('/borrower/profile')
export class BorrowerProfileController {
    private profileService: BorrowerProfileService;

    constructor() {
        this.profileService = new BorrowerProfileService();
    }

    /**
     * GET /api/borrower/profile
     * Get borrower profile
     */
    @Get('/')
    async getProfile(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();

            const profile = await this.profileService.getProfile(borrowerId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Profile retrieved successfully',
                data: profile,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<ProfileDto>);
        } catch (error: any) {
            console.error('Error in getProfile:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PUT /api/borrower/profile
     * Update borrower profile
     * Body: { firstName?, lastName?, phone?, dateOfBirth? }
     *
     * Protected fields (cannot be edited):
     * - email, password, role, status, level
     */
    @Put('/')
    async updateProfile(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const request: UpdateProfileRequest = req.body;

            // Reject attempts to modify protected fields
            const protectedFields = ['email', 'password', 'roleId', 'statusId', 'level', 'verificationLevel'];
            for (const field of protectedFields) {
                if (field in request) {
                    res.status(400).json({
                        statusCode: '400',
                        statusMessage: 'Invalid request',
                        errors: [`Field '${field}' cannot be modified`],
                        timestamp: new Date().toISOString(),
                    });
                    return;
                }
            }

            const response = await this.profileService.updateProfile(borrowerId, request);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Profile updated successfully',
                data: response,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<UpdateProfileResponse>);
        } catch (error: any) {
            console.error('Error in updateProfile:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/profile/activity
     * Get borrower activity log (audit trail)
     * Shows all actions performed by borrower
     * Query params: page, pageSize
     */
    @Get('/activity')
    async getActivityLog(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const page = parseInt(req.query.page as string) || 1;
            const pageSize = parseInt(req.query.pageSize as string) || 10;

            const result = await this.profileService.getActivityLog(borrowerId, page, pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Activity log retrieved successfully',
                data: result,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<ProfileActivityResponse>);
        } catch (error: any) {
            console.error('Error in getActivityLog:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
