import { AppDataSource } from '../config/database';
import { LoanDurationConfig } from '../domain/LoanDurationConfig';

export class LoanDurationConfigRepository {
  private repo = AppDataSource.getRepository(LoanDurationConfig);

  async findAll(): Promise<LoanDurationConfig[]> {
    return await this.repo.find({ order: { sortOrder: 'ASC' } });
  }

  async findEnabled(): Promise<LoanDurationConfig[]> {
    return await this.repo.find({
      where: { isEnabled: true },
      order: { sortOrder: 'ASC' },
    });
  }

  async findById(id: number): Promise<LoanDurationConfig | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async save(config: Partial<LoanDurationConfig>): Promise<LoanDurationConfig> {
    return await this.repo.save(config as LoanDurationConfig);
  }

  async update(id: number, data: Partial<LoanDurationConfig>): Promise<void> {
    await this.repo.update(id, data);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  /**
   * Validate that a given duration (days or months) is allowed.
   */
  async isValidDuration(durationMonths?: number, durationDays?: number): Promise<LoanDurationConfig | null> {
    const enabled = await this.findEnabled();
    if (durationMonths !== undefined) {
      return enabled.find(c => c.durationMonths === durationMonths) ?? null;
    }
    if (durationDays !== undefined) {
      return enabled.find(c => c.durationDays === durationDays) ?? null;
    }
    return null;
  }
}
