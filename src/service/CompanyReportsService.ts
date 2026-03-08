import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import {
    CompanyReportsQuery,
    CompanyPortfolioLoanDto,
    CompanyPortfolioReportResponse,
    CompanyCommissionLenderDto,
    CompanyCommissionReportResponse,
    CompanyDefaultedLoanDto,
    CompanyDefaultedReportResponse,
    CompanyReportExportRequest,
    BulkActionResponse,
} from '../dto/CompanyDtos';
import { ExportRepository } from '../repository/ExportRepository';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Company Reports Service
 * Flow 12: Reports & Exports — scoped to company only (no data leakage)
 *
 * Fintech compliance:
 * - All queries filter by companyId through company_lenders join
 * - Commission calculation uses company's fixed rate from conditions_json
 * - Defaulted loans: statusId = 3
 * - Exports capped at 500 records per XML request
 * - All report views are audited
 */
export class CompanyReportsService {
    private readonly auditService: CompanyAuditService;
    private readonly exportRepo: ExportRepository;
    private readonly exportsDir: string;

    constructor() {
        this.auditService = new CompanyAuditService();
        this.exportRepo = new ExportRepository();
        this.exportsDir = join(process.cwd(), 'exports');
        if (!existsSync(this.exportsDir)) mkdirSync(this.exportsDir, { recursive: true });
    }

    // ─────────────────────────────────────────────────
    // 1. Portfolio Report
    // ─────────────────────────────────────────────────

    async getPortfolioReport(
        companyId: number,
        userId: number,
        query: CompanyReportsQuery
    ): Promise<CompanyPortfolioReportResponse> {
        const qr = AppDataSource.createQueryRunner();
        try {
            const page = query.page ?? 1;
            const pageSize = Math.min(query.pageSize ?? 50, 200);
            const offset = (page - 1) * pageSize;

            const { whereClauses, params } = this.buildLoanWhereClause(companyId, query);

            const dataParams = [...params, pageSize, offset];
            const rows = await qr.query(
                `SELECT
                    l.id,
                    l.totalAmount            AS loanAmount,
                    l.fundedAmount           AS outstandingBalance,
                    ls.code                  AS status,
                    l.createdAt              AS loanCreatedAt,
                    l.closed_at              AS closedAt,
                    u_b.email                AS borrowerEmail,
                    br.trust_level           AS borrowerLevel,
                    lo.lenderId,
                    u_l.email                AS lenderEmail,
                    COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u_l.first_name,''),' ',COALESCE(u_l.last_name,''))),  ''), u_l.email) AS lenderName,
                    (SELECT COUNT(*) FROM repayments r WHERE r.loanId = l.id AND r.paidAt IS NULL AND r.dueDate < NOW()) AS overdueCount,
                    (SELECT COUNT(*) FROM repayments r WHERE r.loanId = l.id AND r.paidAt IS NOT NULL)                   AS paidCount,
                    (SELECT COUNT(*) FROM repayments r WHERE r.loanId = l.id)                                            AS totalRepayments
                 FROM loans l
                 INNER JOIN loan_offers   lo ON lo.loanId   = l.id
                 INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId AND cl.companyId = ?
                 LEFT  JOIN loan_statuses ls ON ls.id        = l.statusId
                 LEFT  JOIN users         u_b ON u_b.id      = l.borrowerId
                 LEFT  JOIN borrower_risks br ON br.userId   = l.borrowerId
                 INNER JOIN users         u_l ON u_l.id      = lo.lenderId
                 ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
                 GROUP BY l.id, lo.lenderId, u_l.email, u_l.first_name, u_l.last_name, u_b.email, br.trust_level, ls.code
                 ORDER BY l.createdAt DESC
                 LIMIT ? OFFSET ?`,
                [companyId, ...dataParams]
            );

            const countRow = await qr.query(
                `SELECT COUNT(DISTINCT l.id) AS total
                 FROM loans l
                 INNER JOIN loan_offers   lo ON lo.loanId   = l.id
                 INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId AND cl.companyId = ?
                 LEFT  JOIN loan_statuses ls ON ls.id = l.statusId
                 LEFT  JOIN users         u_b ON u_b.id = l.borrowerId
                 LEFT  JOIN borrower_risks br ON br.userId = l.borrowerId
                 ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}`,
                [companyId, ...params]
            );
            const total = parseInt(countRow[0]?.total ?? 0);
            const pages = Math.ceil(total / pageSize);

            // Get commission rate for the company
            const commissionRate = await this.getCompanyCommissionRate(qr, companyId);

            const loans: CompanyPortfolioLoanDto[] = rows.map((r: any) => ({
                id: r.id,
                loanAmount: parseFloat(r.loanAmount ?? 0),
                outstandingBalance: parseFloat(r.outstandingBalance ?? 0),
                status: r.status ?? 'UNKNOWN',
                borrowerLevel: r.borrowerLevel ?? undefined,
                lenderId: r.lenderId,
                lenderEmail: r.lenderEmail,
                lenderName: r.lenderName ?? r.lenderEmail,
                commissionAmount: parseFloat(r.loanAmount ?? 0) * commissionRate / 100,
                loanCreatedAt: r.loanCreatedAt,
                closedAt: r.closedAt ?? undefined,
                overdueCount: parseInt(r.overdueCount ?? 0),
                paidCount: parseInt(r.paidCount ?? 0),
                totalRepayments: parseInt(r.totalRepayments ?? 0),
            }));

            const summary = {
                totalLoans: total,
                totalLoanAmount: loans.reduce((s, l) => s + l.loanAmount, 0),
                totalOutstandingBalance: loans.reduce((s, l) => s + l.outstandingBalance, 0),
                totalCommissions: loans.reduce((s, l) => s + l.commissionAmount, 0),
                defaultedLoans: loans.filter(l => l.status === 'DEFAULTED').length,
                activeLoans: loans.filter(l => l.status === 'ACTIVE' || l.status === 'FUNDED').length,
                closedLoans: loans.filter(l => l.status === 'CLOSED').length,
            };

            await this.auditService.logAction(userId, 'VIEW_PORTFOLIO_REPORT', 'COMPANY', companyId, { filters: query });

            return { loans, summary, pagination: { page, pageSize, total, pages }, generatedAt: new Date() };
        } finally {
            await qr.release();
        }
    }

