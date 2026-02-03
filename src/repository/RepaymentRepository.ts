import { AppDataSource } from '../config/database';
import { Repayment } from '../domain/Repayment';

export class RepaymentRepository {
    private repo = AppDataSource.getRepository(Repayment);

    async save(repayment: Repayment): Promise<Repayment> {
        return await this.repo.save(repayment);
    }

    async findById(id: number): Promise<Repayment | null> {
        return await this.repo.findOne({ where: { id } });
    }

    async findByLoanId(loanId: number): Promise<Repayment[]> {
        return await this.repo.find({
            where: { loanId },
            order: { dueDate: 'ASC' },
        });
    }

    async findPendingByLoanId(loanId: number): Promise<Repayment[]> {
        return await this.repo.find({
            where: { loanId, paidAt: null },
            order: { dueDate: 'ASC' },
        });
    }

    async findOverdueRepayments(): Promise<Repayment[]> {
        const today = new Date();
        return await this.repo
            .createQueryBuilder('repayment')
            .where('repayment.dueDate < :today', { today })
            .andWhere('repayment.paidAt IS NULL')
            .orderBy('repayment.dueDate', 'ASC')
            .getMany();
    }

    async findNextRepaymentByLoanId(loanId: number): Promise<Repayment | null> {
        return await this.repo.findOne({
            where: { loanId, paidAt: null },
            order: { dueDate: 'ASC' },
        });
    }

    async countPendingByLoanId(loanId: number): Promise<number> {
        return await this.repo.count({
            where: { loanId, paidAt: null },
        });
    }

    async sumOutstandingByLoanId(loanId: number): Promise<number> {
        const result = await this.repo
            .createQueryBuilder('repayment')
            .select('SUM(repayment.amount)', 'total')
            .where('repayment.loanId = :loanId', { loanId })
            .andWhere('repayment.paidAt IS NULL')
            .getRawOne();
        return result?.total || 0;
    }

    async update(id: number, data: Partial<Repayment>): Promise<Repayment | null> {
        await this.repo.update(id, data);
        return await this.findById(id);
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.repo.delete(id);
        return (result.affected ?? 0) > 0;
    }
}
