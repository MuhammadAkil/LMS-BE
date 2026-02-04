import { AppDataSource } from '../config/database';
import { Loan } from '../domain/Loan';

export class LoanRepository {
    private loanRepository = AppDataSource.getRepository(Loan);

    async save(loan: Loan): Promise<Loan> {
        return await this.loanRepository.save(loan);
    }

    async findById(id: number): Promise<Loan | null> {
        return await this.loanRepository.findOne({
            where: { id },
        });
    }

    async findByApplicationId(applicationId: number): Promise<Loan | null> {
        return await this.loanRepository.findOne({
            where: { applicationId },
        });
    }

    async findByBorrowerId(borrowerId: number): Promise<Loan[]> {
        return await this.loanRepository.find({
            where: { borrowerId },
            order: { createdAt: 'DESC' },
        });
    }

    async findByStatus(statusId: number): Promise<Loan[]> {
        return await this.loanRepository.find({
            where: { statusId },
            order: { createdAt: 'DESC' },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[Loan[], number]> {
        return await this.loanRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: number, loan: Partial<Loan>): Promise<void> {
        await this.loanRepository.update(id, loan);
    }

    async delete(id: number): Promise<void> {
        await this.loanRepository.delete(id);
    }
}
