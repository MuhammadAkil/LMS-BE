/**
 * FundingPoolService
 * Real-time tracking of funding pools for loan requests
 * 
 * Responsibilities:
 * - Maintain aggregate pool totals
 * - Update pool when bids are added/withdrawn
 * - Calculate pool coverage %
 * - Provide real-time funding status
 */

import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FundingPool } from '../domain/FundingPool';

@Injectable()
export class FundingPoolService {
    constructor(
        private dataSource: DataSource,
        @InjectRepository(FundingPool)
        private poolRepository: Repository<FundingPool>,
    ) { }

    /**
     * Get or create funding pool for a loan request
     */
    async getOrCreatePool(loanRequestId: string): Promise<FundingPool> {
        let pool = await this.poolRepository.findOne({
            where: { loan_request_id: loanRequestId },
        });

        if (!pool) {
            pool = new FundingPool();
            pool.id = (Math.random() * 10000).toFixed(0).toString();
            pool.loan_request_id = loanRequestId;
            pool.total_pool_amount = 0;
            pool.created_at = new Date();
            pool = await this.poolRepository.save(pool);
        }

        return pool;
    }

    /**
     * Refresh pool total from database
     * Called whenever bids are added/withdrawn
     */
    async refreshPoolTotal(loanRequestId: string): Promise<FundingPool> {
        const pool = await this.getOrCreatePool(loanRequestId);

        // Query sum of all active bids for this loan
        const result = await this.dataSource.query(
            `SELECT COALESCE(SUM(mb.bid_amount), 0) as total
       FROM marketplace_bids mb
       WHERE mb.loan_request_id = ? 
         AND mb.status IN ('ACTIVE', 'PARTIALLY_FILLED', 'FILLED')
         AND mb.locked_funds = TRUE`,
            [loanRequestId],
        );

        pool.total_pool_amount = result[0]?.total || 0;
        return this.poolRepository.save(pool);
    }

    /**
     * Get current pool total
     */
    async getPoolTotal(loanRequestId: string): Promise<number> {
        const pool = await this.getOrCreatePool(loanRequestId);
        return pool.total_pool_amount;
    }

    /**
     * Calculate pool coverage percentage
     */
    async getPoolCoverage(loanRequestId: string, amountRequested: number): Promise<number> {
        const pool = await this.getOrCreatePool(loanRequestId);
        if (amountRequested === 0) return 0;
        return (pool.total_pool_amount / amountRequested) * 100;
    }

    /**
     * Generate UUID
     */
    private generateId(): string {
        return (Math.random() * 10000).toFixed(0).toString();
    }
}