    // ─────────────────────────────────────────────────
    // 2. Commission / Earnings Report
    // ─────────────────────────────────────────────────

    async getCommissionReport(
        companyId: number,
        userId: number,
        query: CompanyReportsQuery
    ): Promise<CompanyCommissionReportResponse> {
        const qr = AppDataSource.createQueryRunner();
        try {
            const commissionRate = await this.getCompanyCommissionRate(qr, companyId);

            const dateFrom = query.dateFrom ?? new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
            const dateTo = query.dateTo ?? new Date().toISOString().split('T')[0];

            let lenderFilter = '';
            const params: any[] = [companyId, dateFrom, dateTo];
            if (query.lenderId) {
                lenderFilter = 'AND cl.lenderId = ?';
                params.push(query.lenderId);
            }

            const finalRows = await qr.query(
                `SELECT
                    cl.lenderId,
                    u.email                  AS lenderEmail,
                    COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),  ''), u.email) AS lenderName,
                    COALESCE(ma.amount, cl.amountLimit, 0)  AS managedAmount,
                    ma.signedAt                              AS agreementSignedAt,
                    COUNT(DISTINCT l.id)                     AS activeLoans,
                    COALESCE(SUM(l.totalAmount), 0)          AS totalLoanAmount
                 FROM company_lenders cl
                 INNER JOIN users u ON u.id = cl.lenderId
                 LEFT JOIN management_agreements ma
                        ON ma.lenderId = cl.lenderId AND ma.companyId = cl.companyId AND ma.signedAt IS NOT NULL
                 LEFT JOIN loan_offers lo ON lo.lenderId = cl.lenderId
                 LEFT JOIN loans l ON l.id = lo.loanId
                           AND l.createdAt BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
                 WHERE cl.companyId = ? ${query.lenderId ? 'AND cl.lenderId = ?' : ''}
                 GROUP BY cl.lenderId, u.email, u.first_name, u.last_name, ma.amount, cl.amountLimit, ma.signedAt`,
                query.lenderId
                    ? [dateFrom, dateTo, companyId, query.lenderId]
                    : [dateFrom, dateTo, companyId]
            );

            const lenders: CompanyCommissionLenderDto[] = finalRows.map((r: any) => {
                const managedAmount = parseFloat(r.managedAmount ?? 0);
                const commissionsEarned = managedAmount * commissionRate / 100;
                return {
                    lenderId: r.lenderId,
                    lenderEmail: r.lenderEmail,
                    lenderName: r.lenderName ?? r.lenderEmail,
                    managedAmount,
                    commissionsEarned,
                    commissionRate,
                    activeLoans: parseInt(r.activeLoans ?? 0),
                    agreementSignedAt: r.agreementSignedAt ?? undefined,
                    periodFrom: new Date(dateFrom),
                    periodTo: new Date(dateTo),
                };
            });

            const summary = {
                totalManagedAmount: lenders.reduce((s, l) => s + l.managedAmount, 0),
                totalCommissionsEarned: lenders.reduce((s, l) => s + l.commissionsEarned, 0),
                commissionRate,
                lenderCount: lenders.length,
            };

            await this.auditService.logAction(userId, 'VIEW_COMMISSION_REPORT', 'COMPANY', companyId, { dateFrom, dateTo });

            return { lenders, summary, generatedAt: new Date() };
        } finally {
            await qr.release();
        }
    }

