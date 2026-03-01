import { LoanDurationConfigRepository } from '../repository/LoanDurationConfigRepository';
import { AdminAuditService } from './AdminAuditService';
import { LoanDurationConfig } from '../domain/LoanDurationConfig';

export interface LoanDurationConfigDto {
  id: number;
  label: string;
  durationDays?: number;
  durationMonths?: number;
  repaymentType: string;
  isEnabled: boolean;
  sortOrder: number;
}

export class LoanDurationConfigService {
  private repo: LoanDurationConfigRepository;
  private auditService: AdminAuditService;

  constructor() {
    this.repo = new LoanDurationConfigRepository();
    this.auditService = new AdminAuditService();
  }

  async getAll(): Promise<LoanDurationConfigDto[]> {
    const configs = await this.repo.findAll();
    return configs.map(this.toDto);
  }

  async getEnabled(): Promise<LoanDurationConfigDto[]> {
    const configs = await this.repo.findEnabled();
    return configs.map(this.toDto);
  }

  async toggleEnabled(id: number, isEnabled: boolean, adminId: number): Promise<LoanDurationConfigDto> {
    const config = await this.repo.findById(id);
    if (!config) throw new Error('Duration config not found');

    await this.repo.update(id, { isEnabled });

    await this.auditService.logAction(
      adminId,
      isEnabled ? 'LOAN_DURATION_ENABLED' : 'LOAN_DURATION_DISABLED',
      'LOAN_DURATION_CONFIG',
      id,
      { label: config.label }
    );

    const updated = await this.repo.findById(id);
    return this.toDto(updated!);
  }

  async create(data: Omit<LoanDurationConfigDto, 'id'>, adminId: number): Promise<LoanDurationConfigDto> {
    if (!data.durationDays && !data.durationMonths) {
      throw new Error('Either durationDays or durationMonths must be provided');
    }

    const saved = await this.repo.save({
      label: data.label,
      durationDays: data.durationDays,
      durationMonths: data.durationMonths,
      repaymentType: data.repaymentType,
      isEnabled: data.isEnabled ?? true,
      sortOrder: data.sortOrder ?? 99,
    });

    await this.auditService.logAction(adminId, 'LOAN_DURATION_CREATED', 'LOAN_DURATION_CONFIG', saved.id, data);
    return this.toDto(saved);
  }

  async update(id: number, data: Partial<LoanDurationConfigDto>, adminId: number): Promise<LoanDurationConfigDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error('Duration config not found');

    await this.repo.update(id, {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.repaymentType !== undefined && { repaymentType: data.repaymentType }),
      ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    });

    await this.auditService.logAction(adminId, 'LOAN_DURATION_UPDATED', 'LOAN_DURATION_CONFIG', id, data);
    const updated = await this.repo.findById(id);
    return this.toDto(updated!);
  }

  async delete(id: number, adminId: number): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error('Duration config not found');
    await this.repo.delete(id);
    await this.auditService.logAction(adminId, 'LOAN_DURATION_DELETED', 'LOAN_DURATION_CONFIG', id, {});
  }

  /**
   * Validate that a requested duration is currently enabled.
   * Returns the matching config or throws.
   */
  async validateDuration(durationMonths?: number, durationDays?: number): Promise<LoanDurationConfig> {
    const config = await this.repo.isValidDuration(durationMonths, durationDays);
    if (!config) {
      const label = durationMonths ? `${durationMonths} month(s)` : `${durationDays} day(s)`;
      throw new Error(`Loan duration ${label} is not currently available`);
    }
    return config;
  }

  private toDto(c: LoanDurationConfig): LoanDurationConfigDto {
    return {
      id: c.id,
      label: c.label,
      durationDays: c.durationDays,
      durationMonths: c.durationMonths,
      repaymentType: c.repaymentType,
      isEnabled: c.isEnabled,
      sortOrder: c.sortOrder,
    };
  }
}
