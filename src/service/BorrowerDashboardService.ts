import { AuditLogRepository } from '../repository/AuditLogRepository';
import { UserRepository } from '../repository/UserRepository';
import {
    BorrowerDashboardStatsDto,
    BorrowerDashboardAlertsResponse,
    AlertDto,
} from '../dto/BorrowerDtos';

/**
 * B-01: BORROWER DASHBOARD SERVICE
 * Provides dashboard statistics and alerts
 * Calculates: verification level, loan limits, active loans, next repayments
 */
export class BorrowerDashboardService {
    private auditRepo: AuditLogRepository;
    private userRepo: UserRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.userRepo = new UserRepository();
    }

    /**
     * Get borrower dashboard statistics
     *
     * SQL:
     * SELECT
     *   u.level as verificationLevel,
     *   lr.max_amount as availableLoanLimit,
     *   COUNT(DISTINCT la.id) as activeLoanCount,
     *   COUNT(DISTINCT lo.id) as activeInvestmentCount,
     *   MIN(r.due_date) as nextRepaymentDueDate,
     *   r.amount as nextRepaymentAmount,
     *   SUM(CASE WHEN r.paid_at IS NULL THEN r.amount ELSE 0 END) as totalOutstanding
     * FROM users u
     * LEFT JOIN level_rules lr ON lr.level = u.level
     * LEFT JOIN loan_applications la ON la.borrower_id = u.id AND la.status_id IN (2, 3)
     * LEFT JOIN loan_offers lo ON lo.loan_id = la.id AND lo.status_id = 1
     * LEFT JOIN loans l ON l.application_id = la.id AND l.status_id = 1
     * LEFT JOIN repayments r ON r.loan_id = l.id AND r.paid_at IS NULL
     * WHERE u.id = ?
     */
    async getDashboardStats(borrowerId: string): Promise<BorrowerDashboardStatsDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);

            // TODO: Query database for statistics
            // 1. Get user verification level
            // 2. Get available loan limit from level_rules
            // 3. Count active loan applications (status = FUNDED, ACTIVE)
            // 4. Count active loan offers (investments)
            // 5. Get next repayment due date and amount
            // 6. Calculate total outstanding amount

            const stats: BorrowerDashboardStatsDto = {
                verificationLevel: 2,
                availableLoanLimit: 50000,
                activeLoanCount: 1,
                activeInvestmentCount: 3,
                nextRepaymentDueDate: '2026-02-15',
                nextRepaymentAmount: 500,
                totalOutstandingAmount: 4500,
                timestamp: new Date().toISOString(),
            };

            // Audit log
            const userId = parseInt(borrowerId, 10);
            await this.auditRepo.create({
                actorId: userId,
                action: 'VIEW_BORROWER_DASHBOARD',
                entity: 'DASHBOARD',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return stats;
        } catch (error: any) {
            console.error('Error fetching dashboard stats:', error);
            throw new Error('Failed to fetch dashboard statistics');
        }
    }

    /**
     * Get borrower alerts
     * Alert types: PENDING_VERIFICATION, PAYMENT_OVERDUE, COMMISSION_PENDING, DOCUMENT_EXPIRY
     *
     * SQL:
     * SELECT
     *   'PENDING_VERIFICATION' as type,
     *   'HIGH' as severity,
     *   COUNT(*) as affectedCount
     * FROM user_verifications
     * WHERE user_id = ? AND status_id = 1
     * UNION
     * SELECT
     *   'PAYMENT_OVERDUE',
     *   'CRITICAL',
     *   COUNT(*)
     * FROM repayments
     * WHERE loan_id IN (SELECT id FROM loans WHERE borrower_id = ?)
     *   AND due_date < NOW() AND paid_at IS NULL
     */
    async getAlerts(borrowerId: string): Promise<BorrowerDashboardAlertsResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);

            // TODO: Query for all alert types
            const alerts: AlertDto[] = [];
            let criticalCount = 0;
            let highCount = 0;

            // Alert 1: Pending verification
            // TODO: Check user_verifications with status_id = PENDING
            // If exists, add PENDING_VERIFICATION alert

            // Alert 2: Overdue payments
            // TODO: Check repayments with due_date < NOW() and paid_at IS NULL
            // If exists, add PAYMENT_OVERDUE alert (CRITICAL)

            // Alert 3: Commission payment pending
            // TODO: Check payments with payment_type_id = COMMISSION and status_id ≠ PAID
            // If exists, add COMMISSION_PENDING alert

            // Sample alerts
            alerts.push({
                id: 'ALERT_001',
                type: 'PENDING_VERIFICATION',
                severity: 'HIGH',
                title: 'Verification Pending',
                description: 'Your KYC verification is pending review',
                actionUrl: '/api/verification/status',
                createdAt: new Date().toISOString(),
            });

            alerts.push({
                id: 'ALERT_002',
                type: 'COMMISSION_PENDING',
                severity: 'MEDIUM',
                title: 'Commission Payment Due',
                description: 'Please complete commission payment to activate your loan',
                actionUrl: '/api/payments/commission',
                createdAt: new Date().toISOString(),
            });

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_ALERTS',
                entity: 'ALERTS',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                alerts,
                totalCount: alerts.length,
                criticalCount,
                highCount,
            };
        } catch (error: any) {
            console.error('Error fetching alerts:', error);
            throw new Error('Failed to fetch alerts');
        }
    }
}
