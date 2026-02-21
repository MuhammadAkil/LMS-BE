import { randomUUID } from 'crypto';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LoanRepository } from '../repository/LoanRepository';
import { PaymentRepository } from '../repository/PaymentRepository';
import { UserRepository } from '../repository/UserRepository';
import { LoanPaymentStepRepository } from '../repository/LoanPaymentStepRepository';
import { CommissionConfigRepository } from '../repository/CommissionConfigRepository';
import { LevelRulesRepository } from '../repository/LevelRulesRepository';
import { Payment } from '../domain/Payment';
import { LoanPaymentStep } from '../domain/LoanPaymentStep';
import { Przelewy24Service } from './Przelewy24Service';
import { LmsNotificationService } from './LmsNotificationService';
import { PdfGenerationService } from './PdfGenerationService';
import { EmailService } from './EmailService';
import { RepaymentScheduleService } from './RepaymentScheduleService';
import { AppDataSource } from '../config/database';
import config from '../config/Config';
import {
  InitiateCommissionPaymentRequest,
  CommissionPaymentStatusDto,
} from '../dto/BorrowerDtos';

const STATUS_PENDING = 1;
const STATUS_PAID = 2;
const PROVIDER_P24 = 1;
const PAYMENT_TYPE_PORTAL_COMMISSION = 3;
const PAYMENT_TYPE_VOLUNTARY_COMMISSION = 4;

export class BorrowerPaymentsService {
  private auditRepo: AuditLogRepository;
  private loanAppRepo: LoanApplicationRepository;
  private loanRepo: LoanRepository;
  private paymentRepo: PaymentRepository;
  private userRepo: UserRepository;
  private paymentStepRepo: LoanPaymentStepRepository;
  private commissionConfigRepo: CommissionConfigRepository;
  private levelRulesRepo: LevelRulesRepository;
  private p24: Przelewy24Service;
  private notificationService: LmsNotificationService;
  private pdfService: PdfGenerationService;
  private emailService: EmailService;
  private scheduleService: RepaymentScheduleService;

  constructor() {
    this.auditRepo = new AuditLogRepository();
    this.loanAppRepo = new LoanApplicationRepository();
    this.loanRepo = new LoanRepository();
    this.paymentRepo = new PaymentRepository();
    this.userRepo = new UserRepository();
    this.paymentStepRepo = new LoanPaymentStepRepository();
    this.commissionConfigRepo = new CommissionConfigRepository();
    this.levelRulesRepo = new LevelRulesRepository();
    this.p24 = new Przelewy24Service();
    this.notificationService = new LmsNotificationService();
    this.pdfService = new PdfGenerationService();
    this.emailService = new EmailService();
    this.scheduleService = new RepaymentScheduleService();
  }

