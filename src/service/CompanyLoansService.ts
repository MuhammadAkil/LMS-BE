import { AppDataSource } from '../config/database';
import {
    ManagedLoanResponse,
    ManagedLoansListResponse,
    ManagedLoanDetailResponse,
    CompanyPaginationQuery,
    RepaymentDetailDto,
} from '../dto/CompanyDtos';
import { LoanDisbursementService } from './LoanDisbursementService';

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

            // Get loans managed by this company's linked lenders, with lender info (on whose behalf company acts).
            const loans = await queryRunner.query(
                `
        SELECT 
          l.id,
          l.borrowerId,
          u.email as borrowerEmail,
          CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) as borrowerName,
          l.totalAmount as loanAmount,
          l.fundedAmount as outstandingBalance,
          l.statusId,
          ls.code as status,
          l.createdAt,
          l.dueDate as nextPaymentDueDate,
          MIN(lo.lenderId) as lenderId,
          GROUP_CONCAT(DISTINCT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(ul.first_name,''), ' ', COALESCE(ul.last_name,''))), ''), ul.email) ORDER BY lo.lenderId) as lenderName,
          (SELECT ul2.email FROM users ul2 WHERE ul2.id = MIN(lo.lenderId) LIMIT 1) as lenderEmail
        FROM loans l
        INNER JOIN loan_offers lo ON lo.loanId = l.id
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId AND cl.companyId = ? AND cl.active = true
        INNER JOIN users u ON l.borrowerId = u.id
        LEFT JOIN loan_statuses ls ON l.statusId = ls.id
        LEFT JOIN users ul ON ul.id = lo.lenderId
        GROUP BY l.id, l.borrowerId, u.email, u.first_name, u.last_name, l.totalAmount, l.fundedAmount, l.statusId, ls.code, l.createdAt, l.dueDate
        ORDER BY l.createdAt DESC
        LIMIT ? OFFSET ?
        `,
                [companyId, pageSize, offset]
            );

            // Get total count
            const countResult = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as total
        FROM loans l
        INNER JOIN loan_offers lo ON lo.loanId = l.id
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
        WHERE cl.companyId = ? AND cl.active = true
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
              r.dueDate,
              r.amount,
              r.paidAt as paidDate
            FROM repayments r
            WHERE r.loanId = ?
            ORDER BY r.dueDate ASC
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
                        lenderId: loan.lenderId,
                        lenderName: loan.lenderName || loan.lenderEmail || 'Lender',
                        lenderEmail: loan.lenderEmail,
                        repaymentDetails: repayments.map((r: any) => ({
                            id: r.id,
                            dueDate: r.dueDate,
                            amount: parseFloat(r.amount || 0),
                            status: r.paidDate ? 'PAID' : 'PENDING',
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
            // Verify company's lender manages this loan (one lender row via company_lenders)
            const loan = await queryRunner.query(
                `
        SELECT 
          l.id,
          l.borrowerId,
          u.email as borrowerEmail,
          CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) as borrowerName,
          l.totalAmount as loanAmount,
          l.fundedAmount as outstandingBalance,
          l.interest_rate as interestRate,
          l.statusId,
          ls.code as status,
          l.createdAt,
          l.dueDate as nextPaymentDueDate,
          lo.lenderId,
          COALESCE(NULLIF(TRIM(CONCAT(COALESCE(ul.first_name,''), ' ', COALESCE(ul.last_name,''))), ''), ul.email) as lenderName,
          ul.email as lenderEmail
        FROM loans l
        INNER JOIN loan_offers lo ON lo.loanId = l.id
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId AND cl.companyId = ? AND cl.active = true
        INNER JOIN users u ON l.borrowerId = u.id
        LEFT JOIN loan_statuses ls ON l.statusId = ls.id
        LEFT JOIN users ul ON ul.id = lo.lenderId
        WHERE l.id = ?
        LIMIT 1
        `,
                [companyId, loanId]
            );

            if (!loan || loan.length === 0) {
                throw new Error('Loan not found');
            }

            // Verify company has access via company_lenders
            const access = await queryRunner.query(
                `SELECT id FROM company_lenders WHERE companyId = ? AND lenderId = ? AND active = true`,
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
          r.dueDate,
          r.amount,
          r.paidAt as paidDate
        FROM repayments r
        WHERE r.loanId = ?
        ORDER BY r.dueDate ASC
        `,
                [loanId]
            );

            // Calculate repayment statistics
            const totalRepayments = repayments.length;
            const paidRepayments = repayments.filter(
                (r: any) => r.paidDate != null
            ).length;
            const overdueRepayments = repayments.filter((r: any) => !r.paidDate && new Date(r.dueDate) < new Date()).length;

            const disbursementService = new LoanDisbursementService();
            const disbursement = await disbursementService.getByLoanId(loanId);

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
                lenderId: loan[0].lenderId,
                lenderName: loan[0].lenderName || loan[0].lenderEmail || 'Lender',
                lenderEmail: loan[0].lenderEmail,
                repaymentDetails: repayments.map((r: any) => ({
                    id: r.id,
                    dueDate: r.dueDate,
                    amount: parseFloat(r.amount || 0),
                    status: r.paidDate ? 'PAID' : 'PENDING',
                    paidDate: r.paidDate,
                })),
                contractTerms: '',
                interestRate: parseFloat(loan[0].interestRate || 0),
                totalRepayments,
                paidRepayments,
                overdueRepayments,
                disbursement: disbursement ?? undefined,
            };
        } finally {
            await queryRunner.release();
        }
    }
}
