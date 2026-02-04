import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import {
    CompanyDashboardResponse,
    BulkActionSummaryDto,
} from '../dto/CompanyDtos';

/**
 * Company Dashboard Service
 * Aggregates KPIs for company management view
 *
 * Fintech compliance:
 * - Managed funds: sum of all signed management_agreements.amount
 * - Active managed loans: loans joined via lenders in company_lenders
 * - Defaulted loans: status_id = DEFAULTED
 * - Automation status: count of active auto_invest_rules
 * - Recent bulk actions: last 5 bulk exports/reminders
 */
export class CompanyDashboardService {
    private auditService: CompanyAuditService;

    constructor() {
        this.auditService = new CompanyAuditService();
    }

    /**
     * Get company dashboard KPIs
     * Read-only operation - minimal audit requirement
     */
    async getDashboard(companyId: number): Promise<CompanyDashboardResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // 1. Calculate managed funds (sum of signed management_agreements)
            const managedFundsResult = await queryRunner.query(
                `
        SELECT COALESCE(SUM(amount), 0) as totalAmount
        FROM management_agreements
        WHERE company_id = ? AND signed_at IS NOT NULL
        `,
                [companyId]
            );

            const managedFunds = parseFloat(managedFundsResult[0]?.totalAmount || 0);

            // 2. Count active managed loans
            // Logic: loans where lender_id in (SELECT lender_id FROM company_lenders WHERE company_id = ? AND active = true)
            const activeManagedLoansResult = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as count
        FROM loans l
        INNER JOIN company_lenders cl ON l.lender_id = cl.lender_id
        WHERE cl.company_id = ? AND cl.active = true AND l.status_id != 3
        `,
                [companyId]
            );

            const activeManagedLoans = parseInt(activeManagedLoansResult[0]?.count || 0);

            // 3. Count defaulted loans managed by company
            const defaultedLoansResult = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as count
        FROM loans l
        INNER JOIN company_lenders cl ON l.lender_id = cl.lender_id
        WHERE cl.company_id = ? AND l.status_id = 3
        `,
                [companyId]
            );

            const defaultedLoans = parseInt(defaultedLoansResult[0]?.count || 0);

            // 4. Automation status
            const automationResult = await queryRunner.query(
                `
        SELECT 
          COUNT(*) as totalRules,
          SUM(CASE WHEN active = true THEN 1 ELSE 0 END) as activeRules
        FROM auto_invest_rules
        WHERE company_id = ?
        `,
                [companyId]
            );

            const totalRules = parseInt(automationResult[0]?.totalRules || 0);
            const activeRules = parseInt(automationResult[0]?.activeRules || 0);

            // 5. Recent bulk actions (last 5)
            const bulkActionsResult = await queryRunner.query(
                `
        SELECT id, type, item_count as itemCount, status, created_at as createdAt
        FROM exports
        WHERE company_id = ?
        ORDER BY created_at DESC
        LIMIT 5
        `,
                [companyId]
            );

            const recentBulkActions: BulkActionSummaryDto[] = bulkActionsResult.map((row: any) => ({
                id: row.id,
                type: row.type,
                itemCount: row.itemCount,
                status: row.status,
                createdAt: row.createdAt,
            }));

            // 6. Get agreement status
            const agreementResult = await queryRunner.query(
                `
        SELECT id, signed_at as signedAt, amount
        FROM management_agreements
        WHERE company_id = ? AND signed_at IS NOT NULL
        LIMIT 1
        `,
                [companyId]
            );

            const agreementStatus = {
                isSigned: agreementResult.length > 0,
                signedAt: agreementResult[0]?.signedAt,
                amount: agreementResult[0]?.amount,
            };

            // 7. Log the view (compliance requirement)
            await this.auditService.logAction(
                -1, // System user
                'VIEW_COMPANY_DASHBOARD',
                'DASHBOARD',
                companyId
            );

            return {
                managedFunds,
                activeManagedLoans,
                defaultedLoans,
                automationStatus: {
                    rulesCount: totalRules,
                    activeRules: activeRules,
                    automatedTransactionsLast30Days: 0, // Would require additional query
                },
                recentBulkActions,
                agreementStatus,
                timestamp: new Date(),
            };
        } finally {
            await queryRunner.release();
        }
    }
}
