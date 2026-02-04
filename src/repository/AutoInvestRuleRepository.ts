import { AppDataSource } from '../config/database';
import { AutoInvestRule } from '../domain/AutoInvestRule';

export class AutoInvestRuleRepository {
    private autoInvestRuleRepository = AppDataSource.getRepository(AutoInvestRule);

    async save(rule: AutoInvestRule): Promise<AutoInvestRule> {
        return await this.autoInvestRuleRepository.save(rule);
    }

    async findById(id: number): Promise<AutoInvestRule | null> {
        return await this.autoInvestRuleRepository.findOne({
            where: { id },
        });
    }

    async findByCompanyId(companyId: number): Promise<AutoInvestRule[]> {
        return await this.autoInvestRuleRepository.find({
            where: { companyId, active: true },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[AutoInvestRule[], number]> {
        return await this.autoInvestRuleRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: number, rule: Partial<AutoInvestRule>): Promise<void> {
        await this.autoInvestRuleRepository.update(id, rule);
    }

    async delete(id: number): Promise<void> {
        await this.autoInvestRuleRepository.delete(id);
    }
}
