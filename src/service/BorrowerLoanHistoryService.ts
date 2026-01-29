import { AuditLogRepository } from '../repository/AuditLogRepository';
import {
    LoanHistoryListResponse,
    LoanHistoryListItemDto,
    LoanHistoryDetailDto,
    ContractDto,
} from '../dto/BorrowerDtos';

/**
 * B-06: BORROWER LOAN HISTORY SERVICE
 * Provides view of completed/defaulted loans
 *
 * Rules:
 * - Includes REPAID and DEFAULTED loans only
 * - Agreements downloadable from contracts table
 * - May include additional statements and documentation
 */
export class BorrowerLoanHistoryService {
    private auditRepo: AuditLogRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
    }

    /**
     * Get borrower's loan history (paginated)
     * Only shows REPAID and DEFAULTED loans
     *
     * SQL:
     * SELECT
     *   l.id,
     *   l.application_id,
     *   la.amount,
     *   la.duration_months,
     *   ls.code as status,
     *   l.created_at as disbursedAt,
     *   l.updated_at as completedAt,
     *   SUM(p.amount) as totalRepaid,
     *   SUM(p.interest) as totalInterestPaid
     * FROM loans l
     * JOIN loan_applications la ON la.id = l.application_id
     * JOIN loan_statuses ls ON ls.id = l.status_id
     * LEFT JOIN payments p ON p.loan_id = l.id AND p.status_id = PAID_STATUS_ID
     * WHERE l.borrower_id = ? AND l.status_id IN (REPAID_STATUS_ID, DEFAULTED_STATUS_ID)
     * ORDER BY l.updated_at DESC
     */
    async getLoanHistoryPaginated(
        borrowerId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<LoanHistoryListResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const offset = (page - 1) * pageSize;

            // TODO: Query loans with status = REPAID or DEFAULTED
            const loans: LoanHistoryListItemDto[] = [];
            const totalItems = 0;
            const totalHistorical = 0;

            // Sample data
            loans.push({
                id: 1,
                applicationId: 100,
                amount: 30000,
                durationMonths: 12,
                status: 'REPAID',
                disbursedAt: '2025-01-01',
                completedAt: '2026-01-01',
                totalRepaid: 30000,
                totalInterestPaid: 1500,
            });

            // Audit log
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
     *
     * SQL:
     * SELECT
     *   l.*,
     *   c.id,
     *   c.file_path,
     *   c.created_at,
     *   c.signed_at
     * FROM loans l
     * LEFT JOIN contracts c ON c.loan_id = l.id
     * WHERE l.id = ? AND l.borrower_id = ? AND l.status_id IN (REPAID_STATUS_ID, DEFAULTED_STATUS_ID)
     */
    async getLoanHistoryDetail(borrowerId: string, loanId: string): Promise<LoanHistoryDetailDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const loanIdNum = parseInt(loanId, 10);

            // TODO: Query loan history detail with contract

            const contract: ContractDto = {
                id: 1,
                loanId: loanIdNum,
                documentPath: '/contracts/loan_1_contract.pdf',
                createdAt: '2025-01-01',
                signedAt: '2025-01-02',
                downloadUrl: '/api/documents/1/download',
            };

            const detail: LoanHistoryDetailDto = {
                id: loanIdNum,
                applicationId: 100,
                amount: 30000,
                durationMonths: 12,
                status: 'REPAID',
                disbursedAmount: 30000,
                disbursedAt: '2025-01-01',
                expectedCompletionDate: '2026-01-01',
                actualCompletionDate: '2026-01-01',
                remainingBalance: 0,
                paidAmount: 30000,
                delayedPaymentsCount: 0,
                repaymentSchedule: [],
                contract: contract,
                finalPaymentDate: '2026-01-01',
                totalInterestPaid: 1500,
            };

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_LOAN_HISTORY_DETAIL',
                entity: 'LOAN',
                entityId: loanIdNum,
                createdAt: new Date(),
            } as any);

            return detail;
        } catch (error: any) {
            console.error('Error fetching loan history detail:', error);
            throw new Error('Failed to fetch loan history detail');
        }
    }
}
