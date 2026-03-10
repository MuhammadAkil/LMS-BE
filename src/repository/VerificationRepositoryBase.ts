import { AppDataSource } from '../config/database';
import { Verification } from '../domain/Verification';

export class VerificationRepositoryBase {
    private repo = AppDataSource.getRepository(Verification);

    async save(verification: Verification): Promise<Verification> {
        return await this.repo.save(verification);
    }

    async findById(id: number): Promise<Verification | null> {
        return await this.repo.findOne({ where: { id } });
    }

    async findByUserId(userId: number): Promise<Verification[]> {
        return await this.repo.find({
            where: { userId },
            order: { submittedAt: 'DESC' },
        });
    }

    async findByUserAndType(userId: number, typeId: number): Promise<Verification | null> {
        return await this.repo.findOne({
            where: { userId, typeId },
            order: { submittedAt: 'DESC' },
        });
    }

    async findApprovedByUser(userId: number): Promise<Verification[]> {
        return await this.repo.find({
            where: { userId, statusId: 3 }, // APPROVED status
            order: { submittedAt: 'DESC' },
        });
    }

    async findPendingByUser(userId: number): Promise<Verification[]> {
        return await this.repo.find({
            where: { userId, statusId: 1 }, // PENDING_VERIFICATION status
            order: { submittedAt: 'DESC' },
        });
    }

    async findPending(limit: number = 20, offset: number = 0): Promise<[Verification[], number]> {
        return await this.repo.findAndCount({
            where: { statusId: 1 }, // PENDING status
            take: limit,
            skip: offset,
            order: { submittedAt: 'ASC' }, // FIFO
        });
    }

    async update(id: number, data: Partial<Verification>): Promise<Verification | null> {
        await this.repo.update(id, data);
        return await this.findById(id);
    }

    async countPendingByType(typeId: number): Promise<number> {
        return await this.repo.count({
            where: { typeId, statusId: 1 }, // PENDING status
        });
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.repo.delete(id);
        return (result.affected ?? 0) > 0;
    }
}
