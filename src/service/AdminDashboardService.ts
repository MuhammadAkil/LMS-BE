import { AppDataSource } from '../config/database';
import { AdminAuditService } from './AdminAuditService';
import { VerificationRepository } from '../repository/VerificationRepository';
import { DashboardStatsResponse, AlertDto, DashboardAlertsResponse } from '../dto/AdminDtos';

/**
 * Admin Dashboard Service
 * Aggregates KPIs and generates alerts
 * Read-only operations - no audit logs needed for views
 */
export class AdminDashboardService {
  private verificationRepo: VerificationRepository;
  private auditService: AdminAuditService;

  constructor() {
    this.verificationRepo = new VerificationRepository();
    this.auditService = new AdminAuditService();
  }

  /**
   * Get dashboard statistics
   * Aggregates key metrics across system
   */
  async getDashboardStats(adminId: number): Promise<DashboardStatsResponse> {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      // Get user statistics (exclude soft-deleted)
      const userStats = await queryRunner.query(`
        SELECT 
          COUNT(*) as totalUsers,
          SUM(CASE WHEN status_id = 2 THEN 1 ELSE 0 END) as activeUsers,
          SUM(CASE WHEN status_id = 3 THEN 1 ELSE 0 END) as blockedUsers,
          SUM(CASE WHEN role_id = 2 THEN 1 ELSE 0 END) as borrowerCount,
          SUM(CASE WHEN role_id = 3 THEN 1 ELSE 0 END) as lenderCount,
          SUM(CASE WHEN role_id = 4 THEN 1 ELSE 0 END) as companyCount
        FROM users
        WHERE deleted_at IS NULL
      `).catch(() => ({ totalUsers: 0, activeUsers: 0, blockedUsers: 0, borrowerCount: 0, lenderCount: 0, companyCount: 0 }));

      // Get verification statistics
      const verificationStats = await queryRunner.query(`
        SELECT 
          SUM(CASE WHEN status_id = 1 THEN 1 ELSE 0 END) as pendingCount
        FROM user_verifications
      `);

      // Get loan statistics (TypeORM default column names: statusId, totalAmount, fundedAmount).
      const loanStats = await queryRunner.query(`
        SELECT 
          SUM(CASE WHEN statusId = 1 THEN 1 ELSE 0 END) as activeLoans,
          SUM(CASE WHEN statusId = 3 THEN 1 ELSE 0 END) as defaultedLoans,
          COALESCE(SUM(CASE WHEN statusId = 1 THEN totalAmount ELSE 0 END), 0) as outstandingPLN,
          COALESCE(SUM(fundedAmount), 0) as totalDisbursed
        FROM loans
      `).catch(() => ({ activeLoans: 0, defaultedLoans: 0, outstandingPLN: 0, totalDisbursed: 0 }));

      // Get payment statistics
      const paymentStats = await queryRunner.query(`
        SELECT 
          COUNT(*) as totalPayments,
          SUM(amount) as totalAmount,
          SUM(CASE WHEN statusId = 4 THEN 1 ELSE 0 END) as failedPayments
        FROM payments
      `).catch(() => ({ totalPayments: 0, totalAmount: 0, failedPayments: 0 }));

      // Get company statistics
      const companyStats = await queryRunner.query(`
        SELECT 
          SUM(CASE WHEN status_id = 2 THEN 1 ELSE 0 END) as activeCompanies
        FROM companies
      `).catch(() => ({ activeCompanies: 0 }));

      // Log the view
      await this.auditService.logAction(
        adminId,
        'VIEW_DASHBOARD',
        'DASHBOARD',
        0
      );

      const activeLoans = Number(loanStats[0]?.activeLoans) || 0;
      const defaultedLoans = Number(loanStats[0]?.defaultedLoans) || 0;
      const totalLoans = activeLoans + defaultedLoans;
      const defaultRate = totalLoans > 0 ? (defaultedLoans / totalLoans) * 100 : 0;
      const outstandingPLN = parseFloat(loanStats[0]?.outstandingPLN || 0) || 0;
      const totalDisbursed = parseFloat(loanStats[0]?.totalDisbursed || 0) || 0;

      return {
        totalUsers: Number(userStats[0]?.totalUsers) || 0,
        activeUsers: Number(userStats[0]?.activeUsers) || 0,
        blockedUsers: Number(userStats[0]?.blockedUsers) || 0,
        pendingVerifications: Number(verificationStats[0]?.pendingCount) || 0,
        activeLoans,
        defaultedLoans,
        totalPayments: Number(paymentStats[0]?.totalPayments) || 0,
        failedPayments: Number(paymentStats[0]?.failedPayments) || 0,
        totalAmount: parseFloat(paymentStats[0]?.totalAmount || 0) || 0,
        activeCompanies: Number(companyStats[0]?.activeCompanies) || 0,
        timestamp: new Date(),
        usersByRole: {
          borrower: Number(userStats[0]?.borrowerCount) || 0,
          lender: Number(userStats[0]?.lenderCount) || 0,
          company: Number(userStats[0]?.companyCount) || 0,
        },
        outstandingPLN,
        outstandingAmount: outstandingPLN,
        commissionsTotal: 0,
        defaultRate,
        totalDisbursed,
        recoveryRate: 0,
        defaults: defaultedLoans,
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get system alerts
   * Identifies critical issues requiring admin attention
   */
  async getAlerts(adminId: number): Promise<DashboardAlertsResponse> {
    const alerts: AlertDto[] = [];

    // Alert 1: Pending Verifications
    const pendingVerifications = await this.verificationRepo.countPending();
    if (pendingVerifications > 0) {
      alerts.push({
        id: 'pending_verifications',
        type: 'PENDING_VERIFICATION',
        severity: pendingVerifications > 50 ? 'CRITICAL' : pendingVerifications > 20 ? 'HIGH' : 'MEDIUM',
        title: 'Pending Verifications',
        description: `${pendingVerifications} users awaiting verification review`,
        affectedCount: pendingVerifications,
        createdAt: new Date(),
      });
    }

    // Alert 2: Overdue Loans (if loans table exists)
    try {
      const queryRunner = AppDataSource.createQueryRunner();
      const overdueLoans = await queryRunner.query(`
        SELECT COUNT(*) as count FROM loans
        WHERE statusId = 1 AND dueDate < NOW()
      `);
      await queryRunner.release();

      if (overdueLoans[0]?.count > 0) {
        alerts.push({
          id: 'overdue_loans',
          type: 'OVERDUE_LOAN',
          severity: overdueLoans[0].count > 100 ? 'CRITICAL' : 'HIGH',
          title: 'Overdue Loans',
          description: `${overdueLoans[0].count} loans are overdue`,
          affectedCount: overdueLoans[0].count,
          createdAt: new Date(),
        });
      }
    } catch (err) {
      // Loans table might not exist yet
    }

    // Alert 3: Failed Payments
    try {
      const queryRunner = AppDataSource.createQueryRunner();
      const failedPayments = await queryRunner.query(`
        SELECT COUNT(*) as count FROM payments
        WHERE statusId = 4 AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `);
      await queryRunner.release();

      if (failedPayments[0]?.count > 0) {
        alerts.push({
          id: 'failed_payments',
          type: 'FAILED_PAYMENT',
          severity: failedPayments[0].count > 10 ? 'HIGH' : 'MEDIUM',
          title: 'Failed Payments (24h)',
          description: `${failedPayments[0].count} payment failures in the last 24 hours`,
          affectedCount: failedPayments[0].count,
          createdAt: new Date(),
        });
      }
    } catch (err) {
      // Payments table might not exist yet
    }

    // Alert 4: New Blocked Users
    try {
      const queryRunner = AppDataSource.createQueryRunner();
      const blockedToday = await queryRunner.query(`
        SELECT COUNT(*) as count FROM users
        WHERE status_id = 3 AND updated_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `);
      await queryRunner.release();

      if (blockedToday[0]?.count > 0) {
        alerts.push({
          id: 'blocked_users_today',
          type: 'BLOCKED_USER',
          severity: 'MEDIUM',
          title: 'Users Blocked Today',
          description: `${blockedToday[0].count} users were blocked in the last 24 hours`,
          affectedCount: blockedToday[0].count,
          createdAt: new Date(),
        });
      }
    } catch (err) {
      // User table check failed
    }

    // Log the view
    await this.auditService.logAction(
      adminId,
      'VIEW_ALERTS',
      'DASHBOARD',
      0
    );

    return {
      alerts,
      totalCount: alerts.length,
      criticalCount: alerts.filter(a => a.severity === 'CRITICAL').length,
      highCount: alerts.filter(a => a.severity === 'HIGH').length,
    };
  }

  /**
   * Get chart data for dashboard visualizations
   */
  async getChartData(): Promise<{
    monthlyLoans: { label: string; count: number }[];
    topBorrowers: { name: string; email: string; amount: number; loans: number }[];
    loanAmountDistribution: { range: string; count: number }[];
    loanStatusCounts: { statusId: number; statusName: string; count: number }[];
  }> {
    const qr = AppDataSource.createQueryRunner();
    try {
      // Monthly loans – last 6 calendar months
      const monthly = await qr.query(`
        SELECT DATE_FORMAT(createdAt, '%b %Y') AS label,
               YEAR(createdAt) AS yr, MONTH(createdAt) AS mo,
               COUNT(*) AS cnt
        FROM loans
        WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY yr, mo, label
        ORDER BY yr ASC, mo ASC
      `).catch((): any[] => []);

      // Top 5 borrowers by total funded amount
      const topBorrowers = await qr.query(`
        SELECT CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')) AS name,
               u.email,
               COALESCE(SUM(l.fundedAmount),0) AS amount,
               COUNT(l.id) AS loans
        FROM loans l
        LEFT JOIN users u ON l.borrowerId = u.id
        GROUP BY l.borrowerId, u.first_name, u.last_name, u.email
        ORDER BY amount DESC
        LIMIT 5
      `).catch((): any[] => []);

      // Loan amount distribution buckets
      const distribution = await qr.query(`
        SELECT
          SUM(CASE WHEN totalAmount < 1000 THEN 1 ELSE 0 END) AS b0,
          SUM(CASE WHEN totalAmount >= 1000 AND totalAmount < 5000 THEN 1 ELSE 0 END) AS b1,
          SUM(CASE WHEN totalAmount >= 5000 AND totalAmount < 10000 THEN 1 ELSE 0 END) AS b2,
          SUM(CASE WHEN totalAmount >= 10000 AND totalAmount < 50000 THEN 1 ELSE 0 END) AS b3,
          SUM(CASE WHEN totalAmount >= 50000 THEN 1 ELSE 0 END) AS b4
        FROM loans
      `).catch((): any[] => [{}]);

      // Loan status counts
      const statusCounts = await qr.query(`
        SELECT statusId, COUNT(*) AS cnt FROM loans GROUP BY statusId
      `).catch((): any[] => []);

      const statusNames: Record<number, string> = { 1: 'Active', 2: 'Completed', 3: 'Defaulted', 4: 'Suspended' };
      const dist = distribution[0] || {};

      return {
        monthlyLoans: monthly.map((r: any) => ({ label: r.label, count: Number(r.cnt) })),
        topBorrowers: topBorrowers.map((r: any) => ({
          name: (r.name || '').trim() || r.email || 'Unknown',
          email: r.email || '',
          amount: parseFloat(r.amount) || 0,
          loans: Number(r.loans) || 0,
        })),
        loanAmountDistribution: [
          { range: '0-1k', count: Number(dist.b0) || 0 },
          { range: '1k-5k', count: Number(dist.b1) || 0 },
          { range: '5k-10k', count: Number(dist.b2) || 0 },
          { range: '10k-50k', count: Number(dist.b3) || 0 },
          { range: '50k+', count: Number(dist.b4) || 0 },
        ],
        loanStatusCounts: statusCounts.map((r: any) => ({
          statusId: Number(r.statusId),
          statusName: statusNames[Number(r.statusId)] || 'Unknown',
          count: Number(r.cnt),
        })),
      };
    } finally {
      await qr.release();
    }
  }

  /**
   * Get last N activity log entries for dashboard (spec: activity-log?limit=20).
   */
  async getActivityLog(limit: number = 20): Promise<Array<{ timestamp: Date; action: string; performedBy: number; targetUser?: number; details?: Record<string, unknown> }>> {
    const [logs] = await this.auditService.getFilteredAuditLogs({ limit, offset: 0 });
    return logs.map((log) => ({
      timestamp: log.createdAt,
      action: log.action,
      performedBy: log.userId,
      targetUser: log.entity === 'USER' ? log.entityId : undefined,
      details: log.metadata ? (typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata) : undefined,
    }));
  }
}
