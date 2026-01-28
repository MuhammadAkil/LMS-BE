import { PaginationParams, LenderDashboardStatsResponse, LenderDashboardAlertsResponse, LenderAlertDto } from '../dto/LenderDtos';
import { UserRepository } from '../repository/UserRepository';
import { AuditLogRepository } from '../repository/AuditLogRepository';

/**
 * L-01: LENDER DASHBOARD SERVICE
 * Handles dashboard statistics and alerts
 * All operations are read-only
 */
export class LenderDashboardService {
    private userRepository: UserRepository;
    private auditLogRepository: AuditLogRepository;

    constructor() {
        this.userRepository = new UserRepository();
        this.auditLogRepository = new AuditLogRepository();
    }

    /**
     * Get dashboard statistics for lender
     * Calculates:
     * - active investments count
     * - expected repayments total
     * - overdue loans count
     * - managed vs self-invested split
     * 
     * SQL Query:
     * SELECT 
     *   COUNT(DISTINCT lo.id) as active_investments,
     *   SUM(lo.amount) as total_invested,
     *   COUNT(DISTINCT CASE WHEN r.paid_at IS NULL AND r.due_date < NOW() THEN l.id END) as overdue_count,
     *   SUM(CASE WHEN ma.id IS NOT NULL THEN lo.amount ELSE 0 END) as managed_amount
     * FROM loan_offers lo
     * JOIN loans l ON l.id = lo.loan_id
     * JOIN loan_applications la ON la.id = l.application_id
     * LEFT JOIN repayments r ON r.loan_id = l.id
     * LEFT JOIN management_agreements ma ON ma.lender_id = lo.lender_id AND ma.company_id = (
     *   SELECT company_id FROM companies WHERE id = la.borrower_id LIMIT 1
     * )
     * WHERE lo.lender_id = ? AND l.status_id IN (SELECT id FROM loan_statuses WHERE code = 'ACTIVE')
     */
    async getDashboardStats(lenderId: string): Promise<LenderDashboardStatsResponse> {
        try {
            // Placeholder: Replace with actual database queries
            // In production, these would be prepared statements with proper connection pooling

            const stats: LenderDashboardStatsResponse = {
                activeInvestments: 0,
                totalInvestedAmount: 0,
                managedAmount: 0,
                selfInvestedAmount: 0,
                expectedRepayments: 0,
                overdueLoanCount: 0,
                avgRepaymentRate: 0,
                nextRepaymentDate: null,
            };

            // TODO: Execute database queries with connection pool
            // Query active investments, calculate expected repayments, identify overdue loans
            // Join with management_agreements to split managed vs self-invested

            // Audit log - VIEW action (placeholder for repository method)
            // NOTE: Replace with actual repository method when available
            console.log(`Audit: User ${lenderId} viewed dashboard`);

            return stats;
        } catch (error: any) {
            console.error('Error fetching dashboard stats:', error);
            throw new Error('Failed to fetch dashboard statistics');
        }
    }

    /**
     * Get alerts for lender
     * Returns:
     * - overdue repayments
     * - pending actions
     * - automation status issues
     * 
     * SQL Query:
     * SELECT 
     *   r.id,
     *   'OVERDUE_REPAYMENT' as type,
     *   'HIGH' as severity,
     *   CONCAT('Repayment overdue for ', DATEDIFF(NOW(), r.due_date), ' days') as message,
     *   r.loan_id as entity_id
     * FROM repayments r
     * JOIN loans l ON l.id = r.loan_id
     * JOIN loan_offers lo ON lo.loan_id = l.id
     * WHERE lo.lender_id = ? 
     *   AND r.paid_at IS NULL 
     *   AND r.due_date < NOW()
     * ORDER BY r.due_date ASC
     */
    async getAlerts(lenderId: string, pagination?: PaginationParams): Promise<LenderDashboardAlertsResponse> {
        try {
            const page = pagination?.page || 1;
            const pageSize = pagination?.pageSize || 20;

            const alerts: LenderAlertDto[] = [];
            // TODO: Query overdue repayments, pending actions, and automation issues
            // GROUP BY severity and type

            // Placeholder response
            return {
                alerts,
                totalCount: alerts.length,
                unreadCount: 0,
            };
        } catch (error: any) {
            console.error('Error fetching alerts:', error);
            throw new Error('Failed to fetch alerts');
        }
    }

    /**
     * Mark alert as resolved
     */
    async markAlertResolved(lenderId: string, alertId: string): Promise<void> {
        try {
            // TODO: Update alerts table set resolved_at = NOW() WHERE id = ? AND user_id = ?
            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} resolved alert ${alertId}`);
        } catch (error: any) {
            console.error('Error resolving alert:', error);
            throw new Error('Failed to resolve alert');
        }
    }
}
