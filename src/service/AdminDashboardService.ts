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
      // Get user statistics
      const userStats = await queryRunner.query(`
        SELECT 
          COUNT(*) as totalUsers,
          SUM(CASE WHEN status_id = 2 THEN 1 ELSE 0 END) as activeUsers,
          SUM(CASE WHEN status_id = 3 THEN 1 ELSE 0 END) as blockedUsers
        FROM users
      `);

      // Get verification statistics
      const verificationStats = await queryRunner.query(`
        SELECT 
          SUM(CASE WHEN status_id = 1 THEN 1 ELSE 0 END) as pendingCount
        FROM user_verifications
      `);

      // Get loan statistics (if loans table exists)
      const loanStats = await queryRunner.query(`
        SELECT 
          SUM(CASE WHEN status_id = 1 THEN 1 ELSE 0 END) as activeLoans,
          SUM(CASE WHEN status_id = 3 THEN 1 ELSE 0 END) as defaultedLoans
        FROM loans
      `).catch(() => ({ activeLoans: 0, defaultedLoans: 0 }));

      // Get payment statistics
      const paymentStats = await queryRunner.query(`
        SELECT 
          COUNT(*) as totalPayments,
          SUM(amount) as totalAmount,
          SUM(CASE WHEN status_id = 4 THEN 1 ELSE 0 END) as failedPayments
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

      return {
        totalUsers: userStats[0]?.totalUsers || 0,
        activeUsers: userStats[0]?.activeUsers || 0,
        blockedUsers: userStats[0]?.blockedUsers || 0,
        pendingVerifications: verificationStats[0]?.pendingCount || 0,
        activeLoans: loanStats[0]?.activeLoans || 0,
        defaultedLoans: loanStats[0]?.defaultedLoans || 0,
        totalPayments: paymentStats[0]?.totalPayments || 0,
        failedPayments: paymentStats[0]?.failedPayments || 0,
        totalAmount: parseFloat(paymentStats[0]?.totalAmount || 0),
        activeCompanies: companyStats[0]?.activeCompanies || 0,
        timestamp: new Date(),
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
        WHERE status_id = 1 AND due_date < NOW()
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
        WHERE status_id = 4 AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
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
}
