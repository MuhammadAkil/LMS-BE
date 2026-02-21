import { AppDataSource } from '../config/database';
import { CommissionConfig } from '../domain/CommissionConfig';

export class CommissionConfigRepository {
  private repo = AppDataSource.getRepository(CommissionConfig);

  async save(config: Partial<CommissionConfig>): Promise<CommissionConfig> {
    return await this.repo.save(config as CommissionConfig);
  }

  async findById(id: number): Promise<CommissionConfig | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findAll(limit = 50, offset = 0): Promise<[CommissionConfig[], number]> {
    return await this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findByType(configType: string): Promise<CommissionConfig[]> {
    return await this.repo.find({
      where: { configType },
      order: { createdAt: 'DESC' },
    });
  }

  async findApprovedByType(configType: string): Promise<CommissionConfig[]> {
    return await this.repo.find({
      where: { configType, status: 'APPROVED' },
      order: { effectiveFrom: 'DESC' },
    });
  }

  /**
   * Get the applicable portal commission for a borrower level and loan amount.
   */
  async findApplicablePortalCommission(borrowerLevel: number, loanAmount: number): Promise<CommissionConfig | null> {
    const results = await AppDataSource.query(
      `SELECT * FROM commission_configs
       WHERE config_type = 'PORTAL'
         AND status = 'APPROVED'
         AND (borrower_level IS NULL OR borrower_level = ?)
         AND (min_loan_amount IS NULL OR min_loan_amount <= ?)
         AND (max_loan_amount IS NULL OR max_loan_amount >= ?)
       ORDER BY borrower_level DESC, created_at DESC
       LIMIT 1`,
      [borrowerLevel, loanAmount, loanAmount]
    );
    return results[0] ?? null;
  }

  async findApprovedVoluntaryCommission(): Promise<CommissionConfig | null> {
    const results = await this.repo.find({
      where: { configType: 'VOLUNTARY', status: 'APPROVED' },
      order: { createdAt: 'DESC' },
    });
    return results[0] ?? null;
  }

  async update(id: number, data: Partial<CommissionConfig>): Promise<void> {
    await this.repo.update(id, data);
  }

  async findPending(): Promise<CommissionConfig[]> {
    return await this.repo.find({
      where: { status: 'PENDING_APPROVAL' },
      order: { createdAt: 'ASC' },
    });
  }
}
