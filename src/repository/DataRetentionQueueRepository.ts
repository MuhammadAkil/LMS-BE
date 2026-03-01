import { AppDataSource } from '../config/database';
import { DataRetentionQueue } from '../domain/DataRetentionQueue';
import { LessThanOrEqual } from 'typeorm';

export class DataRetentionQueueRepository {
    private dataRetentionQueueRepository = AppDataSource.getRepository(DataRetentionQueue);

    async save(record: DataRetentionQueue): Promise<DataRetentionQueue> {
        return await this.dataRetentionQueueRepository.save(record);
    }

    async findById(id: number): Promise<DataRetentionQueue | null> {
        return await this.dataRetentionQueueRepository.findOne({
            where: { id },
        });
    }

    async findPendingDeletions(): Promise<DataRetentionQueue[]> {
        return await this.dataRetentionQueueRepository.find({
            where: { deleteAt: LessThanOrEqual(new Date()) },
            order: { deleteAt: 'ASC' },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[DataRetentionQueue[], number]> {
        return await this.dataRetentionQueueRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { deleteAt: 'ASC' },
        });
    }

    async delete(id: number): Promise<void> {
        await this.dataRetentionQueueRepository.delete(id);
    }
}
