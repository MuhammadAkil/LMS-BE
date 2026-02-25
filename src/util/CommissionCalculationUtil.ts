/**
 * Shared commission calculation for management company.
 * Pro-rated to calendar year; handles mid-year start, termination, and mid-year amount change.
 * LOGIC INFERRED: Annual payout on Jan 5 for full-year; on termination for terminated agreements.
 */

export interface CommissionPeriod {
    start: Date;
    end: Date;
    managedAmount: number;
    annualRate: number; // e.g. 0.02 for 2%
}

/**
 * Compute months active in a given year (for pro-rating). Uses full month if any part of month is active.
 */
function monthsActiveInYear(periodStart: Date, periodEnd: Date, year: number): number {
    const yStart = new Date(year, 0, 1);
    const yEnd = new Date(year, 11, 31);
    const start = periodStart > yStart ? periodStart : yStart;
    const end = periodEnd < yEnd ? periodEnd : yEnd;
    if (start > end) return 0;
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    return Math.max(0, Math.min(12, months));
}

/**
 * Single period: commission = managedAmount * annualRate * (months/12)
 */
export function commissionForPeriod(managedAmount: number, annualRate: number, monthsActive: number): number {
    if (monthsActive <= 0) return 0;
    return Math.round((managedAmount * annualRate * (monthsActive / 12)) * 100) / 100;
}

/**
 * Commission for one lender in a calendar year with possible mid-year amount change.
 * agreementStart, agreementEnd (null if active), and segments of { date, amount } for amount changes.
 * Simplified: one amount for the year from start to end (or year boundaries).
 */
export function commissionForLenderInYear(
    managedAmount: number,
    annualRate: number,
    agreementStart: Date,
    agreementEnd: Date | null,
    year: number
): number {
    const periodEnd = agreementEnd || new Date(year, 11, 31);
    const periodStart = agreementStart > new Date(year, 0, 1) ? agreementStart : new Date(year, 0, 1);
    if (periodStart > periodEnd) return 0;
    const months = monthsActiveInYear(periodStart, periodEnd, year);
    return commissionForPeriod(managedAmount, annualRate, months);
}

/**
 * Sum commissions for current year to date (for dashboard "commissions accrued").
 * lenders: { lenderId, managedAmount, agreementStart, agreementEnd? }[], company rate.
 */
export function sumAccruedCommissionsCurrentYear(
    lenders: Array<{ managedAmount: number; agreementStart: Date; agreementEnd?: Date | null }>,
    annualRate: number
): number {
    const year = new Date().getFullYear();
    let sum = 0;
    for (const l of lenders) {
        sum += commissionForLenderInYear(
            l.managedAmount,
            annualRate,
            l.agreementStart,
            l.agreementEnd ?? null,
            year
        );
    }
    return Math.round(sum * 100) / 100;
}
