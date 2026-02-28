/**
 * MarketplaceStatsService
 * Dashboard and analytics for marketplace activity
 */

import { AppDataSource } from '../config/database';
import { MarketplaceStatsResponse } from '../dto/MarketplaceDtos';

export class MarketplaceStatsService {
    constructor() { }

    /**
     * Get comprehensive marketplace statistics
     * 
     * Metrics:
     * - Total active loans
     * - Total bids (and by status)
     * - Total funding volume
     * - Average time to fund
     * - Lender/company participation
     */
    async getMarketplaceStats(): Promise<MarketplaceStatsResponse> {
        const result = await AppDataSource.query(
            `SELECT 
         COUNT(DISTINCT lr.id) AS total_active_loans,
         COUNT(DISTINCT CASE WHEN mb.status IN ('ACTIVE', 'PARTIALLY_FILLED') THEN mb.id END) AS total_bids,
         COUNT(DISTINCT CASE WHEN mb.status = 'FILLED' THEN mb.id END) AS total_bids_filled,
         SUM(CASE WHEN mb.status IN ('ACTIVE', 'PARTIALLY_FILLED', 'FILLED') THEN mb.bid_amount ELSE 0 END) AS total_funding_volume,
         COUNT(DISTINCT mb.lender_id) AS lender_participation_count,
         COUNT(DISTINCT mb.company_id) AS company_participation_count,
         AVG(TIMESTAMPDIFF(HOUR, lr.created_at, lr.updated_at)) AS average_funding_time_hours
       FROM loan_requests lr
       LEFT JOIN marketplace_bids mb ON lr.id = mb.loan_request_id
       WHERE lr.status IN ('OPEN', 'BIDDING', 'FUNDED', 'CLOSING')`,
        );

        const row = result[0];
        return {
            total_active_loans: row.total_active_loans || 0,
            total_bids: row.total_bids || 0,
            total_bids_filled: row.total_bids_filled || 0,
            total_funding_volume: row.total_funding_volume || 0,
            average_funding_time_hours: row.average_funding_time_hours || 0,
            lender_participation_count: row.lender_participation_count || 0,
            company_participation_count: row.company_participation_count || 0,
        };
    }

    /**
     * Get top lenders by bid volume
     */
    async getTopLenders(limit: number = 10): Promise<any[]> {
        return AppDataSource.query(
            `SELECT 
         mb.lender_id,
         CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS lender_name,
         u.email AS lender_email,
         COUNT(DISTINCT mb.id) AS bid_count,
         SUM(mb.bid_amount) AS total_bid_volume,
         SUM(mb.allocated_amount) AS total_allocated
       FROM marketplace_bids mb
       JOIN users u ON mb.lender_id = u.id
       WHERE mb.lender_id IS NOT NULL
       GROUP BY mb.lender_id
       ORDER BY SUM(mb.bid_amount) DESC
       LIMIT ?`,
            [limit],
        );
    }

    /**
     * Get top companies by bid volume
     */
    async getTopCompanies(limit: number = 10): Promise<any[]> {
        return AppDataSource.query(
            `SELECT 
         mb.company_id,
         c.name AS company_name,
         COUNT(DISTINCT mb.id) AS bid_count,
         SUM(mb.bid_amount) AS total_bid_volume,
         SUM(mb.allocated_amount) AS total_allocated
       FROM marketplace_bids mb
       JOIN companies c ON mb.company_id = c.id
       WHERE mb.company_id IS NOT NULL
       GROUP BY mb.company_id
       ORDER BY SUM(mb.bid_amount) DESC
       LIMIT ?`,
            [limit],
        );
    }

    /**
     * Get funding timeline for a specific loan
     */
    async getFundingTimeline(loanRequestId: string): Promise<any[]> {
        return AppDataSource.query(
            `SELECT 
         mb.id,
         mb.bid_amount,
         mb.allocated_amount,
         mb.status,
         CASE WHEN mb.lender_id IS NOT NULL THEN 'LENDER' ELSE 'COMPANY' END AS bidder_type,
         mb.created_at,
         mb.updated_at
       FROM marketplace_bids mb
       WHERE mb.loan_request_id = ?
       ORDER BY mb.created_at ASC`,
            [loanRequestId],
        );
    }

    /**
     * Get bids by status distribution
     */
    async getBidStatusDistribution(): Promise<any[]> {
        return AppDataSource.query(
            `SELECT 
         mb.status,
         COUNT(mb.id) AS bid_count,
         SUM(mb.bid_amount) AS total_volume
       FROM marketplace_bids mb
       GROUP BY mb.status
       ORDER BY bid_count DESC`,
        );
    }

    /**
     * Get loans by status distribution
     */
    async getLoanStatusDistribution(): Promise<any[]> {
        return AppDataSource.query(
            `SELECT 
         lr.status,
         COUNT(lr.id) AS loan_count,
         SUM(lr.amount_requested) AS total_requested,
         SUM(lr.amount_funded) AS total_funded
       FROM loan_requests lr
       GROUP BY lr.status
       ORDER BY loan_count DESC`,
        );
    }

    /**
     * Get funding success rate (loans that reached min threshold)
     */
    async getFundingSuccessRate(): Promise<{ success_rate: number; successful_loans: number; total_loans: number }> {
        const result = await AppDataSource.query(
            `SELECT 
         COUNT(DISTINCT CASE WHEN lr.amount_funded >= lr.min_funding_threshold THEN lr.id END) AS successful_loans,
         COUNT(DISTINCT lr.id) AS total_loans
       FROM loan_requests lr
       WHERE lr.status IN ('FUNDED', 'CLOSING', 'ACTIVE')`,
        );

        const row = result[0];
        const successfulLoans = row.successful_loans || 0;
        const totalLoans = row.total_loans || 0;

        return {
            success_rate: totalLoans > 0 ? (successfulLoans / totalLoans) * 100 : 0,
            successful_loans: successfulLoans,
            total_loans: totalLoans,
        };
    }

    /**
     * Get average bid size
     */
    async getAverageBidSize(): Promise<{ average_bid_size: number; median_bid_size: number }> {
        const result = await AppDataSource.query(
            `SELECT 
         AVG(mb.bid_amount) AS average_bid_size
       FROM marketplace_bids mb
       WHERE mb.status IN ('ACTIVE', 'PARTIALLY_FILLED', 'FILLED')`,
        );

        const averageBidSize = result[0]?.average_bid_size || 0;

        // For median, we'd need a more complex query (depends on MySQL version)
        // This is a simplified version
        const medianResult = await AppDataSource.query(
            `SELECT 
         AVG(md.bid_amount) AS median_bid_size
       FROM (
         SELECT mb.bid_amount,
                ROW_NUMBER() OVER (ORDER BY mb.bid_amount) as row_num,
                COUNT(*) OVER () as total_count
         FROM marketplace_bids mb
         WHERE mb.status IN ('ACTIVE', 'PARTIALLY_FILLED', 'FILLED')
       ) md
       WHERE md.row_num IN (FLOOR((md.total_count+1)/2), CEIL((md.total_count+1)/2))`,
        );

        const medianBidSize = medianResult[0]?.median_bid_size || averageBidSize;

        return {
            average_bid_size: averageBidSize,
            median_bid_size: medianBidSize,
        };
    }
}
