import { AppDataSource } from '../config/database';
import { Reminder } from '../domain/Reminder';

export class ReminderRepository {
    private reminderRepository = AppDataSource.getRepository(Reminder);

    async save(reminder: Reminder): Promise<Reminder> {
        return await this.reminderRepository.save(reminder);
    }

    async findById(id: number): Promise<Reminder | null> {
        return await this.reminderRepository.findOne({
            where: { id },
        });
    }

    async findByLoanId(loanId: number): Promise<Reminder[]> {
        return await this.reminderRepository.find({
            where: { loanId },
            order: { sentAt: 'DESC' },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[Reminder[], number]> {
        return await this.reminderRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { sentAt: 'DESC' },
        });
    }

    async delete(id: number): Promise<void> {
        await this.reminderRepository.delete(id);
    }
}
