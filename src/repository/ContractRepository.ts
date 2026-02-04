import { AppDataSource } from '../config/database';
import { Contract } from '../domain/Contract';

export class ContractRepository {
    private contractRepository = AppDataSource.getRepository(Contract);

    async save(contract: Contract): Promise<Contract> {
        return await this.contractRepository.save(contract);
    }

    async findById(id: number): Promise<Contract | null> {
        return await this.contractRepository.findOne({
            where: { id },
        });
    }

    async findByLoanId(loanId: number): Promise<Contract | null> {
        return await this.contractRepository.findOne({
            where: { loanId },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[Contract[], number]> {
        return await this.contractRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: number, contract: Partial<Contract>): Promise<void> {
        await this.contractRepository.update(id, contract);
    }

    async delete(id: number): Promise<void> {
        await this.contractRepository.delete(id);
    }
}
