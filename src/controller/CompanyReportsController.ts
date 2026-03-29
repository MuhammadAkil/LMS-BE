import { Controller, Get, Post, UseBefore, Req, Body, QueryParams } from 'routing-controllers';
import { Request } from 'express';
import { CompanyReportsService } from '../service/CompanyReportsService';
import { CompanyGuard, CompanyStatusGuard, ConditionsApprovedGuard } from '../middleware/CompanyGuards';
import {
    CompanyReportsQuery,
    CompanyPortfolioReportResponse,
    CompanyCommissionReportResponse,
    CompanyDefaultedReportResponse,
    CompanyReportExportRequest,
    BulkActionResponse,
} from '../dto/CompanyDtos';

/**
 * Company Reports Controller
 * Flow 12 — Reports & Exports (scoped to company; no data leakage)
 *
 * GET  /api/company/reports/portfolio      — portfolio report (paginated, filterable)
 * GET  /api/company/reports/commissions    — commission/earnings breakdown per lender
 * GET  /api/company/reports/defaulted      — defaulted loans report
 * POST /api/company/reports/export/csv     — export portfolio as CSV (max 500)
 * POST /api/company/reports/export/xml     — export portfolio as XML (max 500)
 */
@Controller('/company/reports')
@UseBefore(CompanyGuard, CompanyStatusGuard, ConditionsApprovedGuard)
export class CompanyReportsController {
    private readonly reportsService: CompanyReportsService;

    constructor() {
        this.reportsService = new CompanyReportsService();
    }

    /**
     * GET /api/company/reports/portfolio
     * Returns paginated list of all managed loans for this company with summary stats.
     * Filterable by: dateFrom, dateTo, lenderId, loanStatus, borrowerLevel
     */
    @Get('/portfolio')
    async getPortfolioReport(
        @Req() req: Request,
        @QueryParams() query: CompanyReportsQuery
    ): Promise<CompanyPortfolioReportResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId) throw new Error('Company ID not found in request');
        return this.reportsService.getPortfolioReport(companyId, userId, query);
    }

    /**
     * GET /api/company/reports/commissions
     * Commission breakdown per lender for the configured period.
     * Reflects the management commission % set in company conditions.
     */
    @Get('/commissions')
    async getCommissionReport(
        @Req() req: Request,
        @QueryParams() query: CompanyReportsQuery
    ): Promise<CompanyCommissionReportResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId) throw new Error('Company ID not found in request');
        return this.reportsService.getCommissionReport(companyId, userId, query);
    }

    /**
     * GET /api/company/reports/defaulted
     * All defaulted loans for this company's lenders.
     * Includes claim status (generated | submitted | resolved | none).
     */
    @Get('/defaulted')
    async getDefaultedReport(@Req() req: Request): Promise<CompanyDefaultedReportResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId) throw new Error('Company ID not found in request');
        return this.reportsService.getDefaultedReport(companyId, userId);
    }

    /**
     * POST /api/company/reports/export/csv
     * Export portfolio report as downloadable CSV.
     * Filters: dateFrom, dateTo, lenderId, loanStatus, borrowerLevel, loanIds[]
     * Max 500 loans per export (enforced in service).
     */
    @Post('/export/csv')
    async exportCsv(
        @Req() req: Request,
        @Body() body: CompanyReportExportRequest
    ): Promise<BulkActionResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found in request');
        return this.reportsService.exportPortfolioCsv(companyId, userId, body);
    }

    /**
     * POST /api/company/reports/export/xml
     * Export portfolio report as XML.
     * Hard limit: 500 loans. Returns 400 if selection exceeds limit.
     */
    @Post('/export/xml')
    async exportXml(
        @Req() req: Request,
        @Body() body: CompanyReportExportRequest
    ): Promise<BulkActionResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found in request');
        return this.reportsService.exportPortfolioXml(companyId, userId, body);
    }
}