  /**
   * STEP 1: Initiate portal commission payment via Przelewy24.
   * Must be called before voluntary commission.
   */
  async initiateCommissionPayment(
    borrowerId: string,
    request: InitiateCommissionPaymentRequest
  ): Promise<{ redirectUrl: string; paymentId: number; amount: number; step: string }> {
    const borrowerIdNum = parseInt(borrowerId, 10);
    const appIdNum = Number(request.applicationId);

    const application = await this.loanAppRepo.findById(appIdNum);
    if (!application || application.borrowerId !== borrowerIdNum) {
      throw new Error('Application not found');
    }

    if (application.statusId === 4) {
      throw new Error('Application is cancelled');
    }

    // Check if portal commission already paid
    const existingStep = await this.paymentStepRepo.findByApplicationAndStep(appIdNum, 'PORTAL_COMMISSION');
    if (existingStep?.status === 'PAID') {
      throw new Error('Portal commission already paid. Proceed to voluntary commission.');
    }

    // Calculate commission amount
    const borrower = await this.userRepo.findById(borrowerIdNum);
    if (!borrower) throw new Error('Borrower not found');

    const commissionAmount = await this.calculatePortalCommission(
      borrowerIdNum,
      borrower.level ?? 0,
      Number(application.amount)
    );

    const sessionId = randomUUID();
    const appBaseUrl = (config as any).app?.baseUrl ?? 'http://localhost:3009';

    // Create payment record
    const payment = new Payment();
    payment.userId = borrowerIdNum;
    payment.applicationId = appIdNum;
    payment.paymentTypeId = PAYMENT_TYPE_PORTAL_COMMISSION;
    payment.providerId = PROVIDER_P24;
    payment.statusId = STATUS_PENDING;
    payment.amount = commissionAmount;
    payment.sessionId = sessionId;
    payment.paymentStep = 'PORTAL_COMMISSION';

    const savedPayment = await this.paymentRepo.save(payment);

    // Create/update payment step record
    if (existingStep) {
      await this.paymentStepRepo.update(existingStep.id, {
        paymentId: savedPayment.id,
        status: 'PENDING',
        amount: commissionAmount,
      });
    } else {
      const step = new LoanPaymentStep();
      step.loanApplicationId = appIdNum;
      step.step = 'PORTAL_COMMISSION';
      step.paymentId = savedPayment.id;
      step.status = 'PENDING';
      step.amount = commissionAmount;
      await this.paymentStepRepo.save(step);
    }

    // Register with Przelewy24
    const urlReturn = `${appBaseUrl}/payment/commission-success?sessionId=${sessionId}&step=PORTAL_COMMISSION`;
    const urlStatus = `${appBaseUrl.replace(/\/$/, '')}/webhook/p24`;

    const registered = await this.p24.registerTransaction({
      sessionId,
      amount: Math.round(commissionAmount * 100), // grosz
      currency: 'PLN',
      description: `Portal commission - Application #${appIdNum}`,
      email: borrower.email,
      country: 'PL',
      urlReturn,
      urlStatus,
    });

    const redirectUrl = this.p24.getRedirectUrl(registered.token);

    await this.auditRepo.create({
      actorId: borrowerIdNum,
      action: 'PORTAL_COMMISSION_INITIATED',
      entity: 'PAYMENT',
      entityId: savedPayment.id,
      createdAt: new Date(),
    } as any);

    return {
      redirectUrl,
      paymentId: savedPayment.id as number,
      amount: commissionAmount,
      step: 'PORTAL_COMMISSION',
    };
  }

  /**
   * STEP 3: Initiate voluntary commission payment for lender via Przelewy24.
   * Can only be called after portal commission is PAID.
   */
  async initiateVoluntaryCommissionPayment(
    borrowerId: string,
    applicationId: number
  ): Promise<{ redirectUrl: string; paymentId: number; amount: number; step: string }> {
    const borrowerIdNum = parseInt(borrowerId, 10);

    const application = await this.loanAppRepo.findById(applicationId);
    if (!application || application.borrowerId !== borrowerIdNum) {
      throw new Error('Application not found');
    }

    // Enforce strict order: portal commission must be paid first
    const portalStep = await this.paymentStepRepo.findByApplicationAndStep(applicationId, 'PORTAL_COMMISSION');
    if (!portalStep || portalStep.status !== 'PAID') {
      throw new Error('Portal commission must be paid before voluntary commission');
    }

    // Check if voluntary commission already paid
    const voluntaryStep = await this.paymentStepRepo.findByApplicationAndStep(applicationId, 'VOLUNTARY_COMMISSION');
    if (voluntaryStep?.status === 'PAID') {
      throw new Error('Voluntary commission already paid');
    }

    const borrower = await this.userRepo.findById(borrowerIdNum);
    if (!borrower) throw new Error('Borrower not found');

    const voluntaryAmount = Number(application.voluntaryCommission) || 0;
    if (voluntaryAmount <= 0) {
      throw new Error('No voluntary commission configured for this application');
    }

    const sessionId = randomUUID();
    const appBaseUrl = (config as any).app?.baseUrl ?? 'http://localhost:3009';

    const payment = new Payment();
    payment.userId = borrowerIdNum;
    payment.applicationId = applicationId;
    payment.paymentTypeId = PAYMENT_TYPE_VOLUNTARY_COMMISSION;
    payment.providerId = PROVIDER_P24;
    payment.statusId = STATUS_PENDING;
    payment.amount = voluntaryAmount;
    payment.sessionId = sessionId;
    payment.paymentStep = 'VOLUNTARY_COMMISSION';

    const savedPayment = await this.paymentRepo.save(payment);

    if (voluntaryStep) {
      await this.paymentStepRepo.update(voluntaryStep.id, {
        paymentId: savedPayment.id,
        status: 'PENDING',
        amount: voluntaryAmount,
      });
    } else {
      const step = new LoanPaymentStep();
      step.loanApplicationId = applicationId;
      step.step = 'VOLUNTARY_COMMISSION';
      step.paymentId = savedPayment.id;
      step.status = 'PENDING';
      step.amount = voluntaryAmount;
      await this.paymentStepRepo.save(step);
    }

    const urlReturn = `${appBaseUrl}/payment/commission-success?sessionId=${sessionId}&step=VOLUNTARY_COMMISSION`;
    const urlStatus = `${appBaseUrl.replace(/\/$/, '')}/webhook/p24`;

    const registered = await this.p24.registerTransaction({
      sessionId,
      amount: Math.round(voluntaryAmount * 100),
      currency: 'PLN',
      description: `Voluntary lender commission - Application #${applicationId}`,
      email: borrower.email,
      country: 'PL',
      urlReturn,
      urlStatus,
    });

    const redirectUrl = this.p24.getRedirectUrl(registered.token);

    await this.auditRepo.create({
      actorId: borrowerIdNum,
      action: 'VOLUNTARY_COMMISSION_INITIATED',
      entity: 'PAYMENT',
      entityId: savedPayment.id,
      createdAt: new Date(),
    } as any);

    return {
      redirectUrl,
      paymentId: savedPayment.id as number,
      amount: voluntaryAmount,
      step: 'VOLUNTARY_COMMISSION',
    };
  }

