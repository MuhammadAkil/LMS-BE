import { AuditLogRepository } from '../repository/AuditLogRepository';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { RepaymentRepository } from '../repository/RepaymentRepository';
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
    private loanRepo: LoanRepository;
    private loanAppRepo: LoanApplicationRepository;
    private repaymentRepo: RepaymentRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.loanRepo = new LoanRepository();
        this.loanAppRepo = new LoanApplicationRepository();
        this.repaymentRepo = new RepaymentRepository();
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

            // Query loans with ACTIVE status for borrower
            const [loans, totalItems] = await this.loanRepo.findActiveByBorrowerId(
                borrowerIdNum,
                pageSize,
                offset
            );

            let totalOutstanding = 0;
            const loanDtos: ActiveLoanListItemDto[] = await Promise.all(
                loans.map(async (loan) => {
                    // Get application details
                    const app = await this.loanAppRepo.findById(loan.applicationId);
                    if (!app) throw new Error('Application not found');

                    // Get repayments
                    const repayments = await this.repaymentRepo.findByLoanId(loan.id);

                    // Calculate paid and remaining amounts
                    let paidAmount = 0;
                    let remainingBalance = 0;
                    let nextRepaymentDate: string | null = null;
                    let nextRepaymentAmount = 0;

                    repayments.forEach((r) => {
                        if (r.paidAt) {
                            paidAmount += r.amount;
                        } else {
                            remainingBalance += r.amount;
                            if (!nextRepaymentDate || r.dueDate < new Date(nextRepaymentDate)) {
                                nextRepaymentDate = r.dueDate.toISOString();
                                nextRepaymentAmount = r.amount;
                            }
                        }
                    });

                    totalOutstanding += remainingBalance;

                    const expectedCompletionDate = new Date(loan.createdAt);
                    expectedCompletionDate.setMonth(expectedCompletionDate.getMonth() + app.durationMonths);

                    return {
                        id: loan.id,
                        applicationId: loan.applicationId,
                        amount: app.amount,
                        durationMonths: app.durationMonths,
                        status: 'ACTIVE',
                        disbursedAmount: loan.fundedAmount,
                        disbursedAt: loan.createdAt.toISOString().split('T')[0],
                        expectedCompletionDate: expectedCompletionDate.toISOString().split('T')[0],
                        nextRepaymentDate: nextRepaymentDate?.split('T')[0] || null,
                        nextRepaymentAmount: nextRepaymentAmount,
                        remainingBalance: remainingBalance,
                    };
                })
            );

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_ACTIVE_LOANS',
                entity: 'LOAN',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                loans: loanDtos,
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

            // Query loan details
            const loan = await this.loanRepo.findById(loanIdNum);
            if (!loan || Number(loan.borrowerId) !== borrowerIdNum) {
                throw new Error('Loan not found');
            }

            // Get application
            const app = await this.loanAppRepo.findById(loan.applicationId);
            if (!app) throw new Error('Application not found');

            // Get repayments
            const repayments = await this.repaymentRepo.findByLoanId(loanIdNum);

            // Calculate amounts
            let paidAmount = 0;
            let remainingBalance = 0;
            let nextRepaymentDate: string | null = null;
            let nextRepaymentAmount = 0;
            let delayedPaymentsCount = 0;
            const schedule: RepaymentScheduleItemDto[] = [];

            const today = new Date();

            repayments.forEach((r) => {
                if (r.paidAt) {
                    paidAmount += r.amount;
                    schedule.push({
                        dueDate: r.dueDate.toISOString().split('T')[0],
                        amount: r.amount,
                        status: 'PAID',
                        paidAmount: r.amount,
                        paidDate: r.paidAt.toISOString().split('T')[0],
                    });
                } else {
                    remainingBalance += r.amount;
                    const isPastDue = r.dueDate < today;

                    schedule.push({
                        dueDate: r.dueDate.toISOString().split('T')[0],
                        amount: r.amount,
                        status: isPastDue ? 'OVERDUE' : 'PENDING',
                    });

                    if (isPastDue) {
                        delayedPaymentsCount++;
                    }

                    if (!nextRepaymentDate || r.dueDate < new Date(nextRepaymentDate)) {
                        nextRepaymentDate = r.dueDate.toISOString().split('T')[0];
                        nextRepaymentAmount = r.amount;
                    }
                }
            });

            const expectedCompletionDate = new Date(loan.createdAt);
            expectedCompletionDate.setMonth(expectedCompletionDate.getMonth() + app.durationMonths);

            const loanDetail: LoanDetailDto = {
                id: loanIdNum,
                applicationId: loan.applicationId,
                amount: app.amount,
                durationMonths: app.durationMonths,
                status: 'ACTIVE',
                disbursedAmount: loan.fundedAmount,
                disbursedAt: loan.createdAt.toISOString().split('T')[0],
                expectedCompletionDate: expectedCompletionDate.toISOString().split('T')[0],
                remainingBalance: remainingBalance,
                paidAmount: paidAmount,
                nextRepaymentDate: nextRepaymentDate,
                nextRepaymentAmount: nextRepaymentAmount,
                delayedPaymentsCount: delayedPaymentsCount,
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

            return loanDetail;
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

            // Verify loan belongs to borrower
            const loan = await this.loanRepo.findById(loanIdNum);
            if (!loan || Number(loan.borrowerId) !== borrowerIdNum) {
                throw new Error('Loan not found');
            }

            // Query repayments table for loan_id
            const repayments = await this.repaymentRepo.findByLoanId(loanIdNum);

            const today = new Date();
            const schedule: RepaymentScheduleItemDto[] = repayments.map((r) => {
                if (r.paidAt) {
                    return {
                        dueDate: r.dueDate.toISOString().split('T')[0],
                        amount: r.amount,
                        status: 'PAID',
                        paidAmount: r.amount,
                        paidDate: r.paidAt.toISOString().split('T')[0],
                    };
                } else {
                    const isPastDue = r.dueDate < today;
                    return {
                        dueDate: r.dueDate.toISOString().split('T')[0],
                        amount: r.amount,
                        status: isPastDue ? 'OVERDUE' : 'PENDING',
                    };
                }
            });

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

    /**
     * Borrower marks an installment as paid (self-report).
     * Sets repayments.paid_at for the given repayment id.
     */
    async confirmRepayment(borrowerId: string, loanId: string, repaymentId: string): Promise<{ success: boolean }> {
        const borrowerIdNum = parseInt(borrowerId, 10);
        const loanIdNum = parseInt(loanId, 10);
        const repaymentIdNum = parseInt(repaymentId, 10);

        const loan = await this.loanRepo.findById(loanIdNum);
        if (!loan || Number(loan.borrowerId) !== borrowerIdNum) throw new Error('Loan not found');

        const repayment = await this.repaymentRepo.findById(repaymentIdNum);
        if (!repayment || Number(repayment.loanId) !== loanIdNum) throw new Error('Repayment not found');
        if (repayment.paidAt) throw new Error('This installment is already marked as paid');

        await this.repaymentRepo.update(repaymentIdNum, { paidAt: new Date() });

        await this.auditRepo.create({
            actorId: borrowerIdNum,
            action: 'REPAYMENT_CONFIRMED_BY_BORROWER',
            entity: 'REPAYMENT',
            entityId: repaymentIdNum,
            createdAt: new Date(),
        } as any);

        return { success: true };
    }
}