    // ─────────────────────────────────────────────────
    // 3. Defaulted Loans Report
    // ─────────────────────────────────────────────────

    async getDefaultedReport(companyId: number, userId: number): Promise<CompanyDefaultedReportResponse> {
        const qr = AppDataSource.createQueryRunner();
        try {
            const rows = await qr.query(
                `SELECT
                    l.id,
                    l.totalAmount           AS loanAmount,
                    l.fundedAmount          AS outstandingBalance,
                    u_b.email               AS borrowerEmail,
                    br.trust_level          AS borrowerLevel,
                    lo.lenderId,
                    u_l.email               AS lenderEmail,
                    l.closed_at             AS defaultedAt,
                    cl_entry.claimStatus,
                    (SELECT COUNT(*) FROM repayments r WHERE r.loanId = l.id AND r.paidAt IS NULL AND r.dueDate < NOW()) AS overdueRepayments
                 FROM loans l
                 INNER JOIN loan_offers lo ON lo.loanId = l.id
                 INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId AND cl.companyId = ?
                 LEFT  JOIN users u_b ON u_b.id = l.borrowerId
                 LEFT  JOIN borrower_risks br ON br.userId = l.borrowerId
                 INNER JOIN users u_l ON u_l.id = lo.lenderId
                 LEFT  JOIN (
                     SELECT loanId, MAX(CASE WHEN resolvedAt IS NOT NULL THEN 'resolved'
                                            WHEN submittedAt IS NOT NULL THEN 'submitted'
                                            ELSE 'generated' END) AS claimStatus
                     FROM claims GROUP BY loanId
                 ) cl_entry ON cl_entry.loanId = l.id
                 WHERE l.statusId = 3
                 GROUP BY l.id, lo.lenderId, u_l.email, u_b.email, br.trust_level, cl_entry.claimStatus
                 ORDER BY l.closed_at DESC`,
                [companyId]
            );

            const loans: CompanyDefaultedLoanDto[] = rows.map((r: any) => ({
                id: r.id,
                loanAmount: parseFloat(r.loanAmount ?? 0),
                outstandingBalance: parseFloat(r.outstandingBalance ?? 0),
                borrowerEmail: r.borrowerEmail,
                borrowerLevel: r.borrowerLevel ?? undefined,
                lenderId: r.lenderId,
                lenderEmail: r.lenderEmail,
                defaultedAt: r.defaultedAt ?? undefined,
                claimStatus: r.claimStatus ?? 'none',
                overdueRepayments: parseInt(r.overdueRepayments ?? 0),
            }));

            await this.auditService.logAction(userId, 'VIEW_DEFAULTED_REPORT', 'COMPANY', companyId, {});

            return { loans, total: loans.length, generatedAt: new Date() };
        } finally {
            await qr.release();
        }
    }

    // ─────────────────────────────────────────────────
    // 4. Export CSV
    // ─────────────────────────────────────────────────

