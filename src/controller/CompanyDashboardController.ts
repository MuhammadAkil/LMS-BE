import { Controller, Get, Post, Put, Delete, UseBefore, Req, Body, Param, QueryParams } from 'routing-controllers';
import { Request } from 'express';
import { AppDataSource } from '../config/database';
import { CompanyDashboardService } from '../service/CompanyDashboardService';
import { CompanyProfileService } from '../service/CompanyProfileService';
import { CompanyAgreementService } from '../service/CompanyAgreementService';
import { CompanyLendersService } from '../service/CompanyLendersService';
import { CompanyAutomationService } from '../service/CompanyAutomationService';
import { CompanyLoansService } from '../service/CompanyLoansService';
import { CompanyBulkService } from '../service/CompanyBulkService';
import { CompanyDocumentsService } from '../service/CompanyDocumentsService';
import { CompanyNotificationsService } from '../service/CompanyNotificationsService';
import {
    CompanyGuard,
    CompanyStatusGuard,
    ConditionsApprovedGuard,
    AgreementSignatureGuard,
    ExportLimitGuard,
    CompanyReadonlyGuard,
    CompanyFullAccessGuard,
    CompanyConditionsApprovedGuard,
} from '../middleware/CompanyGuards';
import {
    CompanyDashboardResponse,
    CompanyProfileResponse,
    UpdateCompanyBankAccountRequest,
    CompanyAgreementResponse,
    SignAgreementRequest,
    AgreementDownloadResponse,
    CompanyLenderResponse,
    LinkLenderRequest,
    UpdateLenderRequest,
    ToggleLenderStatusRequest,
    AutomationRuleResponse,
    CreateAutomationRuleRequest,
    UpdateAutomationRuleRequest,
    ManagedLoanResponse,
    ManagedLoansListResponse,
    ManagedLoanDetailResponse,
    BulkRemindersRequest,
    BulkRemindersResponse,
    BulkCsvExportRequest,
    BulkXmlExportRequest,
    BulkClaimsRequest,
    BulkActionResponse,
    DocumentListResponse,
    DocumentDownloadResponse,
    CompanyNotificationResponse,
    NotificationsListResponse,
    MarkNotificationReadRequest,
    CompanyPaginationQuery,
} from '../dto/CompanyDtos';

/**
 * ================================
 * C-01 COMPANY DASHBOARD CONTROLLER
 * ================================
 * GET /api/company/dashboard
 *
 * Returns KPIs:
 * - managed funds (sum management_agreements.amount)
 * - active managed loans
 * - defaulted loans
 * - automation status
 * - recent bulk actions
 *
 * Audit: VIEW_COMPANY_DASHBOARD
 */
@Controller('/company/dashboard')
@UseBefore(CompanyGuard, CompanyStatusGuard)
export class CompanyDashboardController {
    private readonly dashboardService: CompanyDashboardService;

    constructor() {
        this.dashboardService = new CompanyDashboardService();
    }

    @Get('')
    async getDashboard(@Req() req: Request): Promise<CompanyDashboardResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId) {
            throw new Error('Company ID not found in request');
        }
        return this.dashboardService.getDashboard(companyId, userId);
    }
}

/**
 * ================================
 * C-02 COMPANY PROFILE CONTROLLER
 * ================================
 * GET  /api/company/profile
 * PUT  /api/company/profile/bank
 *
 * Rules:
 * - contractual fields read-only
 * - only bank_account editable
 * - audit: COMPANY_PROFILE_UPDATED
 */
@Controller('/company/profile')
@UseBefore(CompanyGuard, CompanyReadonlyGuard)
export class CompanyProfileController {
    private readonly profileService: CompanyProfileService;

    constructor() {
        this.profileService = new CompanyProfileService();
    }

