import { Request, Response } from 'express';
import { BorrowerDashboardService } from '../service/BorrowerDashboardService';
import {
    BorrowerDashboardStatsDto,
    BorrowerDashboardAlertsResponse,
    BorrowerApiResponse,
} from '../dto/BorrowerDtos';

/**
 * B-01: BORROWER DASHBOARD CONTROLLER
 * Endpoints: GET /api/borrower/dashboard
 * Guards: BorrowerRoleGuard, BorrowerStatusGuard(allowReadOnly=true), BorrowerVerificationGuard(level=0)
 */
export class BorrowerDashboardController {
    private dashboardService: BorrowerDashboardService;

    constructor() {
        this.dashboardService = new BorrowerDashboardService();
    }

    /**
     * GET /api/borrower/dashboard
     * Returns dashboard statistics: verification level, loan limits, active loans, alerts
     */
    async getDashboard(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();

            const stats = await this.dashboardService.getDashboardStats(borrowerId);
            const alerts = await this.dashboardService.getAlerts(borrowerId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Dashboard retrieved successfully',
                data: {
                    stats,
                    alerts,
                },
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<any>);
        } catch (error: any) {
            console.error('Error in getDashboard:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/dashboard/stats
     * Returns only dashboard statistics
     */
    async getStats(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();

            const stats = await this.dashboardService.getDashboardStats(borrowerId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Dashboard stats retrieved successfully',
                data: stats,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<BorrowerDashboardStatsDto>);
        } catch (error: any) {
            console.error('Error in getStats:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * GET /api/borrower/dashboard/alerts
     * Returns dashboard alerts
     */
    async getAlerts(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id.toString();

            const alerts = await this.dashboardService.getAlerts(borrowerId);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Alerts retrieved successfully',
                data: alerts,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<BorrowerDashboardAlertsResponse>);
        } catch (error: any) {
            console.error('Error in getAlerts:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