  /**
   * Handle P24 webhook for commission payments.
   * Called from the main webhook handler when paymentStep is PORTAL_COMMISSION or VOLUNTARY_COMMISSION.
   */
  async handleCommissionWebhook(sessionId: string, orderId: number, amount: number, sign: string): Promise<void> {
    const payment = await this.paymentRepo.findBySessionId(sessionId);
    if (!payment) throw new Error(`Payment not found for sessionId: ${sessionId}`);

    const amountGrosz = Number(amount);
    const expectedAmount = Math.round(Number(payment.amount) * 100);
    if (amountGrosz !== expectedAmount) {
      throw new Error(`Amount mismatch: expected ${expectedAmount}, got ${amountGrosz}`);
    }

    const isValid = this.p24.verifyWebhookSign(sessionId, orderId, amountGrosz, sign);
    if (!isValid) throw new Error('Invalid webhook signature');

    await this.p24.verifyTransaction({ sessionId, amount: amountGrosz, currency: 'PLN', orderId });

    // Mark payment as PAID
    await this.paymentRepo.update(payment.id as number, {
      statusId: STATUS_PAID,
      paidAt: new Date(),
      providerOrderId: String(orderId),
    });

    // Update payment step
    const step = await this.paymentStepRepo.findByPaymentId(payment.id as number);
    if (step) {
      await this.paymentStepRepo.update(step.id, {
        status: 'PAID',
        paidAt: new Date(),
      });
    }

    const paymentStep = payment.paymentStep;
    const applicationId = payment.applicationId!;

    if (paymentStep === 'PORTAL_COMMISSION') {
      await this.onPortalCommissionPaid(applicationId, payment.userId);
    } else if (paymentStep === 'VOLUNTARY_COMMISSION') {
      await this.onVoluntaryCommissionPaid(applicationId, payment.userId);
    }
  }

  /**
   * STEP 2: Called after portal commission is paid.
   * Updates application commission_status.
   */
  private async onPortalCommissionPaid(applicationId: number, borrowerId: number): Promise<void> {
    await this.loanAppRepo.update(applicationId, { commissionStatus: 'PAID' } as any);

    await this.notificationService.notify(
      borrowerId,
      'PORTAL_COMMISSION_PAID',
      'Portal Commission Paid',
      'Your portal commission has been paid. Please proceed to pay the voluntary lender commission.',
      { applicationId: String(applicationId) }
    );

    await this.auditRepo.create({
      actorId: borrowerId,
      action: 'PORTAL_COMMISSION_PAID',
      entity: 'APPLICATION',
      entityId: applicationId,
      createdAt: new Date(),
    } as any);
  }

