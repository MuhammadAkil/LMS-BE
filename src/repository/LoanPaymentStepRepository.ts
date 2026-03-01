import { AppDataSource } from '../config/database';
import { LoanPaymentStep } from '../domain/LoanPaymentStep';

export class LoanPaymentStepRepository {
  private repo = AppDataSource.getRepository(LoanPaymentStep);

  async save(step: Partial<LoanPaymentStep>): Promise<LoanPaymentStep> {
    return await this.repo.save(step as LoanPaymentStep);
  }

  async findByApplicationId(loanApplicationId: number): Promise<LoanPaymentStep[]> {
    return await this.repo.find({
      where: { loanApplicationId },
      order: { createdAt: 'ASC' },
    });
  }

  async findByApplicationAndStep(loanApplicationId: number, step: string): Promise<LoanPaymentStep | null> {
    return await this.repo.findOne({ where: { loanApplicationId, step } });
  }

  async update(id: number, data: Partial<LoanPaymentStep>): Promise<void> {
    await this.repo.update(id, data);
  }

  async findByPaymentId(paymentId: number): Promise<LoanPaymentStep | null> {
    return await this.repo.findOne({ where: { paymentId } });
  }
}