    @Get('')
    async getProfile(@Req() req: Request): Promise<CompanyProfileResponse> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) {
            throw new Error('Company ID not found in request');
        }
        return this.profileService.getProfile(companyId);
    }

    @Put('/bank')
    @UseBefore(CompanyStatusGuard) // Require APPROVED status for writes
    async updateBankAccount(
        @Req() req: Request,
        @Body() request: UpdateCompanyBankAccountRequest
    ): Promise<CompanyProfileResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) {
            throw new Error('Company ID or User ID not found in request');
        }
        return this.profileService.updateBankAccount(companyId, userId, request.bankAccount);
    }
}

/**
 * ================================
 * C-03 MANAGEMENT AGREEMENT CONTROLLER
 * ================================
 * GET  /api/company/agreement
 * POST /api/company/agreement/sign
 * GET  /api/company/agreement/download
 *
 * Rules:
 * - creates management_agreements record
 * - signed_at timestamp stored
 * - generates PDF contract record in contracts table
 * - audit: AGREEMENT_SIGNED
 * - triggers notification
 */
@Controller('/company/agreement')
@UseBefore(CompanyGuard, CompanyReadonlyGuard)
export class CompanyAgreementController {
    private readonly agreementService: CompanyAgreementService;

    constructor() {
        this.agreementService = new CompanyAgreementService();
    }

    @Get('')
    async getAgreement(@Req() req: Request): Promise<CompanyAgreementResponse | null> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) {
            throw new Error('Company ID not found in request');
        }
        return this.agreementService.getAgreement(companyId);
    }

    @Post('/sign')
    @UseBefore(CompanyStatusGuard)
    async signAgreement(
        @Req() req: Request,
        @Body() request: SignAgreementRequest
    ): Promise<CompanyAgreementResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) {
            throw new Error('Company ID or User ID not found in request');
        }
        return this.agreementService.signAgreement(companyId, userId, request);
    }

    @Get('/download')
    @UseBefore(CompanyStatusGuard)
    async downloadAgreement(@Req() req: Request): Promise<AgreementDownloadResponse> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) {
            throw new Error('Company ID not found in request');
        }
        return this.agreementService.downloadAgreement(companyId);
    }
}

/**
 * ================================
 * C-04 LINKED LENDERS CONTROLLER
 * ================================
 * GET    /api/company/lenders
 * POST   /api/company/lenders
 * PUT    /api/company/lenders/:id
 * PUT    /api/company/lenders/:id/toggle
 * DELETE /api/company/lenders/:id
 */
@Controller('/company/lenders')
@UseBefore(CompanyGuard, CompanyStatusGuard)
export class CompanyLendersController {
    private readonly lendersService: CompanyLendersService;

    constructor() {
        this.lendersService = new CompanyLendersService();
    }

    @Get('')
    async getLenders(@Req() req: Request): Promise<CompanyLenderResponse[]> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) throw new Error('Company ID not found in request');
        return this.lendersService.getLenders(companyId);
    }

    @Post('')
    @UseBefore(ConditionsApprovedGuard)
    async linkLender(
        @Req() req: Request,
        @Body() request: LinkLenderRequest
    ): Promise<CompanyLenderResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found in request');
        return this.lendersService.linkLender(companyId, userId, request);
    }

    @Put('/:id')
    @UseBefore(ConditionsApprovedGuard, AgreementSignatureGuard)
    async updateLender(
        @Req() req: Request,
        @Param('id') linkId: number,
        @Body() request: UpdateLenderRequest
    ): Promise<CompanyLenderResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found in request');
        return this.lendersService.updateLender(companyId, userId, linkId, request);
    }

    @Put('/:id/toggle')
    @UseBefore(ConditionsApprovedGuard, AgreementSignatureGuard)
    async toggleLenderStatus(
        @Req() req: Request,
        @Param('id') linkId: number,
        @Body() request: ToggleLenderStatusRequest
    ): Promise<CompanyLenderResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found in request');
        return this.lendersService.toggleLenderStatus(companyId, userId, linkId, request.active);
    }

    @Delete('/:id')
    @UseBefore(ConditionsApprovedGuard)
    async terminateLender(
        @Req() req: Request,
        @Param('id') linkId: number
    ): Promise<{ success: boolean }> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found in request');
        await this.lendersService.terminateLender(companyId, userId, linkId);
        return { success: true };
    }
}

