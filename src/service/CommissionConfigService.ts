import { CommissionConfigRepository } from '../repository/CommissionConfigRepository';
import { ManagementCommissionRepository } from '../repository/ManagementCommissionRepository';
import { ApprovalWorkflowService } from './ApprovalWorkflowService';
import { AdminAuditService } from './AdminAuditService';
import { CommissionConfig } from '../domain/CommissionConfig';
import { ManagementCommission } from '../domain/ManagementCommission';

export interface CreateCommissionConfigRequest {
  configType: 'PORTAL' | 'VOLUNTARY' | 'MANAGEMENT';
  borrowerLevel?: number;
  minLoanAmount?: number;
  maxLoanAmount?: number;
  commissionPct: number; // e.g. 0.02 for 2%
  lenderFrequentPayoutFee?: number;
  defaultPayoutDay?: number;
  effectiveFrom?: string;
}

export interface CommissionConfigDto {
  id: number;
  configType: string;
  borrowerLevel?: number;
  minLoanAmount?: number;
  maxLoanAmount?: number;
  commissionPct: number;
  commissionPctDisplay: string; // "2.00%"
  lenderFrequentPayoutFee?: number;
  defaultPayoutDay: number;
  status: string;
  createdBy: number;
  approvedBy?: number;
  approvedAt?: string;
  rejectionReason?: string;
  effectiveFrom?: string;
  createdAt: string;
}

export interface CreateManagementCommissionRequest {
  companyId: number;
  commissionPct: number;
  calculationBasis?: 'PAID_IN_CAPITAL' | 'AUM';
  payoutPeriod?: 'ANNUAL' | 'QUARTERLY';
  effectiveYear?: number;
}

export class CommissionConfigService {
  private commissionRepo: CommissionConfigRepository;
  private mgmtCommissionRepo: ManagementCommissionRepository;
  private approvalService: ApprovalWorkflowService;
  private auditService: AdminAuditService;

  constructor() {
    this.commissionRepo = new CommissionConfigRepository();
    this.mgmtCommissionRepo = new ManagementCommissionRepository();
    this.approvalService = new ApprovalWorkflowService();
    this.auditService = new AdminAuditService();
  }

  // ==================== Portal / Voluntary Commission ====================

  async getAll(limit = 50, offset = 0): Promise<{ data: CommissionConfigDto[]; total: number }> {
    const [configs, total] = await this.commissionRepo.findAll(limit, offset);
    return { data: configs.map(this.toDto), total };
  }

  async getById(id: number): Promise<CommissionConfigDto> {
    const config = await this.commissionRepo.findById(id);
    if (!config) throw new Error('Commission config not found');
    return this.toDto(config);
  }

  async getByType(configType: string): Promise<CommissionConfigDto[]> {
    const configs = await this.commissionRepo.findByType(configType);
    return configs.map(this.toDto);
  }

  async getApprovedByType(configType: string): Promise<CommissionConfigDto[]> {
    const configs = await this.commissionRepo.findApprovedByType(configType);
    return configs.map(this.toDto);
  }

  async create(request: CreateCommissionConfigRequest, createdBy: number): Promise<CommissionConfigDto> {
    if (request.commissionPct <= 0 || request.commissionPct > 1) {
      throw new Error('Commission percentage must be between 0 and 1 (e.g. 0.02 for 2%)');
    }

    const config = await this.commissionRepo.save({
      configType: request.configType,
      borrowerLevel: request.borrowerLevel,
      minLoanAmount: request.minLoanAmount,
      maxLoanAmount: request.maxLoanAmount,
      commissionPct: request.commissionPct,
      lenderFrequentPayoutFee: request.lenderFrequentPayoutFee,
      defaultPayoutDay: request.defaultPayoutDay ?? 5,
      status: 'DRAFT',
      createdBy,
      effectiveFrom: request.effectiveFrom ? new Date(request.effectiveFrom) : undefined,
    });

    await this.auditService.logAction(createdBy, 'COMMISSION_CONFIG_CREATED', 'COMMISSION_CONFIG', config.id, request);
    return this.toDto(config);
  }

