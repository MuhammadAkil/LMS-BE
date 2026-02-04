import { AppDataSource } from '../config/database';
import { LoanOffer } from '../domain/LoanOffer';

export class LoanOfferRepository {
    private loanOfferRepository = AppDataSource.getRepository(LoanOffer);

    async save(loanOffer: LoanOffer): Promise<LoanOffer> {
        return await this.loanOfferRepository.save(loanOffer);
    }

    async findById(id: number): Promise<LoanOffer | null> {
        return await this.loanOfferRepository.findOne({
            where: { id },
        });
    }

    async findByLoanId(loanId: number): Promise<LoanOffer[]> {
        return await this.loanOfferRepository.find({
            where: { loanId },
            order: { createdAt: 'DESC' },
        });
    }

    async findByLenderId(lenderId: number): Promise<LoanOffer[]> {
        return await this.loanOfferRepository.find({
            where: { lenderId },
            order: { createdAt: 'DESC' },
        });
    }

    async findByLoanIdAndLenderId(loanId: number, lenderId: number): Promise<LoanOffer | null> {
        return await this.loanOfferRepository.findOne({
            where: { loanId, lenderId },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[LoanOffer[], number]> {
        return await this.loanOfferRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async delete(id: number): Promise<void> {
        await this.loanOfferRepository.delete(id);
    }
}
