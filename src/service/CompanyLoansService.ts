import { AppDataSource } from '../config/database';
import {
    ManagedLoanResponse,
    ManagedLoansListResponse,
    ManagedLoanDetailResponse,
    CompanyPaginationQuery,
    RepaymentDetailDto,
} from '../dto/CompanyDtos';

/**
 * Company Loans Service
 * Provides read-only access to managed loans
 *
 * Fintech compliance:
 * - Loans are managed by linked lenders only
 * - Borrower PII is masked (only first name, email)
 * - Read-only access - company cannot create/modify loans
 * - All loan data must pass through company_lenders relationship
 * - Repayment and payment details visible
 */
export class CompanyLoansService {
    /**
     * Get paginated list of managed loans
     * Fintech compliance:
     * - Joins via company_lenders to ensure company legitimacy
     * - Masks borrower PII (phone, full name, address)
     * - Shows only first name and email
     */
    async getManagedLoans(
        companyId: number,
        query: CompanyPaginationQuery
    ): Promise<ManagedLoansListResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const page = query.page || 1;
            const pageSize = Math.min(query.pageSize || 20, 100);
            const offset = (page - 1) * pageSize;

            // Get loans managed by this company's linked lenders
            const loans = await queryRunner.query(
                `
        SELECT 
          l.id,
          l.borrower_id as borrowerId,
          u.email as borrowerEmail,
          u.name as borrowerName,
          l.amount as loanAmount,
          l.outstanding_balance as outstandingBalance,
          l.status_id as statusId,
          ls.code as status,
          l.created_at as createdAt,
          l.next_payment_due as nextPaymentDueDate
        FROM loans l
        INNER JOIN company_lenders cl ON l.lender_id = cl.lender_id
        INNER JOIN users u ON l.borrower_id = u.id
        LEFT JOIN loan_statuses ls ON l.status_id = ls.id
        WHERE cl.company_id = ? AND cl.active = true
        ORDER BY l.created_at DESC
        LIMIT ? OFFSET ?
        `,
                [companyId, pageSize, offset]
            );

            // Get total count
            const countResult = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as total
        FROM loans l
        INNER JOIN company_lenders cl ON l.lender_id = cl.lender_id
        WHERE cl.company_id = ? AND cl.active = true
        `,
                [companyId]
            );

            const total = parseInt(countResult[0]?.total || 0);
            const pages = Math.ceil(total / pageSize);

            // Fetch repayment details for each loan
            const loansWithRepayments: ManagedLoanResponse[] = await Promise.all(
                loans.map(async (loan: any) => {
                    const repayments = await queryRunner.query(
                        `
            SELECT 
              r.id,
              r.due_date as dueDate,
              r.amount,
              r.status_id as statusId,
              rs.code as status,
              r.paid_date as paidDate
            FROM repayments r
            LEFT JOIN payment_statuses rs ON r.status_id = rs.id
            WHERE r.loan_id = ?
            ORDER BY r.due_date ASC
            `,
                        [loan.id]
                    );

                    return {
                        id: loan.id,
                        borrowerId: loan.borrowerId,
                        borrowerEmail: loan.borrowerEmail,
                        borrowerName: loan.borrowerName?.split(' ')[0] || 'Borrower', // Only first name
                        loanAmount: parseFloat(loan.loanAmount || 0),
                        outstandingBalance: parseFloat(loan.outstandingBalance || 0),
                        status: loan.status,
                        statusId: loan.statusId,
                        createdAt: loan.createdAt,
                        nextPaymentDueDate: loan.nextPaymentDueDate,
                        repaymentDetails: repayments.map((r: any) => ({
                            id: r.id,
                            dueDate: r.dueDate,
                            amount: parseFloat(r.amount || 0),
                            status: r.status,
                            paidDate: r.paidDate,
                        })),
                    };
                })
            );

            return {
                data: loansWithRepayments,
                pagination: {
                    page,
                    pageSize,
                    total,
                    pages,
                },
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get detailed information for a specific managed loan
     * Fintech compliance:
     * - Verify company has legitimate access via company_lenders
     * - Mask all unnecessary borrower PII
     * - Include full repayment and contract details
     */
    async getManagedLoanDetail(
        companyId: number,
        loanId: number
    ): Promise<ManagedLoanDetailResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Verify company's lender manages this loan
            const loan = await queryRunner.query(
                `
        SELECT 
          l.id,
          l.borrower_id as borrowerId,
          u.email as borrowerEmail,
          u.name as borrowerName,
          l.amount as loanAmount,
          l.outstanding_balance as outstandingBalance,
          l.interest_rate as interestRate,
          l.status_id as statusId,
          ls.code as status,
          l.created_at as createdAt,
          l.next_payment_due as nextPaymentDueDate,
          l.contract_terms as contractTerms,
          l.lender_id as lenderId
        FROM loans l
        INNER JOIN users u ON l.borrower_id = u.id
        LEFT JOIN loan_statuses ls ON l.status_id = ls.id
        WHERE l.id = ?
        `,
                [loanId]
            );

            if (!loan || loan.length === 0) {
                throw new Error('Loan not found');
            }

            // Verify company has access via company_lenders
            const access = await queryRunner.query(
                `
        SELECT id FROM company_lenders
        WHERE company_id = ? AND lender_id = ? AND active = true
        `,
                [companyId, loan[0].lenderId]
            );

            if (!access || access.length === 0) {
                throw new Error('Company does not have access to this loan');
            }

            // Get repayment details
            const repayments = await queryRunner.query(
                `
        SELECT 
          r.id,
          r.due_date as dueDate,
          r.amount,
          r.status_id as statusId,
          rs.code as status,
          r.paid_date as paidDate
        FROM repayments r
        LEFT JOIN payment_statuses rs ON r.status_id = rs.id
        WHERE r.loan_id = ?
        ORDER BY r.due_date ASC
        `,
                [loanId]
            );

            // Calculate repayment statistics
            const totalRepayments = repayments.length;
            const paidRepayments = repayments.filter(
                (r: any) => r.status === 'PAID' || r.status === 'COMPLETED'
            ).length;
            const overdueRepayments = repayments.filter((r: any) => r.status === 'OVERDUE').length;

            return {
                id: loan[0].id,
                borrowerId: loan[0].borrowerId,
                borrowerEmail: loan[0].borrowerEmail,
                borrowerName: loan[0].borrowerName?.split(' ')[0] || 'Borrower',
                loanAmount: parseFloat(loan[0].loanAmount || 0),
                outstandingBalance: parseFloat(loan[0].outstandingBalance || 0),
                status: loan[0].status,
                statusId: loan[0].statusId,
                createdAt: loan[0].createdAt,
                nextPaymentDueDate: loan[0].nextPaymentDueDate,
                repaymentDetails: repayments.map((r: any) => ({
                    id: r.id,
                    dueDate: r.dueDate,
                    amount: parseFloat(r.amount || 0),
                    status: r.status,
                    paidDate: r.paidDate,
                })),
                contractTerms: loan[0].contractTerms || '',
                interestRate: parseFloat(loan[0].interestRate || 0),
                totalRepayments,
                paidRepayments,
                overdueRepayments,
            };
        } finally {
            await queryRunner.release();
        }
    }
}
