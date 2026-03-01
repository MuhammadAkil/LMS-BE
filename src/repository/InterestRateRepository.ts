import { AppDataSource } from '../config/database';
import { InterestRate } from '../domain/InterestRate';

export class InterestRateRepository {
  private repo = AppDataSource.getRepository(InterestRate);

  async save(rate: Partial<InterestRate>): Promise<InterestRate> {
    return await this.repo.save(rate as InterestRate);
  }

  async findById(id: number): Promise<InterestRate | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findAll(): Promise<InterestRate[]> {
    return await this.repo.find({ order: { effectiveFrom: 'DESC' } });
  }

  async findActive(): Promise<InterestRate[]> {
    return await this.repo.find({
      where: { status: 'ACTIVE' },
      order: { effectiveFrom: 'DESC' },
    });
  }

  /**
   * Get the applicable interest rate for a given date.
   * Returns the most recent rate whose effectiveFrom <= targetDate.
   */
  async findRateForDate(targetDate: Date): Promise<InterestRate | null> {
    const dateStr = targetDate.toISOString().split('T')[0];
    const results = await AppDataSource.query(
      `SELECT * FROM interest_rates
       WHERE status = 'ACTIVE'
         AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [dateStr, dateStr]
    );
    return results[0] ?? null;
  }

  async deactivateAll(): Promise<void> {
    await this.repo.update({ status: 'ACTIVE' }, { status: 'INACTIVE' });
  }

  async update(id: number, data: Partial<InterestRate>): Promise<void> {
    await this.repo.update(id, data);
  }
}
