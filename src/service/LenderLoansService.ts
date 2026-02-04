import {
    LoanBrowseItemDto,
    LoanBrowsePageResponse,
    LoanDetailResponse,
    LoanBrowseFilterDto
} from '../dto/LenderDtos';
import { AuditLogRepository } from '../repository/AuditLogRepository';

/**
 * L-02: LENDER LOANS SERVICE
 * Browse available loans, show funding progress
 * Read-only operations
 */
export class LenderLoansService {
    private auditLogRepository: AuditLogRepository;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
    }

    /**
     * Browse available loans for lender
     * Only shows OPEN loan_applications
     * Calculates funded_percent from loan_offers
     * Returns CTA eligibility flag
     * 
     * SQL Query:
     * SELECT 
     *   la.id,
     *   la.borrower_id,
     *   la.amount,
     *   la.duration_months,
     *   la.purpose,
     *   las.code as status_code,
     *   las.name as status_name,
     *   la.created_at,
     *   COALESCE(SUM(lo.amount) / la.amount * 100, 0) as funded_percent,
     *   la.amount - COALESCE(SUM(lo.amount), 0) as remaining_amount,
     *   COUNT(DISTINCT lo.id) as total_offers,
     *   COALESCE(u.level >= ? AND u.status_id = 2, FALSE) as cta_eligible
     * FROM loan_applications la
     * JOIN loan_application_statuses las ON las.id = la.status_id
     * LEFT JOIN loan_offers lo ON lo.loan_id = la.id OR (la.id = (SELECT id FROM loans WHERE application_id = la.id LIMIT 1))
     * JOIN users u ON u.id = ? (current lender)
     * WHERE las.code = 'OPEN'
     * GROUP BY la.id
     * ORDER BY la.created_at DESC
     */
    async browseLoansPaginated(
        lenderId: string,
        filters: LoanBrowseFilterDto
    ): Promise<LoanBrowsePageResponse> {
        try {
            const page = filters.page || 1;
            const pageSize = filters.pageSize || 10;
            const offset = (page - 1) * pageSize;

            const items: LoanBrowseItemDto[] = [];
            let totalItems = 0;

            // TODO: Query loan_applications with status = OPEN
            // Calculate fundedPercent from SUM(loan_offers.amount) / loan_application.amount
            // Include offer details for each loan
            // Check CTA eligibility for current lender based on:
            //   - Lender status = ACTIVE
            //   - Lender verification level >= required
            //   - Lender has verified bank account
            //   - Loan still has remaining capacity

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} browsed loans`);

            return {
                items,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
            };
        } catch (error: any) {
            console.error('Error browsing loans:', error);
            throw new Error('Failed to browse loans');
        }
    }

    /**
     * Get specific loan details
     * Returns offer details, borrower info, funding progress
     * 
     * SQL Query:
     * SELECT 
     *   la.id,
     *   la.amount,
     *   la.duration_months,
     *   la.purpose,
     *   u.email as borrower_name,
     *   u.level as borrower_level,
     *   (SELECT COUNT(*) FROM user_verifications uv WHERE uv.user_id = u.id AND uv.status_id = 2) as verification_count,
     *   COUNT(DISTINCT lo.id) as total_offers,
     *   SUM(CASE WHEN lo.lender_id != ? THEN lo.amount ELSE 0 END) as funded_by_others
     * FROM loan_applications la
     * JOIN users u ON u.id = la.borrower_id
     * LEFT JOIN loan_offers lo ON lo.loan_id = (SELECT id FROM loans WHERE application_id = la.id LIMIT 1)
     * WHERE la.id = ?
     */
    async getLoanDetail(lenderId: string, loanId: string): Promise<LoanDetailResponse> {
        try {
            // TODO: Query loan_applications and related data
            // Get borrower details
            // Calculate funding progress and owned offers
            // Determine CTA eligibility

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} viewed loan detail for ${loanId}`);

            throw new Error('Loan not found');
        } catch (error: any) {
            console.error('Error fetching loan detail:', error);
            throw error;
        }
    }
}
