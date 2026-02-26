import { AppDataSource } from '../config/database';
import { Loan } from '../domain/Loan';
import { User } from '../domain/User';
import { AdminAuditService } from './AdminAuditService';

export interface LoanListItemDto {
  id: number;
  borrowerId: number;
  borrowerEmail: string;
  totalAmount: number;
  fundedAmount: number;
  fundedPercentage: number;
  statusId: number;
  statusName: string;
  dueDate: Date;
  createdAt: Date;
  defaultDays?: number;
}

export interface LoanDetailDto extends LoanListItemDto {
  applicationId: number;
  interventionNotes?: string;
}

export interface AddInterventionNoteRequest {
  note: string;
}

export interface AdminLoansListResponse {
  data: LoanListItemDto[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_NAMES: Record<number, string> = {
  1: 'active',
  2: 'completed',
  3: 'defaulted',
  4: 'suspended',
};

export class AdminLoansService {
  private readonly loanRepo = AppDataSource.getRepository(Loan);
  private readonly userRepo = AppDataSource.getRepository(User);
  private readonly auditService = new AdminAuditService();

  async getAllLoans(
    limit: number = 20,
    offset: number = 0,
    statusId?: number,
    search?: string
  ): Promise<AdminLoansListResponse> {
    const qb = this.loanRepo
      .createQueryBuilder('loan')
      .leftJoin(User, 'borrower', 'borrower.id = loan.borrowerId')
      .select([
        'loan.id',
        'loan.borrowerId',
        'borrower.email AS borrowerEmail',
        'loan.totalAmount',
        'loan.fundedAmount',
        'loan.statusId',
        'loan.dueDate',
        'loan.createdAt',
      ]);

    if (statusId !== undefined) {
      qb.andWhere('loan.statusId = :statusId', { statusId });
    }

    if (search) {
      qb.andWhere(
        '(borrower.email LIKE :search OR CAST(loan.id AS CHAR) LIKE :search)',
        { search: `%${search}%` }
      );
    }

    const total = await qb.getCount();
    const rawLoans = await qb.limit(limit).offset(offset).getRawMany();

    const now = new Date();
    const data: LoanListItemDto[] = rawLoans.map((r) => {
      const dueDate = new Date(r.loan_dueDate || r.dueDate);
      const defaultDays =
        r.loan_statusId === 3 && dueDate < now
          ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : undefined;

      const totalAmount = parseFloat(r.loan_totalAmount || r.totalAmount || '0');
      const fundedAmount = parseFloat(r.loan_fundedAmount || r.fundedAmount || '0');

      return {
        id: r.loan_id || r.id,
        borrowerId: r.loan_borrowerId || r.borrowerId,
        borrowerEmail: r.borrowerEmail || '',
        totalAmount,
        fundedAmount,
        fundedPercentage: totalAmount > 0 ? Math.round((fundedAmount / totalAmount) * 100) : 0,
        statusId: r.loan_statusId || r.statusId,
        statusName: STATUS_NAMES[r.loan_statusId || r.statusId] || 'unknown',
        dueDate,
        createdAt: new Date(r.loan_createdAt || r.createdAt),
        defaultDays,
      };
    });

    return { data, total, limit, offset };
  }

  async getLoanById(loanId: number): Promise<LoanDetailDto> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) {
      throw new Error(`Loan ${loanId} not found`);
    }

    const borrower = await this.userRepo.findOne({ where: { id: loan.borrowerId } });
    const now = new Date();
    const dueDate = new Date(loan.dueDate);
    const defaultDays =
      loan.statusId === 3 && dueDate < now
        ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : undefined;

    const totalAmount = parseFloat(loan.totalAmount as any);
    const fundedAmount = parseFloat(loan.fundedAmount as any);

    return {
      id: loan.id,
      applicationId: loan.applicationId,
      borrowerId: loan.borrowerId,
      borrowerEmail: borrower?.email || '',
      totalAmount,
      fundedAmount,
      fundedPercentage: totalAmount > 0 ? Math.round((fundedAmount / totalAmount) * 100) : 0,
      statusId: loan.statusId,
      statusName: STATUS_NAMES[loan.statusId] || 'unknown',
      dueDate: loan.dueDate,
      createdAt: loan.createdAt,
      defaultDays,
    };
  }

  async addInterventionNote(
    loanId: number,
    request: AddInterventionNoteRequest,
    adminId: number
  ): Promise<{ success: boolean; message: string }> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) {
      throw new Error(`Loan ${loanId} not found`);
    }

    await this.auditService.logAction(
      adminId,
      'LOAN_INTERVENTION_NOTE',
      'LOAN',
      loanId,
      { note: request.note }
    );

    return { success: true, message: 'Intervention note added successfully' };
  }

  async blockBorrower(
    loanId: number,
    adminId: number
  ): Promise<{ success: boolean; message: string }> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) {
      throw new Error(`Loan ${loanId} not found`);
    }

    await this.userRepo.update(loan.borrowerId, { statusId: 3 });

    await this.auditService.logAction(
      adminId,
      'USER_STATUS_CHANGED',
      'USER',
      loan.borrowerId,
      { newStatus: 'BLOCKED', reason: `Blocked via loan ${loanId} monitoring` }
    );

    return { success: true, message: 'Borrower blocked successfully' };
  }

  /** Manually close loan (set statusId 2 = completed). */
  async closeLoan(loanId: number, adminId: number): Promise<{ success: boolean; message: string }> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) throw new Error(`Loan ${loanId} not found`);
    await this.loanRepo.update(loanId, { statusId: 2 });
    await this.auditService.logAction(adminId, 'LOAN_MANUALLY_CLOSED', 'LOAN', loanId, {});
    return { success: true, message: 'Loan closed successfully' };
  }

  /** Mark loan as defaulted (statusId 3) and block borrower. */
  async defaultLoan(loanId: number, adminId: number): Promise<{ success: boolean; message: string }> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) throw new Error(`Loan ${loanId} not found`);
    await this.loanRepo.update(loanId, { statusId: 3 });
    await this.userRepo.update(loan.borrowerId, { statusId: 3 });
    await this.auditService.logAction(adminId, 'LOAN_MARKED_DEFAULTED', 'LOAN', loanId, { borrowerId: loan.borrowerId });
    return { success: true, message: 'Loan marked as defaulted; borrower blocked' };
  }
}
