import { AppDataSource } from '../config/database';
import { LoanOffer } from '../domain/LoanOffer';

export class LoanOfferRepository {
    private repo = AppDataSource.getRepository(LoanOffer);

    async save(offer: LoanOffer): Promise<LoanOffer> {
        return await this.repo.save(offer);
    }

    async findById(id: number): Promise<LoanOffer | null> {
        return await this.repo.findOne({ where: { id } });
    }

    async findByLoanId(loanId: number): Promise<LoanOffer[]> {
        return await this.repo.find({ where: { loanId }, order: { createdAt: 'DESC' } });
    }

    async findByLenderId(lenderId: number, limit: number = 20, offset: number = 0): Promise<[LoanOffer[], number]> {
        return await this.repo.findAndCount({
            where: { lenderId },
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async findByLoanAndLender(loanId: number, lenderId: number): Promise<LoanOffer | null> {
        return await this.repo.findOne({ where: { loanId, lenderId } });
    }

    async sumAmountByLoanId(loanId: number): Promise<number> {
        const result = await this.repo
            .createQueryBuilder('offer')
            .select('SUM(offer.amount)', 'total')
            .where('offer.loanId = :loanId', { loanId })
            .getRawOne();
        return result?.total || 0;
    }

    async countByLoanId(loanId: number): Promise<number> {
        return await this.repo.count({ where: { loanId } });
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.repo.delete(id);
        return (result.affected ?? 0) > 0;
    }
}
