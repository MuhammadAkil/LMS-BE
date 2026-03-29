import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import { sumAccruedCommissionsCurrentYear } from '../util/CommissionCalculationUtil';
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
    async getDashboard(companyId: number, userId: number = 0): Promise<CompanyDashboardResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // 0. Company conditions status
            const companyRow = await queryRunner.query(
                `SELECT conditions_status, conditions_locked_at, conditions_json FROM companies WHERE id = ?`,
                [companyId]
            );
            const conditionsStatus = companyRow?.[0]?.conditions_status
                ?? (companyRow?.[0]?.conditions_locked_at ? 'approved' : 'not_submitted');

            // 1. Managed funds (sum of signed management_agreements.amount; fallback company_lenders.amount_limit)
            const managedFundsResult = await queryRunner.query(
                `
        SELECT COALESCE(SUM(ma.amount), 0) as totalAmount
        FROM management_agreements ma
        WHERE ma.companyId = ? AND ma.signedAt IS NOT NULL AND (ma.terminated_at IS NULL OR ma.terminated_at > NOW())
        `,
                [companyId]
            );
            let managedFunds = parseFloat(managedFundsResult[0]?.totalAmount || 0);
            if (managedFunds === 0) {
                const clResult = await queryRunner.query(
                    `SELECT COALESCE(SUM(amountLimit), 0) as total FROM company_lenders WHERE companyId = ? AND active = 1`,
                    [companyId]
                );
                managedFunds = parseFloat(clResult[0]?.total || 0);
            }

            // 2. Count active managed loans
            // Logic: loans where lender_id in (SELECT lender_id FROM company_lenders WHERE company_id = ? AND active = true)
            const activeManagedLoansResult = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as count
        FROM loans l
        INNER JOIN loan_offers lo ON lo.loanId = l.id
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
        WHERE cl.companyId = ? AND cl.active = true AND l.statusId != 3
        `,
                [companyId]
            );

            const activeManagedLoans = parseInt(activeManagedLoansResult[0]?.count || 0);

            // 3. Count defaulted loans managed by company
            const defaultedLoansResult = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as count
        FROM loans l
        INNER JOIN loan_offers lo ON lo.loanId = l.id
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
        WHERE cl.companyId = ? AND l.statusId = 3
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
        WHERE companyId = ?
        `,
                [companyId]
            );

            const totalRules = parseInt(automationResult[0]?.totalRules || 0);
            const activeRules = parseInt(automationResult[0]?.activeRules || 0);

            // 5. Recent bulk actions (last 5)
            const bulkActionsResult = await queryRunner.query(
                `
        SELECT e.id, e.created_at as createdAt, e.record_count as itemCount
        FROM exports e
        INNER JOIN users u ON u.id = e.created_by
        WHERE u.company_id = ?
        ORDER BY e.created_at DESC
        LIMIT 5
        `,
                [companyId]
            ).catch((): any[] => []);

            const recentBulkActions: BulkActionSummaryDto[] = bulkActionsResult.map((row: any) => ({
                id: row.id,
                type: 'EXPORT',
                itemCount: row.itemCount || 0,
                status: 'COMPLETED',
                createdAt: row.createdAt,
            }));

            // 6. Get agreement status
            const agreementResult = await queryRunner.query(
                `
        SELECT id, signedAt, amount
        FROM management_agreements
        WHERE companyId = ? AND signedAt IS NOT NULL
        LIMIT 1
        `,
                [companyId]
            );

            const agreementStatus = {
                isSigned: agreementResult.length > 0,
                signedAt: agreementResult[0]?.signedAt,
                amount: agreementResult[0]?.amount,
            };

            // 7. Commissions accrued (current year, pro-rated)
            const companyRateRow = await queryRunner.query(
                `SELECT commission_pct FROM companies WHERE id = ?`,
                [companyId]
            );
            const ratePct = companyRateRow?.[0]?.commission_pct != null ? Number(companyRateRow[0].commission_pct) : 0;
            const rate = ratePct / 100;
            const agreementRows = await queryRunner.query(
                `SELECT amount, signedAt, terminated_at FROM management_agreements
                 WHERE companyId = ? AND signedAt IS NOT NULL`,
                [companyId]
            );
            const lendersForCommission = (agreementRows || []).map((r: any) => ({
                managedAmount: Number(r.amount || 0),
                agreementStart: r.signedAt,
                agreementEnd: r.terminated_at || null,
            }));
            const commissionsAccrued = sumAccruedCommissionsCurrentYear(lendersForCommission, rate);

            // 8. Default rate (defaulted / active or 0)
            const defaultRate = activeManagedLoans > 0 ? (defaultedLoans / activeManagedLoans) * 100 : 0;

            // 9. Pending actions (placeholder — could be reminders/claims to generate)
            const pendingActions = 0;

            // 10. Recent automation log (last 10 with lender attribution — stub from audit_logs if present)
            const automationLogResult = await queryRunner.query(
                `SELECT entity_id, metadata, created_at FROM audit_logs
                 WHERE entity = 'AUTO_OFFER' AND metadata LIKE ? ORDER BY created_at DESC LIMIT 10`,
                [`%\"companyId\":${companyId}%`]
            ).catch((): any[] => []);
            type LogEntry = { loanId: number; lenderId: number; lenderName?: string; amount: number; createdAt: Date };
            const recentAutomationLog: LogEntry[] = (automationLogResult || []).map((r: any): LogEntry => {
                let meta: any = {};
                try { meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {}; } catch (_) { }
                return {
                    loanId: meta.loanId || 0,
                    lenderId: meta.lenderId || 0,
                    lenderName: meta.lenderName,
                    amount: meta.amount || 0,
                    createdAt: r.created_at || new Date(),
                };
            });

            // 11. Log the view (compliance requirement, only when a real user ID is available)
            if (userId > 0) {
                await this.auditService.logAction(
                    userId,
                    'VIEW_COMPANY_DASHBOARD',
                    'DASHBOARD',
                    companyId
                );
            }

            return {
                conditionsStatus,
                managedFunds,
                managedTotal: managedFunds,
                activeManagedLoans,
                defaultedLoans,
                commissionsAccrued,
                defaultRate,
                pendingActions,
                automationStatus: {
                    rulesCount: totalRules,
                    activeRules: activeRules,
                    automatedTransactionsLast30Days: 0,
                },
                recentBulkActions,
                recentAutomationLog,
                agreementStatus,
                timestamp: new Date(),
            };
        } finally {
            await queryRunner.release();
        }
    }
}
