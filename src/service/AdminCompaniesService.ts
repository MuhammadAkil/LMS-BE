import { AdminAuditService } from './AdminAuditService';
import { CompanyRepository } from '../repository/CompanyRepository';
import { UserRepository } from '../repository/UserRepository';
import { LmsNotificationService } from './LmsNotificationService';
import { CompanyDashboardService } from './CompanyDashboardService';
import { CompanyListItemDto, CompanyDetailDto, ApproveCompanyRequest, RejectCompanyRequest, UpdateCompanyConditionsRequest } from '../dto/AdminDtos';

/**
 * Admin Companies Service
 * Manages company approvals, rejections, and conditions updates
 * All write operations log audit + notify relevant parties
 */
export class AdminCompaniesService {
  private readonly companyRepo: CompanyRepository;
  private readonly userRepo: UserRepository;
  private readonly auditService: AdminAuditService;
  private readonly notificationService: LmsNotificationService;
  private readonly dashboardService: CompanyDashboardService;

  constructor() {
    this.companyRepo = new CompanyRepository();
    this.userRepo = new UserRepository();
    this.auditService = new AdminAuditService();
    this.notificationService = new LmsNotificationService();
    this.dashboardService = new CompanyDashboardService();
  }

  /**
   * Get all companies with pagination
   */
  async getAllCompanies(limit: number = 20, offset: number = 0): Promise<CompanyListItemDto[]> {
    const [companies] = await this.companyRepo.findAll(limit, offset);
    return companies.map(company => ({
      id: company.id,
      name: company.name,
      statusId: company.statusId,
      statusName: this.getStatusName(company.statusId),
      bankAccount: company.bankAccount,
      createdAt: new Date(),  // Schema doesn't have created_at
    }));
  }

  /**
   * Get all pending companies (status_id = 1)
   */
  async getPendingCompanies(limit: number = 20, offset: number = 0): Promise<CompanyListItemDto[]> {
    const [companies] = await this.companyRepo.findPending(limit, offset);
    return companies.map(company => ({
      id: company.id,
      name: company.name,
      statusId: company.statusId,
      statusName: this.getStatusName(company.statusId),
      bankAccount: company.bankAccount,
      createdAt: new Date(),
    }));
  }

  /**
   * Get company details by ID
   */
  async getCompanyById(companyId: number): Promise<CompanyDetailDto> {
    const company = await this.companyRepo.findById(companyId);
    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    const conditions = (typeof company.conditionsJson === 'string' ? JSON.parse(company.conditionsJson || '{}') : company.conditionsJson) || {};
    const commissionPct = Number(company.commissionPct ?? 0);
    const minManagedAmount = Number(company.minManagedAmount ?? 0);

    let managedFunds = 0;
    let activeLoans = 0;
    let totalLoans = 0;
    let defaultRate = 0;
    try {
      const dashboard = await this.dashboardService.getDashboard(companyId);
      managedFunds = dashboard.managedFunds ?? 0;
      activeLoans = dashboard.activeManagedLoans ?? 0;
      const defaultedLoans = dashboard.defaultedLoans ?? 0;
      totalLoans = activeLoans + defaultedLoans;
      defaultRate = dashboard.defaultRate ?? 0;
    } catch {
    }

    const performanceScore = totalLoans > 0 ? Math.round(Math.max(0, Math.min(100, 100 - defaultRate))) : undefined;

    return {
      id: company.id,
      name: company.name,
      statusId: company.statusId,
      statusName: this.getStatusName(company.statusId),
      bankAccount: company.bankAccount,
      conditions,
      approvedAt: company.approvedAt,
      commissionPct,
      minManagedAmount,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      registeredDate: company.createdAt,
      performanceKpis: {
        performanceScore: performanceScore ?? 0,
        activeLoans,
        totalLoans,
        defaultRate,
      },
      financialMetrics: {
        managedFunds,
        minManagedAmount,
        commission: commissionPct,
      },
      managedFunds,
      commission: commissionPct,
      performanceScore,
      activeLoans,
      totalLoans,
      defaultRate,
    };
  }

