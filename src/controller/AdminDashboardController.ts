import { Controller, Get, Post, Patch, Body, Param, Query, UseMiddleware, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminDashboardService } from '../service/AdminDashboardService';
import { AdminGuard, SuperAdminGuard } from '../middleware/AdminGuards';
import { DashboardStatsResponse, DashboardAlertsResponse } from '../dto/AdminDtos';

/**
 * Admin Dashboard Controller
 * Endpoints for viewing system KPIs and alerts
 *
 * Routes:
 * - GET  /admin/dashboard/stats   -> System KPIs (AdminGuard)
 * - GET  /admin/dashboard/alerts  -> System alerts (AdminGuard)
 */
@Controller('/admin/dashboard')
@UseMiddleware(AdminGuard)
export class AdminDashboardController {
  private dashboardService: AdminDashboardService;

  constructor() {
    this.dashboardService = new AdminDashboardService();
  }

  /**
   * GET /admin/dashboard/stats
   * Returns system KPIs and metrics
   *
   * Response: DashboardStatsResponse with:
   * - totalUsers, activeUsers, blockedUsers
   * - pendingVerifications
   * - activeLoans, defaultedLoans
   * - totalPayments, failedPayments, totalAmount
   * - activeCompanies
   */
  @Get('/stats')
  async getDashboardStats(@Req() req: Request): Promise<DashboardStatsResponse> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.dashboardService.getDashboardStats(adminId);
  }

  /**
   * GET /admin/dashboard/alerts
   * Returns critical alerts requiring admin attention
   *
   * Response: DashboardAlertsResponse with:
   * - alerts[] (type, severity, count, message)
   * - totalCount, criticalCount, highCount
   */
  @Get('/alerts')
  async getDashboardAlerts(@Req() req: Request): Promise<DashboardAlertsResponse> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.dashboardService.getAlerts(adminId);
  }
}
