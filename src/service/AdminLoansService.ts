import { AppDataSource } from '../config/database';
import { Loan } from '../domain/Loan';
import { User } from '../domain/User';
import { AdminAuditService } from './AdminAuditService';

export interface LoanListItemDto {
  id: number;
  borrowerId: number;
  borrowerEmail: string;
  borrowerName?: string;
  totalAmount: number;
  fundedAmount: number;
  fundedPercentage: number;
  statusId: number;
  statusName: string;
  dueDate: Date;
  createdAt: Date;
  defaultDays?: number;
  lenders?: string[];
}

export interface LoanDetailDto extends LoanListItemDto {
  applicationId: number;
  interventionNotes?: string;
  borrowerName?: string;
  lenders?: string[];
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
    const conditions: string[] = [];
    const params: any[] = [];

    if (statusId !== undefined) {
      conditions.push('l.statusId = ?');
      params.push(statusId);
    }

    if (search) {
      conditions.push('(u.email LIKE ? OR CAST(l.id AS CHAR) LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countRow] = await AppDataSource.query(
      `SELECT COUNT(*) AS total FROM loans l LEFT JOIN users u ON l.borrowerId = u.id ${where}`,
      params
    );
    const total = Number(countRow.total);

    const rawLoans = await AppDataSource.query(
      `SELECT
        l.id, l.borrowerId, l.totalAmount, l.fundedAmount, l.statusId, l.dueDate, l.createdAt,
        u.email AS borrowerEmail,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS borrowerName,
        (SELECT GROUP_CONCAT(lu.email SEPARATOR ', ')
          FROM loan_offers lo LEFT JOIN users lu ON lo.lenderId = lu.id
          WHERE lo.loanId = l.id) AS lenders
      FROM loans l
      LEFT JOIN users u ON l.borrowerId = u.id
      ${where}
      ORDER BY l.createdAt DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const now = new Date();
    const data: LoanListItemDto[] = rawLoans.map((r: any) => {
      const dueDate = new Date(r.dueDate);
      const statusId = Number(r.statusId);
      const defaultDays =
        statusId === 3 && dueDate < now
          ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : undefined;

      const totalAmount = parseFloat(r.totalAmount || '0');
      const fundedAmount = parseFloat(r.fundedAmount || '0');

      return {
        id: Number(r.id),
        borrowerId: Number(r.borrowerId),
        borrowerEmail: r.borrowerEmail || '',
        borrowerName: (r.borrowerName || '').trim() || undefined,
        totalAmount,
        fundedAmount,
        fundedPercentage: totalAmount > 0 ? Math.round((fundedAmount / totalAmount) * 100) : 0,
        statusId,
        statusName: STATUS_NAMES[statusId] || 'unknown',
        dueDate,
        createdAt: new Date(r.createdAt),
        defaultDays,
        lenders: r.lenders ? (r.lenders as string).split(', ') : [],
      };
    });

    return { data, total, limit, offset };
  }

  async getLoanById(loanId: number): Promise<LoanDetailDto> {
    const [row] = await AppDataSource.query(
      `SELECT
        l.id, l.applicationId, l.borrowerId, l.totalAmount, l.fundedAmount, l.statusId, l.dueDate, l.createdAt,
        u.email AS borrowerEmail,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS borrowerName,
        (SELECT GROUP_CONCAT(lu.email SEPARATOR ', ')
          FROM loan_offers lo LEFT JOIN users lu ON lo.lenderId = lu.id
          WHERE lo.loanId = l.id) AS lenders
      FROM loans l
      LEFT JOIN users u ON l.borrowerId = u.id
      WHERE l.id = ?`,
      [loanId]
    );

    if (!row) {
      throw new Error(`Loan ${loanId} not found`);
    }

    const now = new Date();
    const dueDate = new Date(row.dueDate);
    const statusId = Number(row.statusId);
    const defaultDays =
      statusId === 3 && dueDate < now
        ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : undefined;

    const totalAmount = parseFloat(row.totalAmount || '0');
    const fundedAmount = parseFloat(row.fundedAmount || '0');

    return {
      id: Number(row.id),
      applicationId: Number(row.applicationId),
      borrowerId: Number(row.borrowerId),
      borrowerEmail: row.borrowerEmail || '',
      borrowerName: (row.borrowerName || '').trim() || undefined,
      totalAmount,
      fundedAmount,
      fundedPercentage: totalAmount > 0 ? Math.round((fundedAmount / totalAmount) * 100) : 0,
      statusId,
      statusName: STATUS_NAMES[statusId] || 'unknown',
      dueDate,
      createdAt: new Date(row.createdAt),
      defaultDays,
      lenders: row.lenders ? (row.lenders as string).split(', ') : [],
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