  /**
   * Approve a company (status_id = 2)
   * Logs COMPANY_APPROVED action
   * Notifies company about approval
   */
  async approveCompany(
    companyId: number,
    request: ApproveCompanyRequest,
    adminId: number
  ): Promise<CompanyDetailDto> {
    const company = await this.companyRepo.findById(companyId);
    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    // Only approve if pending
    if (company.statusId !== 1) {
      throw new Error(`Company status is ${this.getStatusName(company.statusId)}, cannot approve`);
    }

    // Update status to APPROVED (2) and lock conditions (per spec)
    company.statusId = 2;
    company.approvedAt = new Date();
    company.conditionsLockedAt = new Date();
    company.conditionsStatus = 'approved';
    await this.companyRepo.save(company);

    await this.auditService.logAction(
      adminId,
      'COMPANY_APPROVED',
      'COMPANY',
      companyId,
      {
        companyName: company.name,
        comment: request.comment || 'No comment provided',
      }
    );

    const [adminUsers] = await this.userRepo.findByRole(1, 20, 0);
    const adminIds = adminUsers.map((u) => u.id);
    if (adminIds.length > 0) {
      await this.notificationService.notifyMultiple(
        adminIds,
        'COMPANY_APPROVED',
        'Company approved',
        `Company "${company.name}" has been approved.`,
        { companyId, companyName: company.name }
      );
    }

    return {
      id: company.id,
      name: company.name,
      statusId: company.statusId,
      statusName: this.getStatusName(company.statusId),
      bankAccount: company.bankAccount,
      conditions: (typeof company.conditionsJson === 'string' ? JSON.parse(company.conditionsJson || '{}') : company.conditionsJson) || {},
      approvedAt: company.approvedAt,
    };
  }

  /**
   * Reject a company (status_id = 3)
   * REQUIRES rejection reason/comment
   * Logs COMPANY_REJECTED action
   */
  async rejectCompany(
    companyId: number,
    request: RejectCompanyRequest,
    adminId: number
  ): Promise<CompanyDetailDto> {
    const company = await this.companyRepo.findById(companyId);
    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    // Validate rejection reason is provided
    if (!request.comment || request.comment.trim().length === 0) {
      throw new Error('Rejection comment is required');
    }

    // Only reject if pending
    if (company.statusId !== 1) {
      throw new Error(`Company status is ${this.getStatusName(company.statusId)}, cannot reject`);
    }

    // Update status to REJECTED (3)
    company.statusId = 3;
    await this.companyRepo.save(company);

    await this.auditService.logAction(
      adminId,
      'COMPANY_REJECTED',
      'COMPANY',
      companyId,
      {
        companyName: company.name,
        rejectionReason: request.comment,
      }
    );

    const [adminUsers] = await this.userRepo.findByRole(1, 20, 0);
    const adminIds = adminUsers.map((u) => u.id);
    if (adminIds.length > 0) {
      await this.notificationService.notifyMultiple(
        adminIds,
        'COMPANY_REJECTED',
        'Company rejected',
        `Company "${company.name}" has been rejected. Reason: ${request.comment}`,
        { companyId, companyName: company.name, reason: request.comment }
      );
    }

    return {
      id: company.id,
      name: company.name,
      statusId: company.statusId,
      statusName: this.getStatusName(company.statusId),
      bankAccount: company.bankAccount,
      conditions: (typeof company.conditionsJson === 'string' ? JSON.parse(company.conditionsJson || '{}') : company.conditionsJson) || {},
      approvedAt: company.approvedAt,
    };
  }

