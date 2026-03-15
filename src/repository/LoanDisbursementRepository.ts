import { AppDataSource } from '../config/database';
import { LoanDisbursement } from '../domain/LoanDisbursement';

export class LoanDisbursementRepository {
  private repo = AppDataSource.getRepository(LoanDisbursement);

  async save(disbursement: LoanDisbursement): Promise<LoanDisbursement> {
    return this.repo.save(disbursement);
  }

  async findByLoanId(loanId: number): Promise<LoanDisbursement | null> {
    return this.repo.findOne({
      where: { loanId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: number): Promise<LoanDisbursement | null> {
    return this.repo.findOne({ where: { id } });
  }
}