    async exportPortfolioCsv(
        companyId: number,
        userId: number,
        request: CompanyReportExportRequest
    ): Promise<BulkActionResponse> {
        const qr = AppDataSource.createQueryRunner();
        try {
            const loans = await this.getLoansForExport(qr, companyId, request);
            if (loans.length === 0) throw new Error('No loans match the selected filters');

            const header = 'LoanId,LoanAmount,OutstandingBalance,Status,BorrowerEmail,BorrowerLevel,LenderEmail,CommissionAmount,CreatedAt\n';
            const commissionRate = await this.getCompanyCommissionRate(qr, companyId);
            const rows = loans
                .map((r: any) =>
                    [
                        r.id,
                        r.loanAmount,
                        r.outstandingBalance,
                        r.status,
                        r.borrowerEmail,
                        r.borrowerLevel ?? '',
                        r.lenderEmail,
                        (parseFloat(r.loanAmount ?? 0) * commissionRate / 100).toFixed(2),
                        r.loanCreatedAt ? new Date(r.loanCreatedAt).toISOString().split('T')[0] : '',
                    ].join(',')
                )
                .join('\n');
            const csv = header + rows;

            const fileName = `export_${Date.now()}_company${companyId}_portfolio.csv`;
            const filePath = join(this.exportsDir, fileName);
            writeFileSync(filePath, csv, 'utf-8');

            const saved = await this.exportRepo.save({
                typeId: 2, // CSV_EXPORT
                createdBy: userId,
                filePath,
                recordCount: loans.length,
                metadata: JSON.stringify({ companyId, filters: request, fileName }),
            } as any);
            const exportId = Number(saved.id);

            await this.auditService.logAction(userId, 'REPORT_CSV_EXPORTED', 'COMPANY', companyId, {
                loanCount: loans.length,
                filters: request,
            });

            return {
                exportId,
                type: 'CSV_REPORT',
                itemCount: loans.length,
                status: 'COMPLETED',
                downloadUrl: `/api/company/documents/${exportId}/download`,
                createdAt: new Date(),
            };
        } finally {
            await qr.release();
        }
    }

    // ─────────────────────────────────────────────────
    // 5. Export XML
    // ─────────────────────────────────────────────────

