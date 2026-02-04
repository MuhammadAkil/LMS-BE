import { AppDataSource } from '../config/database';
import { LevelRules } from '../domain/LevelRules';

export class LevelRulesRepository {
    private repo = AppDataSource.getRepository(LevelRules);

    async findByLevel(level: number): Promise<LevelRules | null> {
        return await this.repo.findOne({ where: { level } });
    }

    async findAll(): Promise<LevelRules[]> {
        return await this.repo.find({ order: { level: 'ASC' } });
    }

    async save(rules: LevelRules): Promise<LevelRules> {
        return await this.repo.save(rules);
    }

    async getMaxLoanAmountForLevel(level: number): Promise<number | null> {
        const rules = await this.findByLevel(level);
        return rules?.maxLoanAmount || null;
    }

    async getMaxApplicationsForLevel(level: number): Promise<number | null> {
        const rules = await this.findByLevel(level);
        return rules?.maxApplications || null;
    }

    async getCommissionPercentForLevel(level: number): Promise<number> {
        const rules = await this.findByLevel(level);
        return rules?.commissionPercent || 0;
    }
}
