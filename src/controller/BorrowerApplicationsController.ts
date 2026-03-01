import { Request, Response } from 'express';
import { Controller, Post, Get, Put, Param, Req, Res } from 'routing-controllers';
import { BorrowerApplicationsService } from '../service/BorrowerApplicationsService';
import {
    CreateApplicationRequest,
    ApplicationDetailDto,
    ApplicationListResponse,
    CancelApplicationRequest,
    CancelApplicationResponse,
    CloseApplicationRequest,
    CloseApplicationResponse,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';

/**
 * B-03: BORROWER APPLICATIONS CONTROLLER
 * Endpoints:
 * - POST /api/borrower/applications
 * - GET  /api/borrower/applications
 * - GET  /api/borrower/applications/:id
 * - PUT  /api/borrower/applications/:id/cancel
 * - POST /api/borrower/applications/:id/close
 * Guards: BorrowerRoleGuard, BorrowerStatusGuard, BorrowerVerificationGuard
 */
@Controller('/borrower/applications')
export class BorrowerApplicationsController {
    private applicationsService: BorrowerApplicationsService;

    constructor() {
        this.applicationsService = new BorrowerApplicationsService();
    }

    /**
     * POST /api/borrower/applications
     * Create new loan application
     * Body: { amount, durationMonths, purpose?, description? }
     * Rules: ACTIVE status required, verification level required, amount limits from level_rules
     */
    @Post('/')
    async createApplication(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const request: CreateApplicationRequest = req.body;

            // Validation
            if (!request.amount || !request.durationMonths) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'Invalid request',
                    errors: ['Amount and duration are required'],
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const application = await this.applicationsService.createApplication(borrowerId, request);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Application created successfully',
                data: application,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<ApplicationDetailDto>);
        } catch (error: any) {
            console.error('Error in createApplication:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/applications
     * Get paginated applications list
     * Query params: page, pageSize
     */
    @Get('/')
    async getApplications(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const page = parseInt(req.query.page as string) || 1;
            const pageSize = parseInt(req.query.pageSize as string) || 10;

            const result = await this.applicationsService.getApplications(borrowerId, page, pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Applications retrieved successfully',
                data: result,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<ApplicationListResponse>);
        } catch (error: any) {
            console.error('Error in getApplications:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/applications/:id
     * Get application details with all offers
     */
    @Get('/:id')
    async getApplicationDetail(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const applicationId = req.params.id;

            const application = await this.applicationsService.getApplicationDetail(
                borrowerId,
                applicationId
            );

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Application retrieved successfully',
                data: application,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<ApplicationDetailDto>);
        } catch (error: any) {
            console.error('Error in getApplicationDetail:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * PUT /api/borrower/applications/:id/cancel
     * Cancel application (only if OPEN)
     * Body: { reason?: string }
     */
    @Put('/:id/cancel')
    async cancelApplication(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const applicationId = req.params.id;
            const request: CancelApplicationRequest = req.body;

            const response = await this.applicationsService.cancelApplication(
                borrowerId,
                applicationId,
                request
            );

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Application cancelled successfully',
                data: response,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<CancelApplicationResponse>);
        } catch (error: any) {
            console.error('Error in cancelApplication:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /api/borrower/applications/:id/close
     * Close application (only if funded >= 50%)
     * Body: { notes?: string }
     */
    @Post('/:id/close')
    async closeApplication(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();
            const applicationId = req.params.id;
            const request: CloseApplicationRequest = req.body;

            const response = await this.applicationsService.closeApplication(
                borrowerId,
                applicationId,
                request
            );

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Application closed successfully',
                data: response,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<CloseApplicationResponse>);
        } catch (error: any) {
            console.error('Error in closeApplication:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