/**
 * ================================
 * C-05 AUTOMATION RULES CONTROLLER
 * ================================
 * GET    /api/company/automation
 * POST   /api/company/automation
 * PUT    /api/company/automation/:id
 * DELETE /api/company/automation/:id
 *
 * Rules:
 * - stored in auto_invest_rules
 * - must respect platform level_rules
 * - priority execution supported
 * - audit: AUTOMATION_RULE_UPDATED
 */
@Controller('/company/automation')
@UseBefore(CompanyGuard, CompanyStatusGuard)
export class CompanyAutomationController {
    private readonly automationService: CompanyAutomationService;

    constructor() {
        this.automationService = new CompanyAutomationService();
    }

    @Get('')
    async getAutomationRules(@Req() req: Request): Promise<AutomationRuleResponse[]> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) {
            throw new Error('Company ID not found in request');
        }
        return this.automationService.getAutomationRules(companyId);
    }

    @Post('')
    @UseBefore(ConditionsApprovedGuard, AgreementSignatureGuard)
    async createAutomationRule(
        @Req() req: Request,
        @Body() request: CreateAutomationRuleRequest
    ): Promise<AutomationRuleResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) {
            throw new Error('Company ID or User ID not found in request');
        }
        return this.automationService.createAutomationRule(companyId, userId, request);
    }

    @Put('/:id')
    @UseBefore(ConditionsApprovedGuard, AgreementSignatureGuard)
    async updateAutomationRule(
        @Req() req: Request,
        @Param('id') ruleId: number,
        @Body() request: UpdateAutomationRuleRequest
    ): Promise<AutomationRuleResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) {
            throw new Error('Company ID or User ID not found in request');
        }
        return this.automationService.updateAutomationRule(companyId, userId, ruleId, request);
    }

    @Delete('/:id')
    @UseBefore(ConditionsApprovedGuard, AgreementSignatureGuard)
    async deleteAutomationRule(
        @Req() req: Request,
        @Param('id') ruleId: number
    ): Promise<void> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) {
            throw new Error('Company ID or User ID not found in request');
        }
        return this.automationService.deleteAutomationRule(companyId, userId, ruleId);
    }
}

/**
 * ================================
 * C-06 MANAGED LOANS CONTROLLER
 * ================================
 * GET /api/company/loans
 * GET /api/company/loans/:id
 *
 * Rules:
 * - join loans, borrowers, repayments
 * - borrower PII masked
 * - read-only
 */
@Controller('/company/loans')
@UseBefore(CompanyGuard, CompanyReadonlyGuard)
export class CompanyLoansController {
    private readonly loansService: CompanyLoansService;

    constructor() {
        this.loansService = new CompanyLoansService();
    }

    @Get('')
    async getManagedLoans(
        @Req() req: Request,
        @QueryParams() query: CompanyPaginationQuery
    ): Promise<ManagedLoansListResponse> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) {
            throw new Error('Company ID not found in request');
        }
        return this.loansService.getManagedLoans(companyId, query);
    }

    @Get('/:id')
    async getManagedLoanDetail(
        @Req() req: Request,
        @Param('id') loanId: number
    ): Promise<ManagedLoanDetailResponse> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) {
            throw new Error('Company ID not found in request');
        }
        return this.loansService.getManagedLoanDetail(companyId, loanId);
    }
}

/**
 * ================================
 * C-07 BULK ACTIONS CONTROLLER
 * ================================
 * POST /api/company/bulk/reminders
 * POST /api/company/bulk/csv
 * POST /api/company/bulk/xml
 * POST /api/company/bulk/claims
 *
 * Rules:
 * - reminders inserted into reminders table
 * - exports inserted into exports table
 * - XML limited to 500 loans
 * - claims only for DEFAULTED loans
 * - audit: BULK_ACTION_EXECUTED
 */
