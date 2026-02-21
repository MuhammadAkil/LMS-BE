import { Request, Response } from 'express';
import { Controller, Post, Get, Req, Res } from 'routing-controllers';
import { RepaymentScheduleService } from '../service/RepaymentScheduleService';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';

/**
 * Repayment Schedule Controller
 * POST /api/repayment/preview    — Preview schedule before loan creation
 * GET  /api/repayment/loan/:id   — Get schedule for existing loan
 */
@Controller('/repayment')
export class RepaymentScheduleController {
  private scheduleService: RepaymentScheduleService;
  private loanRepo: LoanRepository;
  private loanAppRepo: LoanApplicationRepository;

  constructor() {
    this.scheduleService = new RepaymentScheduleService();
    this.loanRepo = new LoanRepository();
    this.loanAppRepo = new LoanApplicationRepository();
  }

  /**
   * POST /api/repayment/preview
   * Preview a repayment schedule before submitting a loan application.
   * Body: { amount, durationMonths?, durationDays?, repaymentType, customInterestRate? }
   */
  @Post('/preview')
  async previewSchedule(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const { amount, durationMonths, durationDays, repaymentType, customInterestRate } = req.body;

      if (!amount || amount <= 0) {
        res.status(400).json({ statusCode: '400', statusMessage: 'Valid amount is required', timestamp: new Date().toISOString() });
        return;
      }

      const schedule = await this.scheduleService.generateSchedule(
        Number(amount),
        Number(durationMonths ?? 0),
        Number(durationDays ?? 0),
        repaymentType ?? 'LUMP_SUM',
        new Date(),
        customInterestRate ? Number(customInterestRate) : undefined
      );

      res.json({
        statusCode: '200',
        statusMessage: 'Schedule preview generated',
        data: schedule,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  /**
   * GET /api/repayment/loan/:loanId
   * Get the repayment schedule for an existing loan.
   */
  @Get('/loan/:loanId')
  async getLoanSchedule(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const loanId = parseInt(req.params.loanId, 10);
      const loan = await this.loanRepo.findById(loanId);
      if (!loan) {
        res.status(404).json({ statusCode: '404', statusMessage: 'Loan not found', timestamp: new Date().toISOString() });
        return;
      }

      const application = await this.loanAppRepo.findById(loan.applicationId);

      const schedule = await this.scheduleService.generateSchedule(
        Number(loan.totalAmount),
        application?.durationMonths ?? 0,
        0,
        loan.repaymentType ?? 'LUMP_SUM',
        loan.createdAt,
        loan.interestRate ? Number(loan.interestRate) : undefined
      );

      res.json({
        statusCode: '200',
        statusMessage: 'OK',
        data: { loanId, ...schedule },
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }
}