  /**
   * STEP 4: Called after voluntary commission is paid.
   * - Generates PDF agreement
   * - Emails agreement to borrower and lender
   * - Reveals borrower bank details to lender in portal
   */
  private async onVoluntaryCommissionPaid(applicationId: number, borrowerId: number): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const application = await this.loanAppRepo.findById(applicationId);
      if (!application) throw new Error('Application not found');

      const loan = await this.loanRepo.findByApplicationId(applicationId);
      if (!loan) throw new Error('Loan not found for application');

      const borrower = await this.userRepo.findById(borrowerId);
      if (!borrower) throw new Error('Borrower not found');

      // Get lender (first offer lender as primary)
      const lenderResult = await queryRunner.query(
        `SELECT u.id, u.email, u.first_name, u.last_name
         FROM loan_offers lo
         JOIN users u ON u.id = lo.lender_id
         WHERE lo.loan_id = ?
         ORDER BY lo.created_at ASC
         LIMIT 1`,
        [loan.id]
      );
      const lender = lenderResult[0];

      // Generate repayment schedule for PDF
      const schedule = await this.scheduleService.generateSchedule(
        Number(loan.totalAmount),
        Number(application.durationMonths),
        0,
        loan.repaymentType ?? 'LUMP_SUM',
        new Date(),
        loan.interestRate ? Number(loan.interestRate) : undefined
      );

      // Build PDF data
      const agreementData = {
        loanId: loan.id,
        applicationId,
        borrowerName: `${borrower.firstName ?? ''} ${borrower.lastName ?? ''}`.trim() || borrower.email,
        borrowerEmail: borrower.email,
        borrowerBankAccount: borrower.bankAccount,
        borrowerPesel: borrower.pesel,
        borrowerAddress: borrower.address,
        lenderName: lender ? `${lender.first_name ?? ''} ${lender.last_name ?? ''}`.trim() || lender.email : 'Lender',
        lenderEmail: lender?.email ?? '',
        loanAmount: Number(loan.totalAmount),
        durationMonths: Number(application.durationMonths),
        interestRate: loan.interestRate ? Number(loan.interestRate) : 0.075,
        repaymentType: loan.repaymentType ?? 'LUMP_SUM',
        voluntaryCommission: Number(application.voluntaryCommission),
        portalCommission: Number(application.amount) * 0.02,
        disbursementDate: new Date().toISOString().split('T')[0],
        dueDate: loan.dueDate instanceof Date
          ? loan.dueDate.toISOString().split('T')[0]
          : String(loan.dueDate),
        repaymentSchedule: schedule.installments.map(i => ({
          installmentNumber: i.installmentNumber,
          dueDate: i.dueDate,
          totalAmount: i.totalAmount,
        })),
      };

      // Generate PDF
      const pdfBuffer = await this.pdfService.generateLoanAgreementBuffer(agreementData);

      // Save contract record
      await queryRunner.query(
        `INSERT INTO contracts (loan_id, pdf_path, generated_at) VALUES (?, ?, NOW())`,
        [loan.id, `generated_pdfs/loan_agreement_${loan.id}.pdf`]
      );

      // Reveal borrower data to lender
      await queryRunner.query(
        `UPDATE loans SET lender_data_revealed = TRUE, lender_data_revealed_at = NOW() WHERE id = ?`,
        [loan.id]
      );

      await queryRunner.commitTransaction();

      // Send emails (outside transaction — non-critical)
      try {
        await this.emailService.sendLoanAgreementEmail(
          borrower.email,
          lender?.email ?? '',
          agreementData,
          pdfBuffer
        );
      } catch (emailErr) {
        console.error('Email sending failed (non-critical):', emailErr);
      }