    async exportPortfolioXml(
        companyId: number,
        userId: number,
        request: CompanyReportExportRequest
    ): Promise<BulkActionResponse> {
        const qr = AppDataSource.createQueryRunner();
        try {
            const loans = await this.getLoansForExport(qr, companyId, request);
            if (loans.length === 0) throw new Error('No loans match the selected filters');
            if (loans.length > 500) throw new Error('XML export is limited to 500 loans per request');

            const commissionRate = await this.getCompanyCommissionRate(qr, companyId);
            const xmlItems = loans
                .map((r: any) => {
                    const commission = (parseFloat(r.loanAmount ?? 0) * commissionRate / 100).toFixed(2);
                    return `  <Loan>
    <LoanId>${this.escapeXml(String(r.id))}</LoanId>
    <LoanAmount>${r.loanAmount ?? 0}</LoanAmount>
    <OutstandingBalance>${r.outstandingBalance ?? 0}</OutstandingBalance>
    <Status>${this.escapeXml(r.status ?? '')}</Status>
    <BorrowerEmail>${this.escapeXml(r.borrowerEmail ?? '')}</BorrowerEmail>
    <BorrowerLevel>${this.escapeXml(r.borrowerLevel ?? '')}</BorrowerLevel>
    <LenderEmail>${this.escapeXml(r.lenderEmail ?? '')}</LenderEmail>
    <CommissionAmount>${commission}</CommissionAmount>
    <CreatedAt>${r.loanCreatedAt ? new Date(r.loanCreatedAt).toISOString() : ''}</CreatedAt>
  </Loan>`;
                })
                .join('\n');
            const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<PortfolioReport generatedAt="${new Date().toISOString()}" companyId="${companyId}">\n${xmlItems}\n</PortfolioReport>`;

            const fileName = `export_${Date.now()}_company${companyId}_portfolio.xml`;
            const filePath = join(this.exportsDir, fileName);
            writeFileSync(filePath, xml, 'utf-8');

            const saved = await this.exportRepo.save({
                typeId: 1, // XML_EXPORT
                createdBy: userId,
                filePath,
                recordCount: loans.length,
                metadata: JSON.stringify({ companyId, filters: request, fileName }),
            } as any);
            const exportId = Number(saved.id);

            await this.auditService.logAction(userId, 'REPORT_XML_EXPORTED', 'COMPANY', companyId, {
                loanCount: loans.length,
                filters: request,
            });

            return {
                exportId,
                type: 'XML_REPORT',
                itemCount: loans.length,
                status: 'COMPLETED',
                downloadUrl: `/api/company/documents/${exportId}/download`,
                createdAt: new Date(),
            };
        } finally {
            await qr.release();
        }
    }

    // ─────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────

    /** Build WHERE clauses for loans filtered by company access + optional query filters */
    private buildLoanWhereClause(
        companyId: number,
        query: CompanyReportsQuery
    ): { whereClauses: string[]; params: any[] } {
        const whereClauses: string[] = [];
        const params: any[] = [];

        if (query.dateFrom) {
            whereClauses.push('l.createdAt >= ?');
            params.push(query.dateFrom);
        }
        if (query.dateTo) {
            whereClauses.push('l.createdAt <= DATE_ADD(?, INTERVAL 1 DAY)');
            params.push(query.dateTo);
        }
        if (query.lenderId) {
            whereClauses.push('cl.lenderId = ?');
            params.push(query.lenderId);
        }
        if (query.loanStatus) {
            whereClauses.push('ls.code = ?');
            params.push(query.loanStatus.toUpperCase());
        }
        if (query.borrowerLevel) {
            whereClauses.push('br.trust_level = ?');
            params.push(query.borrowerLevel.toUpperCase());
        }

        return { whereClauses, params };
    }

    /** Fetch loans for export — shared between CSV and XML export methods */
    private async getLoansForExport(qr: any, companyId: number, request: CompanyReportExportRequest): Promise<any[]> {
        const conditions: string[] = [];
        const params: any[] = [companyId];

        if (request.loanIds && request.loanIds.length > 0) {
            conditions.push(`l.id IN (?)`);
            params.push(request.loanIds);
        }
        if (request.dateFrom) {
            conditions.push('l.createdAt >= ?');
            params.push(request.dateFrom);
        }
        if (request.dateTo) {
            conditions.push('l.createdAt <= DATE_ADD(?, INTERVAL 1 DAY)');
            params.push(request.dateTo);
        }
        if (request.lenderId) {
            conditions.push('cl.lenderId = ?');
            params.push(request.lenderId);
        }
        if (request.loanStatus) {
            conditions.push('ls.code = ?');
            params.push(request.loanStatus.toUpperCase());
        }
        if (request.borrowerLevel) {
            conditions.push('br.trust_level = ?');
            params.push(request.borrowerLevel.toUpperCase());
        }

        const whereStr = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

        return qr.query(
            `SELECT
                l.id,
                l.totalAmount   AS loanAmount,
                l.fundedAmount  AS outstandingBalance,
                ls.code         AS status,
                l.createdAt     AS loanCreatedAt,
                u_b.email       AS borrowerEmail,
                br.trust_level  AS borrowerLevel,
                lo.lenderId,
                u_l.email       AS lenderEmail
             FROM loans l
             INNER JOIN loan_offers    lo ON lo.loanId   = l.id
             INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId AND cl.companyId = ?
             LEFT  JOIN loan_statuses  ls ON ls.id        = l.statusId
             LEFT  JOIN users          u_b ON u_b.id      = l.borrowerId
             LEFT  JOIN borrower_risks br ON br.userId    = l.borrowerId
             INNER JOIN users          u_l ON u_l.id      = lo.lenderId
             ${whereStr}
             GROUP BY l.id, lo.lenderId, u_l.email, u_b.email, br.trust_level, ls.code
             ORDER BY l.createdAt DESC
             LIMIT 500`,
            params
        );
    }

    private async getCompanyCommissionRate(qr: any, companyId: number): Promise<number> {
        try {
            const rows = await qr.query(
                `SELECT commission_pct, conditions_json FROM companies WHERE id = ? LIMIT 1`,
                [companyId]
            );
            if (!rows || rows.length === 0) return 0;
            const json = typeof rows[0].conditions_json === 'string'
                ? JSON.parse(rows[0].conditions_json ?? '{}')
                : (rows[0].conditions_json ?? {});
            return Number(json.managementCommissionRate ?? rows[0].commission_pct ?? 0);
        } catch {
            return 0;
        }
    }

    private escapeXml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
