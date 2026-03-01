import { InterestRateService } from './InterestRateService';

export interface RepaymentInstallment {
  installmentNumber: number;
  dueDate: string; // ISO date
  principal: number;
  interest: number;
  totalAmount: number;
  status: string; // PENDING
}

export interface RepaymentSchedule {
  loanId?: number;
  applicationId?: number;
  repaymentType: string;
  totalAmount: number;
  totalPrincipal: number;
  totalInterest: number;
  installments: RepaymentInstallment[];
}

export class RepaymentScheduleService {
  private interestRateService: InterestRateService;

  constructor() {
    this.interestRateService = new InterestRateService();
  }

  /**
   * Generate repayment schedule for a loan.
   * @param principal - loan amount in PLN
   * @param durationMonths - loan term in months (0 for day-based)
   * @param durationDays - loan term in days (used when durationMonths=0)
   * @param repaymentType - LUMP_SUM | INSTALLMENTS
   * @param startDate - disbursement date
   * @param customInterestRate - override rate (optional, uses current rate if not provided)
   */
  async generateSchedule(
    principal: number,
    durationMonths: number,
    durationDays: number,
    repaymentType: string,
    startDate: Date,
    customInterestRate?: number
  ): Promise<RepaymentSchedule> {
    const annualRate = customInterestRate ?? await this.interestRateService.getCurrentRate();

    if (repaymentType === 'LUMP_SUM') {
      return this.generateLumpSumSchedule(principal, durationMonths, durationDays, annualRate, startDate);
    }
    return this.generateInstallmentSchedule(principal, durationMonths, annualRate, startDate);
  }

  /**
   * Lump sum: single payment of principal + total interest at maturity.
   * Interest = principal * annualRate * (days/365)
   */
  private generateLumpSumSchedule(
    principal: number,
    durationMonths: number,
    durationDays: number,
    annualRate: number,
    startDate: Date
  ): RepaymentSchedule {
    const dueDate = new Date(startDate);
    let days: number;

    if (durationDays > 0) {
      days = durationDays;
      dueDate.setDate(dueDate.getDate() + durationDays);
    } else {
      dueDate.setMonth(dueDate.getMonth() + durationMonths);
      days = Math.round((dueDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    const interest = this.round(principal * annualRate * (days / 365));
    const total = this.round(principal + interest);

    return {
      repaymentType: 'LUMP_SUM',
      totalAmount: total,
      totalPrincipal: principal,
      totalInterest: interest,
      installments: [
        {
          installmentNumber: 1,
          dueDate: dueDate.toISOString().split('T')[0],
          principal: this.round(principal),
          interest: interest,
          totalAmount: total,
          status: 'PENDING',
        },
      ],
    };
  }

  /**
   * Equal installments: principal divided equally, interest calculated on remaining balance.
   * Monthly interest = remainingBalance * (annualRate / 12)
   */
  private generateInstallmentSchedule(
    principal: number,
    durationMonths: number,
    annualRate: number,
    startDate: Date
  ): RepaymentSchedule {
    const monthlyRate = annualRate / 12;
    const principalPerInstallment = this.round(principal / durationMonths);
    const installments: RepaymentInstallment[] = [];

    let remainingBalance = principal;
    let totalInterest = 0;

    for (let i = 1; i <= durationMonths; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      const interest = this.round(remainingBalance * monthlyRate);
      // Last installment absorbs rounding difference
      const principalThisMonth = i === durationMonths
        ? this.round(remainingBalance)
        : principalPerInstallment;

      const total = this.round(principalThisMonth + interest);
      totalInterest += interest;
      remainingBalance = this.round(remainingBalance - principalThisMonth);

      installments.push({
        installmentNumber: i,
        dueDate: dueDate.toISOString().split('T')[0],
        principal: principalThisMonth,
        interest,
        totalAmount: total,
        status: 'PENDING',
      });
    }

    return {
      repaymentType: 'INSTALLMENTS',
      totalAmount: this.round(principal + totalInterest),
      totalPrincipal: principal,
      totalInterest: this.round(totalInterest),
      installments,
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
