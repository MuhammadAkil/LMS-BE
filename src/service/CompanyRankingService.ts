import { AppDataSource } from '../config/database';
import { CompanyRepository } from '../repository/CompanyRepository';

/**
 * Company Ranking Service
 * Auto-computes company rank based on (a) total value of funds managed, (b) account tenure/age.
 * Rank is 1-based (1 = highest). No manual assignment; rank updates when funds or tenure change.
 */
export class CompanyRankingService {
  private readonly companyRepo: CompanyRepository;

  constructor() {
    this.companyRepo = new CompanyRepository();
  }

  /**
   * Recompute and persist rank for all approved companies.
   * Call after: company approval, agreement sign, lender link/update/toggle/terminate.
   */
  async recomputeAllRanks(): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    try {
      const rows = await queryRunner.query(
        `
        SELECT 
          c.id,
          c.approved_at AS approvedAt,
          c.created_at AS createdAt,
          COALESCE(
            (SELECT SUM(ma.amount) FROM management_agreements ma 
             WHERE ma.companyId = c.id AND ma.signedAt IS NOT NULL 
             AND (ma.terminated_at IS NULL OR ma.terminated_at > NOW())),
            0
          ) AS managedFromAgreements,
          COALESCE(
            (SELECT SUM(cl.amountLimit) FROM company_lenders cl 
             WHERE cl.companyId = c.id AND cl.active = 1),
            0
          ) AS lenderLimitSum
        FROM companies c
        WHERE c.status_id = 2
        ORDER BY c.id
        `
      );

      if (!rows || rows.length === 0) {
        await this.clearRanksForApproved(queryRunner);
        return;
      }

      const now = new Date();
      const scored = rows.map((r: any) => {
        const managedFunds =
          parseFloat(r.managedFromAgreements || 0) > 0
            ? parseFloat(r.managedFromAgreements)
            : parseFloat(r.lenderLimitSum || 0);
        const refDate = r.approvedAt ? new Date(r.approvedAt) : new Date(r.createdAt);
        const tenureDays = Math.max(0, Math.floor((now.getTime() - refDate.getTime()) / (24 * 60 * 60 * 1000)));
        const fundsScore = Math.log10(1 + managedFunds) * 100;
        const tenureScore = Math.min(tenureDays, 365) * 0.5;
        const score = fundsScore + tenureScore;
        return { id: r.id, score };
      });

      scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
      const rankByCompanyId: Record<number, number> = {};
      scored.forEach((s: { id: number }, i: number) => {
        rankByCompanyId[s.id] = i + 1;
      });

      for (const r of scored) {
        await queryRunner.query(`UPDATE companies SET rank = ? WHERE id = ?`, [rankByCompanyId[r.id], r.id]);
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async clearRanksForApproved(queryRunner: any): Promise<void> {
    await queryRunner.query(`UPDATE companies SET rank = NULL WHERE status_id = 2`);
  }
}
