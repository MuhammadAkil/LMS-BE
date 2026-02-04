import { AppDataSource } from '../config/database';
import { Loan } from '../domain/Loan';

export class LoanRepository {
    private repo = AppDataSource.getRepository(Loan);

    async save(loan: Loan): Promise<Loan> {
        return await this.repo.save(loan);
    }

    async findById(id: number): Promise<Loan | null> {
        return await this.repo.findOne({ where: { id } });
    }

    async findByApplicationId(applicationId: number): Promise<Loan | null> {
        return await this.repo.findOne({ where: { applicationId } });
    }

    async findByBorrowerId(borrowerId: number, limit: number = 10, offset: number = 0): Promise<[Loan[], number]> {
        return await this.repo.findAndCount({
            where: { borrowerId },
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async findActiveByBorrowerId(borrowerId: number, limit: number = 10, offset: number = 0): Promise<[Loan[], number]> {
        return await this.repo.findAndCount({
            where: { borrowerId, statusId: 1 }, // ACTIVE status
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async findByBorrowerAndStatus(borrowerId: number, statusId: number): Promise<Loan[]> {
        return await this.repo.find({
            where: { borrowerId, statusId },
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: number, data: Partial<Loan>): Promise<Loan | null> {
        await this.repo.update(id, data);
        return await this.findById(id);
    }

    async countActiveByBorrower(borrowerId: number): Promise<number> {
        return await this.repo.count({
            where: { borrowerId, statusId: 1 }, // ACTIVE status
        });
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.repo.delete(id);
        return (result.affected ?? 0) > 0;
    }

    async findByStatus(statusId: number, limit: number = 20, offset: number = 0): Promise<[Loan[], number]> {
        return await this.repo.findAndCount({
            where: { statusId },
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }
}
