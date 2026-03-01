import { InterestRateRepository } from '../repository/InterestRateRepository';
import { AdminAuditService } from './AdminAuditService';
import { InterestRate } from '../domain/InterestRate';

export interface CreateInterestRateRequest {
  rate: number;
  maxRate: number;
  effectiveFrom: string; // ISO date
  effectiveTo?: string;
}

export interface InterestRateDto {
  id: number;
  rate: number;
  maxRate: number;
  effectiveFrom: string;
  effectiveTo?: string;
  status: string;
  createdBy: number;
  createdAt: string;
}

export class InterestRateService {
  private repo: InterestRateRepository;
  private auditService: AdminAuditService;

  constructor() {
    this.repo = new InterestRateRepository();
    this.auditService = new AdminAuditService();
  }

  async getAll(): Promise<InterestRateDto[]> {
    const rates = await this.repo.findAll();
    return rates.map(this.toDto);
  }

  async getActive(): Promise<InterestRateDto[]> {
    const rates = await this.repo.findActive();
    return rates.map(this.toDto);
  }

  /**
   * Get the applicable rate for a specific date (defaults to today).
   * Applies the most recent rate whose effectiveFrom <= targetDate.
   */
  async getRateForDate(targetDate?: Date): Promise<InterestRateDto | null> {
    const date = targetDate ?? new Date();
    const rate = await this.repo.findRateForDate(date);
    return rate ? this.toDto(rate) : null;
  }

  /**
   * Get current applicable rate (for today).
   */
  async getCurrentRate(): Promise<number> {
    const rate = await this.repo.findRateForDate(new Date());
    return rate ? Number(rate.rate) : 0.075; // fallback 7.5%
  }

  async create(request: CreateInterestRateRequest, adminId: number): Promise<InterestRateDto> {
    if (request.rate <= 0 || request.rate > 1) {
      throw new Error('Rate must be between 0 and 1 (e.g. 0.075 for 7.5%)');
    }
    if (request.maxRate < request.rate) {
      throw new Error('Max rate must be >= rate');
    }

    const rate = await this.repo.save({
      rate: request.rate,
      maxRate: request.maxRate,
      effectiveFrom: new Date(request.effectiveFrom),
      effectiveTo: request.effectiveTo ? new Date(request.effectiveTo) : undefined,
      createdBy: adminId,
      status: 'ACTIVE',
    });

    await this.auditService.logAction(
      adminId,
      'INTEREST_RATE_CREATED',
      'INTEREST_RATE',
      rate.id,
      { rate: request.rate, maxRate: request.maxRate, effectiveFrom: request.effectiveFrom }
    );

    return this.toDto(rate);
  }

  async update(id: number, data: Partial<CreateInterestRateRequest>, adminId: number): Promise<InterestRateDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error('Interest rate not found');

    await this.repo.update(id, {
      ...(data.rate !== undefined && { rate: data.rate }),
      ...(data.maxRate !== undefined && { maxRate: data.maxRate }),
      ...(data.effectiveFrom && { effectiveFrom: new Date(data.effectiveFrom) }),
      ...(data.effectiveTo && { effectiveTo: new Date(data.effectiveTo) }),
    });

    await this.auditService.logAction(
      adminId,
      'INTEREST_RATE_UPDATED',
      'INTEREST_RATE',
      id,
      data
    );

    const updated = await this.repo.findById(id);
    return this.toDto(updated!);
  }

  async deactivate(id: number, adminId: number): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error('Interest rate not found');

    await this.repo.update(id, { status: 'INACTIVE' });

    await this.auditService.logAction(
      adminId,
      'INTEREST_RATE_DEACTIVATED',
      'INTEREST_RATE',
      id,
      {}
    );
  }

  private toDto(rate: InterestRate): InterestRateDto {
    return {
      id: rate.id,
      rate: Number(rate.rate),
      maxRate: Number(rate.maxRate),
      effectiveFrom: rate.effectiveFrom instanceof Date
        ? rate.effectiveFrom.toISOString().split('T')[0]
        : String(rate.effectiveFrom),
      effectiveTo: rate.effectiveTo
        ? (rate.effectiveTo instanceof Date
          ? rate.effectiveTo.toISOString().split('T')[0]
          : String(rate.effectiveTo))
        : undefined,
      status: rate.status,
      createdBy: rate.createdBy,
      createdAt: rate.createdAt.toISOString(),
    };
  }
}
