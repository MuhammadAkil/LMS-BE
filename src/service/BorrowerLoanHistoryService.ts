import { AuditLogRepository } from '../repository/AuditLogRepository';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { RepaymentRepository } from '../repository/RepaymentRepository';
import { AppDataSource } from '../config/database';
import {
    LoanHistoryListResponse,
    LoanHistoryListItemDto,
    LoanHistoryDetailDto,
    ContractDto,
} from '../dto/BorrowerDtos';

const STATUS_LABEL: Record<number, string> = { 3: 'REPAID', 4: 'DEFAULTED', 2: 'ACTIVE' };

/**
 * B-06: BORROWER LOAN HISTORY SERVICE
 * Provides view of completed/defaulted loans
 *
 * Rules:
 * - Includes REPAID (statusId=3) and DEFAULTED (statusId=4) loans only
 * - Agreements downloadable from contracts table
 */
export class BorrowerLoanHistoryService {
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
     * Get borrower's loan history (paginated)
     * Only shows REPAID (3) and DEFAULTED (4) loans
     */
    async getLoanHistoryPaginated(
        borrowerId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<LoanHistoryListResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const offset = (page - 1) * pageSize;

            const [historicalLoans, totalItems] = await this.loanRepo.findHistoricalByBorrowerId(
                borrowerIdNum,
                pageSize,
                offset
            );

            let totalHistorical = 0;
            const loans: LoanHistoryListItemDto[] = await Promise.all(
                historicalLoans.map(async (loan) => {
                    const app = await this.loanAppRepo.findById(loan.applicationId);
                    const amount = app ? Number(app.amount) : Number(loan.totalAmount);
                    const durationMonths = app ? app.durationMonths : 0;

                    const repayments = await this.repaymentRepo.findByLoanId(loan.id);
                    let totalRepaid = 0;
                    repayments.forEach((r) => { if (r.paidAt) totalRepaid += Number(r.amount); });

                    totalHistorical += amount;

                    const completedAt = loan.updatedAt
                        ? loan.updatedAt.toISOString().split('T')[0]
                        : loan.createdAt.toISOString().split('T')[0];

                    return {
                        id: loan.id,
                        applicationId: loan.applicationId,
                        amount,
                        durationMonths,
                        status: STATUS_LABEL[loan.statusId] ?? 'CLOSED',
                        disbursedAt: loan.createdAt.toISOString().split('T')[0],
                        completedAt,
                        totalRepaid,
                        totalInterestPaid: 0,
                    };
                })
            );

            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_LOAN_HISTORY',
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
                totalHistoricalAmount: totalHistorical,
            };
        } catch (error: any) {
            console.error('Error fetching loan history:', error);
            throw new Error('Failed to fetch loan history');
        }
    }

    /**
     * Get loan history detail with contract
     */
    async getLoanHistoryDetail(borrowerId: string, loanId: string): Promise<LoanHistoryDetailDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const loanIdNum = parseInt(loanId, 10);

            const loan = await this.loanRepo.findById(loanIdNum);
            if (!loan || Number(loan.borrowerId) !== borrowerIdNum) {
                throw new Error('Loan not found');
            }

            const app = await this.loanAppRepo.findById(loan.applicationId);
            const amount = app ? Number(app.amount) : Number(loan.totalAmount);
            const durationMonths = app ? app.durationMonths : 0;

            const repayments = await this.repaymentRepo.findByLoanId(loanIdNum);
            let paidAmount = 0;
            let remainingBalance = 0;
            const schedule: any[] = [];

            repayments.forEach((r, i) => {
                const isPaid = !!r.paidAt;
                if (isPaid) paidAmount += Number(r.amount);
                else remainingBalance += Number(r.amount);
                schedule.push({
                    installmentNumber: i + 1,
                    dueDate: r.dueDate.toISOString().split('T')[0],
                    amount: Number(r.amount),
                    principal: Number(r.amount),
                    interest: 0,
                    status: isPaid ? 'PAID' : 'PENDING',
                    paidAt: r.paidAt ? r.paidAt.toISOString().split('T')[0] : undefined,
                });
            });

            // Fetch contract if exists
            let contract: ContractDto | undefined;
            try {
                const db = AppDataSource;
                const [rows]: any = await (db as any).query(
                    'SELECT id, loanId, pdfPath, generatedAt, createdAt FROM contracts WHERE loanId = ? LIMIT 1',
                    [loanIdNum]
                );
                const c = Array.isArray(rows) ? rows[0] : rows;
                if (c) {
                    contract = {
                        id: c.id,
                        loanId: c.loanId,
                        documentPath: c.pdfPath,
                        createdAt: c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '',
                        signedAt: c.generatedAt ? new Date(c.generatedAt).toISOString().split('T')[0] : undefined,
                        downloadUrl: `/api/borrower/documents/c_${c.id}/download`,
                    };
                }
            } catch (_) { }

            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_LOAN_HISTORY_DETAIL',
                entity: 'LOAN',
                entityId: loanIdNum,
                createdAt: new Date(),
            } as any);

            const completedAt = loan.updatedAt
                ? loan.updatedAt.toISOString().split('T')[0]
                : loan.createdAt.toISOString().split('T')[0];

            return {
                id: loanIdNum,
                applicationId: loan.applicationId,
                amount,
                durationMonths,
                status: STATUS_LABEL[loan.statusId] ?? 'CLOSED',
                disbursedAmount: Number(loan.fundedAmount),
                disbursedAt: loan.createdAt.toISOString().split('T')[0],
                expectedCompletionDate: completedAt,
                actualCompletionDate: completedAt,
                remainingBalance,
                paidAmount,
                delayedPaymentsCount: 0,
                repaymentSchedule: schedule,
                contract,
                finalPaymentDate: completedAt,
                totalInterestPaid: 0,
            };
        } catch (error: any) {
            console.error('Error fetching loan history detail:', error);
            throw new Error('Failed to fetch loan history detail');
        }
    }
}