@Controller('/company/bulk')
@UseBefore(CompanyGuard, CompanyStatusGuard, ConditionsApprovedGuard, AgreementSignatureGuard)
export class CompanyBulkController {
    private readonly bulkService: CompanyBulkService;

    constructor() {
        this.bulkService = new CompanyBulkService();
    }

    @Post('/reminders')
    async createBulkReminders(
        @Req() req: Request,
        @Body() request: BulkRemindersRequest
    ): Promise<BulkRemindersResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) {
            throw new Error('Company ID or User ID not found in request');
        }
        return this.bulkService.createBulkReminders(companyId, userId, request);
    }

    @Post('/csv')
    @UseBefore(ExportLimitGuard)
    async exportCsv(
        @Req() req: Request,
        @Body() request: BulkCsvExportRequest
    ): Promise<BulkActionResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) {
            throw new Error('Company ID or User ID not found in request');
        }
        return this.bulkService.exportCsv(companyId, userId, request);
    }

    @Post('/xml')
    @UseBefore(ExportLimitGuard)
    async exportXml(
        @Req() req: Request,
        @Body() request: BulkXmlExportRequest
    ): Promise<BulkActionResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) {
            throw new Error('Company ID or User ID not found in request');
        }
        return this.bulkService.exportXml(companyId, userId, request);
    }

    @Post('/claims')
    async createBulkClaims(
        @Req() req: Request,
        @Body() request: BulkClaimsRequest
    ): Promise<BulkActionResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) {
            throw new Error('Company ID or User ID not found in request');
        }
        return this.bulkService.createBulkClaims(companyId, userId, request);
    }
}

/**
 * ================================
 * C-08 DOCUMENT CENTER CONTROLLER
 * ================================
 * GET /api/company/documents
 * GET /api/company/documents/:id/download
 *
 * Sources:
 * - contracts
 * - exports
 * - claims
 * - reminders logs
 */
@Controller('/company/documents')
@UseBefore(CompanyGuard, CompanyStatusGuard)
export class CompanyDocumentsController {
    private readonly documentsService: CompanyDocumentsService;

    constructor() {
        this.documentsService = new CompanyDocumentsService();
    }

    @Get('')
    async listDocuments(
        @Req() req: Request,
        @QueryParams() query: CompanyPaginationQuery
    ): Promise<DocumentListResponse> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) {
            throw new Error('Company ID not found in request');
        }
        return this.documentsService.listDocuments(companyId, query);
    }

    @Get('/:id/download')
    async downloadDocument(
        @Req() req: Request,
        @Param('id') documentId: number
    ): Promise<DocumentDownloadResponse> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) {
            throw new Error('Company ID not found in request');
        }
        return this.documentsService.downloadDocument(companyId, documentId);
    }
}

/**
 * ================================
 * C-09 NOTIFICATIONS CONTROLLER
 * ================================
 * GET /api/company/notifications
 * PUT /api/company/notifications/:id/read
 *
 * Rules:
 * - only company-owned notifications
 * - audit: NOTIFICATION_READ
 */
@Controller('/company/notifications')
@UseBefore(CompanyGuard, CompanyReadonlyGuard)
export class CompanyNotificationsController {
    private readonly notificationsService: CompanyNotificationsService;

    constructor() {
        this.notificationsService = new CompanyNotificationsService();
    }

    @Get('')
    async getNotifications(
        @Req() req: Request,
        @QueryParams() query: CompanyPaginationQuery
    ): Promise<NotificationsListResponse> {
        const userId = (req.user as any)?.id;
        if (!userId) {
            throw new Error('User ID not found in request');
        }
        return this.notificationsService.getNotifications(userId, query);
    }

    @Put('/:id/read')
    @UseBefore(CompanyStatusGuard)
    async markNotificationAsRead(
        @Req() req: Request,
        @Param('id') notificationId: number
    ): Promise<CompanyNotificationResponse> {
        const userId = (req.user as any)?.id;
        if (!userId) {
            throw new Error('User ID not found in request');
        }
        return this.notificationsService.markAsRead(userId, notificationId);
    }
}

