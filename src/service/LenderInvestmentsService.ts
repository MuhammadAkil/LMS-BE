import {
    LenderInvestmentDto,
    LenderInvestmentsPageResponse,
    LenderInvestmentDetailResponse,
    RepaymentDto,
} from '../dto/LenderDtos';
import { AuditLogRepository } from '../repository/AuditLogRepository';

/**
 * L-04: LENDER INVESTMENTS SERVICE
 * View owned investments and repayment schedules
 * Read-only operations
 */
export class LenderInvestmentsService {
    private auditLogRepository: AuditLogRepository;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
    }

    /**
     * Get all investments for lender (paginated)
     * Joins: loan_offers → loans → loan_applications + repayments
     * 
     * SQL Query:
     * SELECT 
     *   lo.id as investment_id,
     *   l.id as loan_id,
     *   l.borrower_id,
     *   u.email as borrower_name,
     *   lo.id as offer_id,
     *   lo.amount as invested_amount,
     *   lo.created_at as invested_at,
     *   l.total_amount,
     *   lo.amount / l.total_amount * 100 as your_share,
     *   ls.code as loan_status,
     *   l.due_date,
     *   (SELECT MIN(due_date) FROM repayments WHERE loan_id = l.id AND paid_at IS NULL) as next_repayment_date,
     *   c.pdf_path as contract_pdf_url
     * FROM loan_offers lo
     * JOIN loans l ON l.id = lo.loan_id
     * JOIN loan_applications la ON la.id = l.application_id
     * JOIN users u ON u.id = l.borrower_id
     * JOIN loan_statuses ls ON ls.id = l.status_id
     * LEFT JOIN contracts c ON c.loan_id = l.id
     * WHERE lo.lender_id = ?
     * ORDER BY lo.created_at DESC
     * LIMIT ? OFFSET ?
     */
    async getInvestmentsPaginated(
        lenderId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<LenderInvestmentsPageResponse> {
        try {
            const offset = (page - 1) * pageSize;
            const items: LenderInvestmentDto[] = [];

            // TODO: Execute the SQL query above
            // For each offer, determine repayment status:
            //   - ON_TRACK: all repayments paid on time
            //   - OVERDUE: at least one repayment overdue
            //   - COMPLETED: all repayments paid

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} viewed investments`);

            const totalItems = 0; // TODO: Execute COUNT query

            return {
                items,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
                summary: {
                    totalInvested: 0, // TODO: SUM(lo.amount)
                    activeCount: items.filter((i) => i.loanStatus === 'ACTIVE').length,
                    completedCount: items.filter((i) => i.loanStatus === 'REPAID').length,
                    overdueCount: items.filter((i) => i.repaymentStatus === 'OVERDUE').length,
                },
            };
        } catch (error: any) {
            console.error('Error fetching investments:', error);
            throw new Error('Failed to fetch investments');
        }
    }

    /**
     * Get specific investment detail
     * Includes full repayment schedule
     * 
     * SQL for repayments:
     * SELECT 
     *   r.id,
     *   r.due_date,
     *   r.amount,
     *   r.paid_at,
     *   CASE 
     *     WHEN r.paid_at IS NOT NULL THEN 'PAID'
     *     WHEN r.due_date < NOW() THEN 'OVERDUE'
     *     ELSE 'PENDING'
     *   END as status,
     *   CASE 
     *     WHEN r.due_date < NOW() THEN DATEDIFF(NOW(), r.due_date)
     *     ELSE NULL
     *   END as days_overdue
     * FROM repayments r
     * WHERE r.loan_id = ? 
     * ORDER BY r.due_date ASC
     */
    async getInvestmentDetail(
        lenderId: string,
        investmentId: string
    ): Promise<LenderInvestmentDetailResponse> {
        try {
            // TODO: Query loan_offers + loans + repayments
            // Verify that lenderId matches the investment owner

            // Calculate actual ROI if loan is repaid
            const estimatedROI = 0.08; // 8% annual placeholder
            const actualROI: number | undefined = undefined;

            // Fetch repayments with status
            const repayments: RepaymentDto[] = [];

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} viewed investment detail for ${investmentId}`);

            // Return placeholder - replace with actual query result
            throw new Error('Investment not found');
        } catch (error: any) {
            console.error('Error fetching investment detail:', error);
            throw error;
        }
    }

    /**
     * Get repayment schedule for specific investment
     * Returns detailed repayment breakdown
     */
    async getInvestmentRepayments(
        lenderId: string,
        investmentId: string
    ): Promise<RepaymentDto[]> {
        try {
            // TODO: Query and return repayments for this investment
            // Verify ownership

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} viewed repayments for investment ${investmentId}`);

            return [];
        } catch (error: any) {
            console.error('Error fetching repayments:', error);
            throw new Error('Failed to fetch repayments');
        }
    }
}