      // Notify both parties in-app
      await this.notificationService.notify(
        borrowerId,
        'LOAN_AGREEMENT_GENERATED',
        'Loan Agreement Ready',
        'Your loan agreement has been generated and sent to your email.',
        { loanId: String(loan.id) }
      );

      if (lender) {
        await this.notificationService.notify(
          lender.id,
          'BORROWER_DATA_REVEALED',
          'Borrower Data Available',
          'The borrower\'s bank details and personal data are now available in the portal.',
          { loanId: String(loan.id) }
        );
      }

      await this.auditRepo.create({
        actorId: borrowerId,
        action: 'VOLUNTARY_COMMISSION_PAID_AGREEMENT_GENERATED',
        entity: 'LOAN',
        entityId: loan.id,
        createdAt: new Date(),
      } as any);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get all payment steps for an application.
   */
  async getPaymentSteps(borrowerId: string, applicationId: number): Promise<any[]> {
    const borrowerIdNum = parseInt(borrowerId, 10);
    const application = await this.loanAppRepo.findById(applicationId);
    if (!application || application.borrowerId !== borrowerIdNum) {
      throw new Error('Application not found');
    }

    const steps = await this.paymentStepRepo.findByApplicationId(applicationId);
    return steps.map(s => ({
      step: s.step,
      status: s.status,
      amount: s.amount,
      paidAt: s.paidAt?.toISOString(),
    }));
  }

  /**
   * Get payment status by payment ID.
   */
  async getPaymentStatus(borrowerId: string, paymentId: string): Promise<CommissionPaymentStatusDto> {
    const borrowerIdNum = parseInt(borrowerId, 10);
    const paymentIdNum = parseInt(paymentId, 10);

    const payment = await this.paymentRepo.findById(paymentIdNum);
    if (!payment || payment.userId !== borrowerIdNum) {
      throw new Error('Payment not found');
    }

    const statusCode = payment.statusId === STATUS_PAID ? 'PAID'
      : payment.statusId === STATUS_PENDING ? 'PENDING' : 'UNKNOWN';

    return {
      paymentId: payment.id as number,
      applicationId: payment.applicationId ?? 0,
      amount: Number(payment.amount),
      status: statusCode,
      paymentMethod: 'PRZELEWY24',
      createdAt: payment.createdAt.toISOString(),
      completedAt: payment.paidAt?.toISOString(),
    };
  }

  /**
   * Set voluntary commission amount for a loan application.
   * Borrower defines how much voluntary commission to offer the lender.
   */
  async setVoluntaryCommission(borrowerId: string, applicationId: number, amount: number): Promise<void> {
    const borrowerIdNum = parseInt(borrowerId, 10);
    const application = await this.loanAppRepo.findById(applicationId);
    if (!application || application.borrowerId !== borrowerIdNum) {
      throw new Error('Application not found');
    }
    if (application.statusId === 4) throw new Error('Application is cancelled');
    if (amount < 0) throw new Error('Voluntary commission cannot be negative');

    await this.loanAppRepo.update(applicationId, { voluntaryCommission: amount } as any);

    await this.auditRepo.create({
      actorId: borrowerIdNum,
      action: 'VOLUNTARY_COMMISSION_SET',
      entity: 'APPLICATION',
      entityId: applicationId,
      createdAt: new Date(),
    } as any);
  }

  private async calculatePortalCommission(borrowerId: number, level: number, loanAmount: number): Promise<number> {
    // Try commission config table first
    const config = await this.commissionConfigRepo.findApplicablePortalCommission(level, loanAmount);
    if (config) {
      return Math.round(loanAmount * Number(config.commissionPct) * 100) / 100;
    }

    // Fallback to level_rules
    const levelRules = await this.levelRulesRepo.findByLevel(level);
    const rate = levelRules?.commissionPercent ?? 2;
    return Math.round(loanAmount * (rate / 100) * 100) / 100;
  }

  async handlePaymentCallback(paymentId: number, status: string, signature: string, amount: number): Promise<void> {
    // Legacy stub — actual handling is done via handleCommissionWebhook
  }
}
