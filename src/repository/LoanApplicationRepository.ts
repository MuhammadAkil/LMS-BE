import { AppDataSource } from '../config/database';
import { LoanApplication } from '../domain/LoanApplication';

export class LoanApplicationRepository {
    private repo = AppDataSource.getRepository(LoanApplication);

    async save(application: LoanApplication): Promise<LoanApplication> {
        return await this.repo.save(application);
    }

    async findById(id: number): Promise<LoanApplication | null> {
        return await this.repo.findOne({ where: { id } });
    }

    async findByBorrowerId(borrowerId: number, limit: number = 10, offset: number = 0): Promise<[LoanApplication[], number]> {
        return await this.repo.findAndCount({
            where: { borrowerId },
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async findOpenByBorrowerId(borrowerId: number): Promise<LoanApplication | null> {
        return await this.repo.findOne({
            where: { borrowerId, statusId: 1 }, // OPEN status
        });
    }

    async findByBorrowerAndStatus(borrowerId: number, statusId: number): Promise<LoanApplication[]> {
        return await this.repo.find({
            where: { borrowerId, statusId },
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: number, data: Partial<LoanApplication>): Promise<LoanApplication | null> {
        await this.repo.update(id, data);
        return await this.findById(id);
    }

    async countActiveByBorrower(borrowerId: number): Promise<number> {
        return await this.repo.count({
            where: { borrowerId, statusId: 1 }, // OPEN status
        });
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.repo.delete(id);
        return (result.affected ?? 0) > 0;
    }
}