/**
 * ================================
 * C-10 MARKETPLACE AUTOMATION CONTROLLER
 * ================================
 * GET /api/company/marketplace/config
 * PUT /api/company/marketplace/config
 * GET /api/company/marketplace/activity
 *
 * Rules:
 * - config stored in companies.auto_bid_config (JSON)
 * - activity = recent loan_offers for this company's lenders
 */
@Controller('/company/marketplace')
@UseBefore(CompanyGuard, CompanyReadonlyGuard)
export class CompanyMarketplaceController {

    @Get('/config')
    async getAutoBidConfig(@Req() req: Request): Promise<any> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) throw new Error('Company ID not found in request');

        const rows = await AppDataSource.query(
            `SELECT auto_bid_config FROM companies WHERE id = ? LIMIT 1`,
            [companyId]
        );
        const raw = rows?.[0]?.auto_bid_config;
        const config = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
        return {
            enabled: config.enabled ?? false,
            capitalPool: config.capitalPool ?? 0,
            maxBidPerLoan: config.maxBidPerLoan ?? 0,
            maxExposurePerBorrower: config.maxExposurePerBorrower ?? 0,
            minimumBorrowerLevel: config.minimumBorrowerLevel ?? 1,
            durationRange: {
                min: config.durationMin ?? 1,
                max: config.durationMax ?? 6,
            },
            priorityRules: {
                timeBasedBidding: config.timeBasedBidding ?? false,
            },
        };
    }

    @Put('/config')
    @UseBefore(CompanyStatusGuard)
    async saveAutoBidConfig(@Req() req: Request, @Body() body: any): Promise<any> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) throw new Error('Company ID not found in request');

        const config = {
            enabled: body.enabled ?? false,
            capitalPool: body.capitalPool ?? 0,
            maxBidPerLoan: body.maxBidPerLoan ?? 0,
            maxExposurePerBorrower: body.maxExposurePerBorrower ?? 0,
            minimumBorrowerLevel: body.minimumBorrowerLevel ?? 1,
            durationMin: body.durationMin ?? 1,
            durationMax: body.durationMax ?? 6,
            timeBasedBidding: body.timeBasedBidding ?? false,
        };
        await AppDataSource.query(
            `UPDATE companies SET auto_bid_config = ? WHERE id = ?`,
            [JSON.stringify(config), companyId]
        );
        return {
            enabled: config.enabled,
            capitalPool: config.capitalPool,
            maxBidPerLoan: config.maxBidPerLoan,
            maxExposurePerBorrower: config.maxExposurePerBorrower,
            minimumBorrowerLevel: config.minimumBorrowerLevel,
            durationRange: { min: config.durationMin, max: config.durationMax },
            priorityRules: { timeBasedBidding: config.timeBasedBidding },
        };
    }

    @Get('/activity')
    async getMarketplaceActivity(@Req() req: Request): Promise<any[]> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) throw new Error('Company ID not found in request');

        const q = req.query as Record<string, string>;
        const limit = Math.min(Number(q['limit'] ?? 50), 200);
        const offset = Number(q['offset'] ?? 0);
        const status = q['status'];
        const statusFilter = status ? `AND us.code = ?` : '';
        const params: any[] = [companyId];
        if (status) params.push(status);
        params.push(limit, offset);

        const rows = await AppDataSource.query(
            `SELECT
                lo.id,
                lo.loanId,
                lo.lenderId,
                lo.amount,
                lo.confirmed_amount as confirmedAmount,
                lo.createdAt,
                l.statusId,
                us.code as statusCode,
                u.email as lenderEmail,
                COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), u.email) as lenderName
             FROM loan_offers lo
             INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId AND cl.companyId = ?
             LEFT JOIN loans l ON l.id = lo.loanId
             LEFT JOIN user_statuses us ON us.id = l.statusId
             LEFT JOIN users u ON u.id = lo.lenderId
             ${statusFilter}
             ORDER BY lo.createdAt DESC
             LIMIT ? OFFSET ?`,
            params
        );
        return rows ?? [];
    }
}
