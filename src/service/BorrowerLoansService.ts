import { AuditLogRepository } from '../repository/AuditLogRepository';
import {
    ActiveLoanListResponse,
    ActiveLoanListItemDto,
    LoanDetailDto,
    RepaymentScheduleItemDto,
    PaymentHistoryDto,
    PaymentItemDto,
} from '../dto/BorrowerDtos';

/**
 * B-05: BORROWER ACTIVE LOANS SERVICE
 * Provides views of active loans, repayment schedules, and payment history
 *
 * Rules:
 * - Visible only if loan.status = ACTIVE
 * - Repayment schedule from repayments table (with payment history)
 * - Payment history from payments table (filtered by loan_id)
 */
export class BorrowerLoansService {
    private auditRepo: AuditLogRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
    }

    /**
     * Get borrower's active loans (paginated)
     *
     * SQL:
     * SELECT
     *   l.id,
     *   l.application_id,
     *   la.amount,
     *   la.duration_months,
     *   ls.code as status,
     *   l.disbursed_amount,
     *   l.created_at as disbursedAt,
     *   DATE_ADD(l.created_at, INTERVAL la.duration_months MONTH) as expectedCompletionDate,
     *   SUM(CASE WHEN r.paid_at IS NOT NULL THEN r.amount ELSE 0 END) as paidAmount,
     *   SUM(CASE WHEN r.paid_at IS NULL THEN r.amount ELSE 0 END) as remainingBalance,
     *   MIN(CASE WHEN r.paid_at IS NULL THEN r.due_date END) as nextRepaymentDate,
     *   MIN(CASE WHEN r.paid_at IS NULL THEN r.amount END) as nextRepaymentAmount
     * FROM loans l
     * JOIN loan_applications la ON la.id = l.application_id
     * JOIN loan_statuses ls ON ls.id = l.status_id
     * LEFT JOIN repayments r ON r.loan_id = l.id
     * WHERE l.borrower_id = ? AND l.status_id = ACTIVE_STATUS_ID
     * GROUP BY l.id
     * ORDER BY l.created_at DESC
     */
    async getActiveLoansPaginated(
        borrowerId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<ActiveLoanListResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const offset = (page - 1) * pageSize;

            // TODO: Query loans with ACTIVE status for borrower
            const loans: ActiveLoanListItemDto[] = [];
            const totalItems = 0;
            const totalOutstanding = 0;

            // Sample data
            loans.push({
                id: 1,
                applicationId: 101,
                amount: 50000,
                durationMonths: 12,
                status: 'ACTIVE',
                disbursedAmount: 50000,
                disbursedAt: '2026-01-01',
                expectedCompletionDate: '2027-01-01',
                nextRepaymentDate: '2026-02-01',
                nextRepaymentAmount: 4500,
                remainingBalance: 48000,
            });

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_ACTIVE_LOANS',
                entity: 'LOAN',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                loans,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
                totalOutstandingBalance: totalOutstanding,
            };
        } catch (error: any) {
            console.error('Error fetching active loans:', error);
            throw new Error('Failed to fetch active loans');
        }
    }

    /**
     * Get loan details with full repayment schedule
     *
     * SQL (Loan details):
     * SELECT
     *   l.id,
     *   l.application_id,
     *   la.amount,
     *   la.duration_months,
     *   l.status_id,
     *   l.disbursed_amount,
     *   l.created_at as disbursedAt,
     *   DATE_ADD(l.created_at, INTERVAL la.duration_months MONTH) as expectedCompletionDate,
     *   SUM(CASE WHEN r.paid_at IS NOT NULL THEN r.amount ELSE 0 END) as paidAmount,
     *   SUM(CASE WHEN r.paid_at IS NULL THEN r.amount ELSE 0 END) as remainingBalance,
     *   MIN(CASE WHEN r.paid_at IS NULL THEN r.due_date END) as nextRepaymentDate,
     *   MIN(CASE WHEN r.paid_at IS NULL THEN r.amount END) as nextRepaymentAmount,
     *   COUNT(CASE WHEN DATEDIFF(NOW(), r.due_date) > 0 AND r.paid_at IS NULL THEN 1 END) as delayedPaymentsCount
     * FROM loans l
     * LEFT JOIN repayments r ON r.loan_id = l.id
     * WHERE l.id = ? AND l.borrower_id = ?
     */
    async getLoanDetail(borrowerId: string, loanId: string): Promise<LoanDetailDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const loanIdNum = parseInt(loanId, 10);

            // TODO: Query loan details
            // TODO: Query repayment schedule

            const schedule: RepaymentScheduleItemDto[] = [
                {
                    dueDate: '2026-02-01',
                    amount: 4500,
                    status: 'PENDING',
                },
                {
                    dueDate: '2026-03-01',
                    amount: 4500,
                    status: 'PENDING',
                },
                {
                    dueDate: '2026-04-01',
                    amount: 4500,
                    status: 'PAID',
                    paidAmount: 4500,
                    paidDate: '2026-04-01',
                },
            ];

            const loan: LoanDetailDto = {
                id: loanIdNum,
                applicationId: 101,
                amount: 50000,
                durationMonths: 12,
                status: 'ACTIVE',
                disbursedAmount: 50000,
                disbursedAt: '2026-01-01',
                expectedCompletionDate: '2027-01-01',
                remainingBalance: 48000,
                paidAmount: 2000,
                nextRepaymentDate: '2026-02-01',
                nextRepaymentAmount: 4500,
                delayedPaymentsCount: 0,
                repaymentSchedule: schedule,
            };

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_LOAN_DETAIL',
                entity: 'LOAN',
                entityId: loanIdNum,
                createdAt: new Date(),
            } as any);

            return loan;
        } catch (error: any) {
            console.error('Error fetching loan detail:', error);
            throw new Error('Failed to fetch loan details');
        }
    }

    /**
     * Get repayment schedule for loan
     * Returns all repayments with payment status
     *
     * SQL:
     * SELECT
     *   r.id,
     *   r.due_date,
     *   r.amount,
     *   ps.code as status,
     *   p.amount as paidAmount,
     *   p.created_at as paidDate,
     *   CASE WHEN DATEDIFF(NOW(), r.due_date) > 0 THEN DATEDIFF(NOW(), r.due_date) ELSE 0 END as days_overdue
     * FROM repayments r
     * LEFT JOIN payments p ON p.repayment_id = r.id
     * JOIN payment_statuses ps ON ps.id = p.status_id (or derive from r.paid_at)
     * WHERE r.loan_id = ?
     * ORDER BY r.due_date ASC
     */
    async getRepaymentSchedule(borrowerId: string, loanId: string): Promise<RepaymentScheduleItemDto[]> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const loanIdNum = parseInt(loanId, 10);

            // TODO: Query repayments table for loan_id
            const schedule: RepaymentScheduleItemDto[] = [];

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_REPAYMENT_SCHEDULE',
                entity: 'LOAN',
                entityId: loanIdNum,
                createdAt: new Date(),
            } as any);

            return schedule;
        } catch (error: any) {
            console.error('Error fetching repayment schedule:', error);
            throw new Error('Failed to fetch repayment schedule');
        }
    }

    /**
     * Get payment history for loan
     * Returns all payments made towards this loan
     *
     * SQL:
     * SELECT
     *   p.id,
     *   p.amount,
     *   ps.code as status,
     *   pp.code as payment_method,
     *   p.created_at as paidDate,
     *   p.failure_reason,
     *   p.reference
     * FROM payments p
     * LEFT JOIN payment_statuses ps ON ps.id = p.status_id
     * LEFT JOIN payment_providers pp ON pp.id = p.provider_id
     * WHERE p.loan_id = ?
     * ORDER BY p.created_at DESC
     */
    async getPaymentHistory(
        borrowerId: string,
        loanId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<PaymentHistoryDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const loanIdNum = parseInt(loanId, 10);
            const offset = (page - 1) * pageSize;

            // TODO: Query payments for loan_id
            const payments: PaymentItemDto[] = [];
            const totalItems = 0;
            const totalPaid = 0;

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_PAYMENT_HISTORY',
                entity: 'LOAN',
                entityId: loanIdNum,
                createdAt: new Date(),
            } as any);

            return {
                payments,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
                totalPaid,
            };
        } catch (error: any) {
            console.error('Error fetching payment history:', error);
            throw new Error('Failed to fetch payment history');
        }
    }
}
