import { AppDataSource } from '../config/database';
import { Claim } from '../domain/Claim';

export class ClaimRepository {
    private claimRepository = AppDataSource.getRepository(Claim);

    async save(claim: Claim): Promise<Claim> {
        return await this.claimRepository.save(claim);
    }

    async findById(id: number): Promise<Claim | null> {
        return await this.claimRepository.findOne({
            where: { id },
        });
    }

    async findByLoanId(loanId: number): Promise<Claim[]> {
        return await this.claimRepository.find({
            where: { loanId },
            order: { generatedAt: 'DESC' },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[Claim[], number]> {
        return await this.claimRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { generatedAt: 'DESC' },
        });
    }

    async delete(id: number): Promise<void> {
        await this.claimRepository.delete(id);
    }
}