  /**
   * Update company conditions
   * Updates commission percentage, minimum managed amount, or metadata
   * Logs COMPANY_CONDITIONS_UPDATED action
   */
  async updateCompanyConditions(
    companyId: number,
    request: UpdateCompanyConditionsRequest,
    adminId: number
  ): Promise<CompanyDetailDto> {
    const company = await this.companyRepo.findById(companyId);
    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    // Only update conditions for approved companies
    if (company.statusId !== 2) {
      throw new Error(`Cannot update conditions for ${this.getStatusName(company.statusId)} company`);
    }

    // Track changes for audit
    const changes: any = {};

    if (request.commissionPct !== undefined && request.commissionPct !== company.commissionPct) {
      changes.commissionPct = {
        from: company.commissionPct,
        to: request.commissionPct,
      };
      company.commissionPct = request.commissionPct;
    }

    if (request.minManagedAmount !== undefined && request.minManagedAmount !== company.minManagedAmount) {
      changes.minManagedAmount = {
        from: company.minManagedAmount,
        to: request.minManagedAmount,
      };
      company.minManagedAmount = request.minManagedAmount;
    }

    if (request.metadata && Object.keys(request.metadata).length > 0) {
      changes.metadata = {
        from: (typeof company.metadata === 'string' ? JSON.parse(company.metadata || '{}') : company.metadata) || {},
        to: request.metadata,
      };
      company.metadata = JSON.stringify(request.metadata);
    }

    company.updatedAt = new Date();
    await this.companyRepo.save(company);

    // Log the action
    await this.auditService.logAction(
      adminId,
      'COMPANY_CONDITIONS_UPDATED',
      'COMPANY',
      companyId,
      {
        companyName: company.name,
        changes,
      }
    );

    return {
      id: company.id,
      name: company.name,
      statusId: company.statusId,
      statusName: this.getStatusName(company.statusId),
      commissionPct: company.commissionPct,
      minManagedAmount: company.minManagedAmount,
      metadata: (typeof company.metadata === 'string' ? JSON.parse(company.metadata || '{}') : company.metadata) || {},
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }

  /**
   * Get companies by status
   */
  async getCompaniesByStatus(statusId: number, limit: number = 20, offset: number = 0): Promise<CompanyListItemDto[]> {
    const [companies] = await this.companyRepo.findByStatus(statusId, limit, offset);
    return companies.map(company => ({
      id: company.id,
      name: company.name,
      statusId: company.statusId,
      statusName: this.getStatusName(company.statusId),
      commissionPct: company.commissionPct,
      minManagedAmount: company.minManagedAmount,
      createdAt: company.createdAt,
    }));
  }

  /**
   * Get active companies
   */
  async getActiveCompanies(limit: number = 20, offset: number = 0): Promise<CompanyListItemDto[]> {
    const [companies] = await this.companyRepo.findActive(limit, offset);
    return companies.map(company => ({
      id: company.id,
      name: company.name,
      statusId: company.statusId,
      statusName: this.getStatusName(company.statusId),
      commissionPct: company.commissionPct,
      minManagedAmount: company.minManagedAmount,
      createdAt: company.createdAt,
    }));
  }

  async getCountByStatus(statusId: number): Promise<number> {
    const [, count] = await this.companyRepo.findByStatus(statusId, 1, 0);
    return count;
  }

  /** Create company (status PENDING). */
  async createCompany(
    body: { name: string; bankAccount?: string; conditions?: Record<string, unknown> },
    adminId: number
  ): Promise<CompanyDetailDto> {
    const { Company } = await import('../domain/Company');
    if (await this.companyRepo.existsByName(body.name)) {
      throw new Error('Company with this name already exists');
    }
    const company = new Company();
    company.name = body.name;
    company.bankAccount = body.bankAccount ?? undefined;
    company.statusId = 1; // PENDING
    company.commissionPct = 0;
    company.minManagedAmount = 0;
    if (body.conditions && Object.keys(body.conditions).length > 0) {
      company.conditionsJson = body.conditions;
    }
    const saved = await this.companyRepo.save(company);
    await this.auditService.logAction(adminId, 'COMPANY_CREATED', 'COMPANY', saved.id, { companyName: saved.name });
    return this.getCompanyById(saved.id);
  }

  /** Suspend company (statusId 4). */
  async suspendCompany(companyId: number, adminId: number): Promise<CompanyDetailDto> {
    const company = await this.companyRepo.findById(companyId);
    if (!company) throw new Error(`Company ${companyId} not found`);
    company.statusId = 4; // SUSPENDED
    await this.companyRepo.save(company);
    await this.auditService.logAction(adminId, 'COMPANY_SUSPENDED', 'COMPANY', companyId, { companyName: company.name });
    return this.getCompanyById(companyId);
  }

  /** Link lenders to company (bulk). */
  async linkLenders(companyId: number, lenderIds: number[], adminId: number): Promise<{ linked: number }> {
    const { CompanyLendersService } = await import('./CompanyLendersService');
    const lendersService = new CompanyLendersService();
    let linked = 0;
    for (const lenderId of lenderIds) {
      try {
        await lendersService.linkLender(companyId, adminId, { lenderId, amountLimit: 0, active: true });
        linked++;
      } catch {
        // skip duplicate or invalid
      }
    }
    if (linked > 0) {
      await this.auditService.logAction(adminId, 'COMPANY_LENDERS_LINKED', 'COMPANY', companyId, { lenderIds, linked });
    }
    return { linked };
  }

  /**
   * Helper: Map status ID to status name
   */
  private getStatusName(statusId: number): string {
    const statusMap: { [key: number]: string } = {
      1: 'PENDING',
      2: 'APPROVED',
      3: 'REJECTED',
      4: 'SUSPENDED',
    };
    return statusMap[statusId] || 'UNKNOWN';
  }
}
