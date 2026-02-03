import { AdminAuditService } from './AdminAuditService';
import { CompanyRepository } from '../repository/CompanyRepository';
import { UserRepository } from '../repository/UserRepository';
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

  constructor() {
    this.companyRepo = new CompanyRepository();
    this.userRepo = new UserRepository();
    this.auditService = new AdminAuditService();
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

    // Update status to APPROVED (2)
    company.statusId = 2;
    company.approvedAt = new Date();
    await this.companyRepo.save(company);

    // Log the action
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

    // Log the action
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
