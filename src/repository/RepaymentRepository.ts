import { AppDataSource } from '../config/database';
import { Repayment } from '../domain/Repayment';

export class RepaymentRepository {
    private repaymentRepository = AppDataSource.getRepository(Repayment);

    async save(repayment: Repayment): Promise<Repayment> {
        return await this.repaymentRepository.save(repayment);
    }

    async findById(id: number): Promise<Repayment | null> {
        return await this.repaymentRepository.findOne({
            where: { id },
        });
    }

    async findByLoanId(loanId: number): Promise<Repayment[]> {
        return await this.repaymentRepository.find({
            where: { loanId },
            order: { dueDate: 'ASC' },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[Repayment[], number]> {
        return await this.repaymentRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { dueDate: 'ASC' },
        });
    }

    async update(id: number, repayment: Partial<Repayment>): Promise<void> {
        await this.repaymentRepository.update(id, repayment);
    }

    async delete(id: number): Promise<void> {
        await this.repaymentRepository.delete(id);
    }
}
