import { AppDataSource } from '../config/database';
import { CompanyLender } from '../domain/CompanyLender';

export class CompanyLenderRepository {
    private companyLenderRepository = AppDataSource.getRepository(CompanyLender);

    async save(companyLender: CompanyLender): Promise<CompanyLender> {
        return await this.companyLenderRepository.save(companyLender);
    }

    async findById(id: number): Promise<CompanyLender | null> {
        return await this.companyLenderRepository.findOne({
            where: { id },
        });
    }

    async findByCompanyId(companyId: number): Promise<CompanyLender[]> {
        return await this.companyLenderRepository.find({
            where: { companyId, active: true },
        });
    }

    async findByLenderId(lenderId: number): Promise<CompanyLender[]> {
        return await this.companyLenderRepository.find({
            where: { lenderId, active: true },
        });
    }

    async findByCompanyIdAndLenderId(companyId: number, lenderId: number): Promise<CompanyLender | null> {
        return await this.companyLenderRepository.findOne({
            where: { companyId, lenderId },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[CompanyLender[], number]> {
        return await this.companyLenderRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: number, companyLender: Partial<CompanyLender>): Promise<void> {
        await this.companyLenderRepository.update(id, companyLender);
    }

    async delete(id: number): Promise<void> {
        await this.companyLenderRepository.delete(id);
    }
}
