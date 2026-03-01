import { AuditLogRepository } from '../repository/AuditLogRepository';
import { UserRepository } from '../repository/UserRepository';
import { LevelRulesRepository } from '../repository/LevelRulesRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LoanRepository } from '../repository/LoanRepository';
import { RepaymentRepository } from '../repository/RepaymentRepository';
import {
    BorrowerDashboardStatsDto,
    BorrowerDashboardAlertsResponse,
    AlertDto,
} from '../dto/BorrowerDtos';

/**
 * B-01: BORROWER DASHBOARD SERVICE
 * Provides dashboard statistics and alerts from real DB data.
 */
export class BorrowerDashboardService {
    private auditRepo: AuditLogRepository;
    private userRepo: UserRepository;
    private levelRulesRepo: LevelRulesRepository;
    private loanAppRepo: LoanApplicationRepository;
    private loanRepo: LoanRepository;
    private repaymentRepo: RepaymentRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.userRepo = new UserRepository();
        this.levelRulesRepo = new LevelRulesRepository();
        this.loanAppRepo = new LoanApplicationRepository();
        this.loanRepo = new LoanRepository();
        this.repaymentRepo = new RepaymentRepository();
    }

    async getDashboardStats(borrowerId: string): Promise<BorrowerDashboardStatsDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const user = await this.userRepo.findById(borrowerIdNum);
            if (!user) throw new Error('User not found');

            const level = user.level ?? 0;
            const levelRules = await this.levelRulesRepo.findByLevel(level);
            const availableLoanLimit = Number(levelRules?.maxLoanAmount ?? 0);

            const [openApps] = await this.loanAppRepo.findByBorrowerId(borrowerIdNum, 100, 0);
            const openCount = openApps.filter((a) => a.statusId === 1).length;

            const [activeLoans, activeLoanCount] = await this.loanRepo.findActiveByBorrowerId(borrowerIdNum, 100, 0);

            let totalOutstandingAmount = 0;
            let nextRepaymentDueDate: string | undefined;
            let nextRepaymentAmount: number | undefined;

            for (const loan of activeLoans) {
                const repayments = await this.repaymentRepo.findByLoanId(loan.id);
                const unpaid = repayments.filter((r) => !r.paidAt);
                for (const r of unpaid) {
                    totalOutstandingAmount += Number(r.amount);
                    const dueStr = r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : String(r.dueDate);
                    if (!nextRepaymentDueDate || dueStr < nextRepaymentDueDate) {
                        nextRepaymentDueDate = dueStr;
                        nextRepaymentAmount = Number(r.amount);
                    }
                }
            }

            const stats: BorrowerDashboardStatsDto = {
                verificationLevel: level,
                availableLoanLimit,
                activeLoanCount,
                activeInvestmentCount: openCount,
                nextRepaymentDueDate,
                nextRepaymentAmount,
                totalOutstandingAmount: Math.round(totalOutstandingAmount * 100) / 100,
                timestamp: new Date().toISOString(),
            };

            await this.auditRepo.create({
                actorId: borrowerIdNum,
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
            const alerts: AlertDto[] = [];
            let criticalCount = 0;
            let highCount = 0;

            const user = await this.userRepo.findById(borrowerIdNum);
            if (user && (user.level ?? 0) === 0) {
                alerts.push({
                    id: 'ALERT_VERIFICATION',
                    type: 'PENDING_VERIFICATION',
                    severity: 'HIGH',
                    title: 'Verification Required',
                    description: 'Complete verification to create loan requests.',
                    actionUrl: '/app/borrower/verification',
                    createdAt: new Date().toISOString(),
                });
                highCount++;
            }

            const [activeLoans] = await this.loanRepo.findActiveByBorrowerId(borrowerIdNum, 100, 0);
            const today = new Date().toISOString().split('T')[0];
            for (const loan of activeLoans) {
                const repayments = await this.repaymentRepo.findByLoanId(loan.id);
                const overdue = repayments.filter((r) => !r.paidAt && (r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : String(r.dueDate)) < today);
                if (overdue.length > 0) {
                    alerts.push({
                        id: `ALERT_OVERDUE_${loan.id}`,
                        type: 'PAYMENT_OVERDUE',
                        severity: 'CRITICAL',
                        title: 'Payment Overdue',
                        description: `You have ${overdue.length} overdue payment(s) on loan #${loan.id}.`,
                        actionUrl: `/app/borrower/loans/${loan.id}`,
                        createdAt: new Date().toISOString(),
                    });
                    criticalCount++;
                    break;
                }
            }

            const [openApps] = await this.loanAppRepo.findByBorrowerId(borrowerIdNum, 50, 0);
            const needsCommission = openApps.find((a) => a.statusId === 2 && a.commissionStatus !== 'PAID');
            if (needsCommission) {
                alerts.push({
                    id: 'ALERT_COMMISSION',
                    type: 'COMMISSION_PENDING',
                    severity: 'MEDIUM',
                    title: 'Commission Payment Due',
                    description: 'Complete commission payment to activate your loan.',
                    actionUrl: '/app/borrower/applications',
                    createdAt: new Date().toISOString(),
                });
            }

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

    /** Short list of open applications for dashboard (e.g. limit 10). */
    async getOpenApplicationsForDashboard(borrowerId: string, limit: number = 10): Promise<any[]> {
        const borrowerIdNum = parseInt(borrowerId, 10);
        const [applications] = await this.loanAppRepo.findByBorrowerId(borrowerIdNum, limit, 0);
        const open = applications.filter((a) => a.statusId === 1 || a.statusId === 2);
        return open.map((a) => ({
            id: a.id,
            amount: Number(a.amount),
            durationMonths: a.durationMonths,
            statusId: a.statusId,
            commissionStatus: a.commissionStatus,
            createdAt: a.createdAt?.toISOString?.(),
        }));
    }

    /** Short list of active loans for dashboard (e.g. limit 10). */
    async getActiveLoansForDashboard(borrowerId: string, limit: number = 10): Promise<any[]> {
        const borrowerIdNum = parseInt(borrowerId, 10);
        const [loans] = await this.loanRepo.findActiveByBorrowerId(borrowerIdNum, limit, 0);
        return loans.map((l) => ({
            id: l.id,
            applicationId: l.applicationId,
            totalAmount: Number(l.totalAmount),
            dueDate: l.dueDate instanceof Date ? l.dueDate.toISOString().split('T')[0] : l.dueDate,
            createdAt: l.createdAt?.toISOString?.(),
        }));
    }
}
