import { AppDataSource } from '../config/database';
import { Payment } from '../domain/Payment';

export class PaymentRepository {
    private paymentRepository = AppDataSource.getRepository(Payment);

    async save(payment: Payment): Promise<Payment> {
        return await this.paymentRepository.save(payment);
    }

    async findById(id: number): Promise<Payment | null> {
        return await this.paymentRepository.findOne({
            where: { id },
        });
    }

    async findByUserId(userId: number): Promise<Payment[]> {
        return await this.paymentRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }

    async findByLoanId(loanId: number): Promise<Payment[]> {
        return await this.paymentRepository.find({
            where: { loanId },
            order: { createdAt: 'DESC' },
        });
    }

    async findBySessionId(sessionId: string): Promise<Payment | null> {
        return await this.paymentRepository.findOne({
            where: { sessionId },
        });
    }

    async findByUserIdAndCourseId(userId: number, courseId: number): Promise<Payment | null> {
        return await this.paymentRepository.findOne({
            where: { userId, courseId },
            order: { createdAt: 'DESC' },
        });
    }

    async findByStatus(statusId: number): Promise<Payment[]> {
        return await this.paymentRepository.find({
            where: { statusId },
            order: { createdAt: 'DESC' },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[Payment[], number]> {
        return await this.paymentRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: number, payment: Partial<Payment>): Promise<void> {
        await this.paymentRepository.update(id, payment);
    }

    async delete(id: number): Promise<void> {
        await this.paymentRepository.delete(id);
    }
}