  async submitForApproval(id: number, actorId: number): Promise<CommissionConfigDto> {
    await this.approvalService.submitForApproval('COMMISSION_CONFIG', id, actorId);
    const updated = await this.commissionRepo.findById(id);
    return this.toDto(updated!);
  }

  async approve(id: number, adminId: number, comment?: string): Promise<CommissionConfigDto> {
    await this.approvalService.approve('COMMISSION_CONFIG', id, adminId, comment);
    const updated = await this.commissionRepo.findById(id);
    return this.toDto(updated!);
  }

  async reject(id: number, adminId: number, comment: string): Promise<CommissionConfigDto> {
    await this.approvalService.reject('COMMISSION_CONFIG', id, adminId, comment);
    const updated = await this.commissionRepo.findById(id);
    return this.toDto(updated!);
  }

  // ==================== Management Commission ====================

  async createManagementCommission(
    request: CreateManagementCommissionRequest,
    createdBy: number
  ): Promise<ManagementCommission> {
    if (request.commissionPct <= 0 || request.commissionPct > 1) {
      throw new Error('Commission percentage must be between 0 and 1');
    }

    const mc = await this.mgmtCommissionRepo.save({
      companyId: request.companyId,
      commissionPct: request.commissionPct,
      calculationBasis: request.calculationBasis ?? 'PAID_IN_CAPITAL',
      payoutPeriod: request.payoutPeriod ?? 'ANNUAL',
      status: 'DRAFT',
      createdBy,
      effectiveYear: request.effectiveYear,
    });

    await this.auditService.logAction(createdBy, 'MANAGEMENT_COMMISSION_CREATED', 'MANAGEMENT_COMMISSION', mc.id, request);
    return mc;
  }

  async submitManagementCommissionForApproval(id: number, actorId: number): Promise<ManagementCommission> {
    await this.approvalService.submitForApproval('MANAGEMENT_COMMISSION', id, actorId);
    return (await this.mgmtCommissionRepo.findById(id))!;
  }

  async approveManagementCommission(id: number, adminId: number, comment?: string): Promise<ManagementCommission> {
    await this.approvalService.approve('MANAGEMENT_COMMISSION', id, adminId, comment);
    return (await this.mgmtCommissionRepo.findById(id))!;
  }

  async rejectManagementCommission(id: number, adminId: number, comment: string): Promise<ManagementCommission> {
    await this.approvalService.reject('MANAGEMENT_COMMISSION', id, adminId, comment);
    return (await this.mgmtCommissionRepo.findById(id))!;
  }

  async getManagementCommissionsByCompany(companyId: number): Promise<ManagementCommission[]> {
    return await this.mgmtCommissionRepo.findByCompanyId(companyId);
  }

  async getPendingManagementCommissions(): Promise<ManagementCommission[]> {
    return await this.mgmtCommissionRepo.findPending();
  }

  private toDto(c: CommissionConfig): CommissionConfigDto {
    return {
      id: c.id,
      configType: c.configType,
      borrowerLevel: c.borrowerLevel,
      minLoanAmount: c.minLoanAmount ? Number(c.minLoanAmount) : undefined,
      maxLoanAmount: c.maxLoanAmount ? Number(c.maxLoanAmount) : undefined,
      commissionPct: Number(c.commissionPct),
      commissionPctDisplay: `${(Number(c.commissionPct) * 100).toFixed(2)}%`,
      lenderFrequentPayoutFee: c.lenderFrequentPayoutFee ? Number(c.lenderFrequentPayoutFee) : undefined,
      defaultPayoutDay: c.defaultPayoutDay,
      status: c.status,
      createdBy: c.createdBy,
      approvedBy: c.approvedBy,
      approvedAt: c.approvedAt?.toISOString(),
      rejectionReason: c.rejectionReason,
      effectiveFrom: c.effectiveFrom
        ? (c.effectiveFrom instanceof Date ? c.effectiveFrom.toISOString().split('T')[0] : String(c.effectiveFrom))
        : undefined,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
