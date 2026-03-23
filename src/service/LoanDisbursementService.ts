import { LoanDisbursement, DisbursementSenderType } from '../domain/LoanDisbursement';
import { LoanDisbursementRepository } from '../repository/LoanDisbursementRepository';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { LmsNotificationService } from './LmsNotificationService';
import { AppDataSource } from '../config/database';

export interface ConfirmDisbursementRequest {
  amount: number;
  transferDate: string; // YYYY-MM-DD
  referenceNumber?: string;
}

export interface DisbursementDto {
  id: number;
  loanId: number;
  senderType: DisbursementSenderType;
  amount: number;
  transferDate: string;
  referenceNumber?: string;
  confirmedAt: string;
}

/**
 * Loan disbursement is off-platform: manual bank transfer.
 * Sender can be (a) lender directly to borrower, or (b) company on behalf of lender.
 * One disbursement record per loan; lender or company confirms the transfer.
 */
export class LoanDisbursementService {
  private disbursementRepo: LoanDisbursementRepository;
  private loanRepo: LoanRepository;
  private offerRepo: LoanOfferRepository;
  private notificationService: LmsNotificationService;

  constructor() {
    this.disbursementRepo = new LoanDisbursementRepository();
    this.loanRepo = new LoanRepository();
    this.offerRepo = new LoanOfferRepository();
    this.notificationService = new LmsNotificationService();
  }

  /**
   * Confirm disbursement by lender (direct bank transfer to borrower).
   * Lender must have a loan_offer on this loan.
   */
  async confirmByLender(lenderId: number, loanId: number, body: ConfirmDisbursementRequest): Promise<DisbursementDto> {
    const offer = await this.offerRepo.findByLoanIdAndLenderId(loanId, lenderId);
    if (!offer) throw new Error('Loan not found or you do not have an offer on this loan');

    const loan = await this.loanRepo.findById(loanId);
    if (!loan) throw new Error('Loan not found');

    const existing = await this.disbursementRepo.findByLoanId(loanId);
    if (existing) throw new Error('A disbursement has already been recorded for this loan');

    const d = new LoanDisbursement();
    d.loanId = loanId;
    d.senderType = 'LENDER';
    d.amount = body.amount;
    d.transferDate = new Date(body.transferDate);
    d.referenceNumber = body.referenceNumber ?? undefined;
    d.confirmedByLenderId = lenderId;
    const saved = await this.disbursementRepo.save(d);

    await this.notificationService.notify(
      Number(loan.borrowerId),
      'DISBURSEMENT_CONFIRMED',
      'Loan funds sent',
      `The lender has confirmed a bank transfer of ${body.amount} PLN for your loan (ref: ${body.referenceNumber || 'N/A'}). Funds are sent off-platform via manual bank transfer.`,
      { loanId: String(loanId), amount: body.amount, senderType: 'LENDER' }
    );

    return this.toDto(saved);
  }

  /**
   * Confirm disbursement by company (on behalf of lender via bank transfer).
   * Company must have access to the loan via company_lenders for the lender that has the offer.
   */
  async confirmByCompany(companyId: number, loanId: number, body: ConfirmDisbursementRequest): Promise<DisbursementDto> {
    const loan = await this.loanRepo.findById(loanId);
    if (!loan) throw new Error('Loan not found');

    const access = await AppDataSource.query(
      `SELECT cl.id FROM company_lenders cl
       INNER JOIN loan_offers lo ON lo.lenderId = cl.lenderId AND lo.loanId = ?
       WHERE cl.companyId = ? AND cl.active = true
       LIMIT 1`,
      [loanId, companyId]
    );
    if (!access?.length) throw new Error('Loan not found or your company does not manage the lender for this loan');

    const existing = await this.disbursementRepo.findByLoanId(loanId);
    if (existing) throw new Error('A disbursement has already been recorded for this loan');

    const d = new LoanDisbursement();
    d.loanId = loanId;
    d.senderType = 'COMPANY';
    d.amount = body.amount;
    d.transferDate = new Date(body.transferDate);
    d.referenceNumber = body.referenceNumber ?? undefined;
    d.confirmedByCompanyId = companyId;
    const saved = await this.disbursementRepo.save(d);

    await this.notificationService.notify(
      Number(loan.borrowerId),
      'DISBURSEMENT_CONFIRMED',
      'Loan funds sent',
      `A managing company has confirmed a bank transfer of ${body.amount} PLN for your loan (ref: ${body.referenceNumber || 'N/A'}). Funds are sent off-platform via manual bank transfer on behalf of the lender.`,
      { loanId: String(loanId), amount: body.amount, senderType: 'COMPANY' }
    );

    return this.toDto(saved);
  }

  async getByLoanId(loanId: number): Promise<DisbursementDto | null> {
    try {
      const d = await this.disbursementRepo.findByLoanId(loanId);
      return d ? this.toDto(d) : null;
    } catch (error) {
      // Some dev databases used for smoke runs do not include loan_disbursements yet.
      console.warn('[SMOKE] Loan disbursement lookup skipped:', (error as Error).message);
      return null;
    }
  }

  private toDto(d: LoanDisbursement): DisbursementDto {
    return {
      id: Number(d.id),
      loanId: d.loanId,
      senderType: d.senderType,
      amount: Number(d.amount),
      transferDate: d.transferDate instanceof Date ? d.transferDate.toISOString().split('T')[0] : String(d.transferDate),
      referenceNumber: d.referenceNumber ?? undefined,
      confirmedAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    };
  }
}
