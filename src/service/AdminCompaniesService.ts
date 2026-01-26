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
  private companyRepo: CompanyRepository;
  private userRepo: UserRepository;
  private auditService: AdminAuditService;

  constructor() {
    this.companyRepo = new CompanyRepository();
    this.userRepo = new UserRepository();
    this.auditService = new AdminAuditService();
  }

  /**
   * Get all companies with pagination
   */
  async getAllCompanies(limit: number = 20, offset: number = 0): Promise<CompanyListItemDto[]> {
    const companies = await this.companyRepo.findAll(limit, offset);
    return companies.map(company => ({
      id: company.id,
      name: company.name,
      status: this.getStatusName(company.status_id),
      statusId: company.status_id,
      commissionPct: company.commission_pct,
      minManagedAmount: company.min_managed_amount,
      createdAt: company.created_at,
    }));
  }

  /**
   * Get all pending companies (status_id = 1)
   */
  async getPendingCompanies(limit: number = 20, offset: number = 0): Promise<CompanyListItemDto[]> {
    const companies = await this.companyRepo.findPending(limit, offset);
    return companies.map(company => ({
      id: company.id,
      name: company.name,
      status: this.getStatusName(company.status_id),
      statusId: company.status_id,
      commissionPct: company.commission_pct,
      minManagedAmount: company.min_managed_amount,
      createdAt: company.created_at,
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
      status: this.getStatusName(company.status_id),
      statusId: company.status_id,
      commissionPct: company.commission_pct,
      minManagedAmount: company.min_managed_amount,
      metadata: company.metadata || {},
      createdAt: company.created_at,
      updatedAt: company.updated_at,
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
    if (company.status_id !== 1) {
      throw new Error(`Company status is ${this.getStatusName(company.status_id)}, cannot approve`);
    }

    // Update status to APPROVED (2)
    company.status_id = 2;
    company.updated_at = new Date();
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
      status: this.getStatusName(company.status_id),
      statusId: company.status_id,
      commissionPct: company.commission_pct,
      minManagedAmount: company.min_managed_amount,
      metadata: company.metadata || {},
      createdAt: company.created_at,
      updatedAt: company.updated_at,
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
    if (company.status_id !== 1) {
      throw new Error(`Company status is ${this.getStatusName(company.status_id)}, cannot reject`);
    }

    // Update status to REJECTED (3)
    company.status_id = 3;
    company.updated_at = new Date();
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
      status: this.getStatusName(company.status_id),
      statusId: company.status_id,
      commissionPct: company.commission_pct,
      minManagedAmount: company.min_managed_amount,
      metadata: company.metadata || {},
      createdAt: company.created_at,
      updatedAt: company.updated_at,
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
    if (company.status_id !== 2) {
      throw new Error(`Cannot update conditions for ${this.getStatusName(company.status_id)} company`);
    }

    // Track changes for audit
    const changes: any = {};

    if (request.commissionPct !== undefined && request.commissionPct !== company.commission_pct) {
      changes.commissionPct = {
        from: company.commission_pct,
        to: request.commissionPct,
      };
      company.commission_pct = request.commissionPct;
    }

    if (request.minManagedAmount !== undefined && request.minManagedAmount !== company.min_managed_amount) {
      changes.minManagedAmount = {
        from: company.min_managed_amount,
        to: request.minManagedAmount,
      };
      company.min_managed_amount = request.minManagedAmount;
    }

    if (request.metadata && Object.keys(request.metadata).length > 0) {
      changes.metadata = {
        from: company.metadata || {},
        to: request.metadata,
      };
      company.metadata = request.metadata;
    }

    company.updated_at = new Date();
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
      status: this.getStatusName(company.status_id),
      statusId: company.status_id,
      commissionPct: company.commission_pct,
      minManagedAmount: company.min_managed_amount,
      metadata: company.metadata || {},
      createdAt: company.created_at,
      updatedAt: company.updated_at,
    };
  }

  /**
   * Get companies by status
   */
  async getCompaniesByStatus(statusId: number, limit: number = 20, offset: number = 0): Promise<CompanyListItemDto[]> {
    const companies = await this.companyRepo.findByStatus(statusId, limit, offset);
    return companies.map(company => ({
      id: company.id,
      name: company.name,
      status: this.getStatusName(company.status_id),
      statusId: company.status_id,
      commissionPct: company.commission_pct,
      minManagedAmount: company.min_managed_amount,
      createdAt: company.created_at,
    }));
  }

  /**
   * Get active companies
   */
  async getActiveCompanies(limit: number = 20, offset: number = 0): Promise<CompanyListItemDto[]> {
    const companies = await this.companyRepo.findActive(limit, offset);
    return companies.map(company => ({
      id: company.id,
      name: company.name,
      status: this.getStatusName(company.status_id),
      statusId: company.status_id,
      commissionPct: company.commission_pct,
      minManagedAmount: company.min_managed_amount,
      createdAt: company.created_at,
    }));
  }

  /**
   * Get count of companies by status
   */
  async getCountByStatus(statusId: number): Promise<number> {
    return this.companyRepo.countByStatus(statusId);
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
