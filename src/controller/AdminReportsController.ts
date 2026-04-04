import { Controller, Get, UseBefore, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminGuard } from '../middleware/AdminGuards';
import { AdminDashboardService } from '../service/AdminDashboardService';

/**
 * Admin Reports Controller
 * GET /admin/reports/summary — summary for reports screen
 */
@Controller('/admin/reports')
@UseBefore(AdminGuard)
export class AdminReportsController {
  private readonly dashboardService: AdminDashboardService;

  constructor() {
    this.dashboardService = new AdminDashboardService();
  }

  @Get('/summary')
  async getSummary(@Req() req: Request) {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    const stats = await this.dashboardService.getDashboardStats(adminId);
    const loansPerUserRaw = stats.totalUsers ? (stats.activeLoans ?? 0) / Math.max(stats.totalUsers, 1) : 0;
    return {
      transactions: stats.totalPayments ?? 0,
      defaults: stats.defaultedLoans ?? 0,
      revenue: stats.commissionsTotal ?? 0,
      loansPerUser: Math.round(loansPerUserRaw * 100) / 100,
    };
  }

  /** Summary KPIs + chart datasets for the reports screen (one audit: VIEW_REPORTS). */
  @Get('/overview')
  async getOverview(@Req() req: Request) {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    return this.dashboardService.getReportsOverview(adminId);
  }
}
