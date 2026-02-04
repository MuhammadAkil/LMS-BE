import { AppDataSource } from '../config/database';
import { LoanApplication } from '../domain/LoanApplication';

export class LoanApplicationRepository {
    private loanApplicationRepository = AppDataSource.getRepository(LoanApplication);

    async save(loanApplication: LoanApplication): Promise<LoanApplication> {
        return await this.loanApplicationRepository.save(loanApplication);
    }

    async findById(id: number): Promise<LoanApplication | null> {
        return await this.loanApplicationRepository.findOne({
            where: { id },
        });
    }

    async findByBorrowerId(borrowerId: number): Promise<LoanApplication[]> {
        return await this.loanApplicationRepository.find({
            where: { borrowerId },
            order: { createdAt: 'DESC' },
        });
    }

    async findByStatus(statusId: number): Promise<LoanApplication[]> {
        return await this.loanApplicationRepository.find({
            where: { statusId },
            order: { createdAt: 'DESC' },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[LoanApplication[], number]> {
        return await this.loanApplicationRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: number, loanApplication: Partial<LoanApplication>): Promise<void> {
        await this.loanApplicationRepository.update(id, loanApplication);
    }

    async delete(id: number): Promise<void> {
        await this.loanApplicationRepository.delete(id);
    }
}
