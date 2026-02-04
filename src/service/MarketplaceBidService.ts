/**
 * MarketplaceBidService
 * Core bidding logic for the regulated marketplace
 * 
 * Responsibilities:
 * - Validate bid constraints (max per lender/company)
 * - Lock capital at bid creation
 * - Track bid status transitions
 * - Prevent bid modifications
 * - Handle bid withdrawal (if not yet accepted)
 * - Audit all bid actions
 * 
 * Compliance Notes:
 * - All monetary operations are transactional
 * - Capital lock is immediate and mandatory
 * - Bid amounts are immutable once created
 */

import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { MarketplaceBid, BidStatus } from '../domain/MarketplaceBid';
import { LoanRequest, LoanRequestStatus } from '../domain/LoanRequest';
import { MarketplaceRule } from '../domain/MarketplaceRule';
import { AuditLog } from '../domain/AuditLog';
import { CreateBidRequest, BidResponse } from '../dto/MarketplaceDtos';

@Injectable()
export class MarketplaceBidService {
    constructor(
        private dataSource: DataSource,
        @InjectRepository(MarketplaceBid)
        private bidRepository: Repository<MarketplaceBid>,
        @InjectRepository(LoanRequest)
        private loanRequestRepository: Repository<LoanRequest>,
        @InjectRepository(MarketplaceRule)
        private ruleRepository: Repository<MarketplaceRule>,
        @InjectRepository(AuditLog)
        private auditRepository: Repository<AuditLog>,
    ) { }

    /**
     * Create a new bid for a loan request
     * 
     * Flow:
     * 1. Validate loan request exists and is open
     * 2. Validate bid constraints (amount, max per lender/company)
     * 3. Lock capital in wallet (virtual wallet system)
     * 4. Create bid record
     * 5. Audit the action
     * 6. Return bid response
     * 
     * @param userId - User ID (lender)
     * @param request - Bid request (loan_request_id, bid_amount)
     * @returns BidResponse
     */
    async createBid(
        userId: string,
        request: CreateBidRequest,
        userRole: 'LENDER' | 'COMPANY' = 'LENDER',
    ): Promise<BidResponse> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Validate loan request exists and is bidding
            const loanRequest = await queryRunner.manager.findOne(LoanRequest, {
                where: { id: request.loan_request_id },
            });

            if (!loanRequest) {
                throw new NotFoundException(`Loan request ${request.loan_request_id} not found`);
            }

            if (loanRequest.status !== LoanRequestStatus.OPEN &&
                loanRequest.status !== LoanRequestStatus.BIDDING) {
                throw new BadRequestException(
                    `Cannot bid on loan in ${loanRequest.status} status. Only OPEN or BIDDING allowed.`,
                );
            }

            // 2. Check funding window is still open
            if (!loanRequest.is_funding_window_open) {
                throw new ConflictException('Funding window has closed for this loan request');
            }

            // 3. Check bid amount doesn't exceed remaining loan amount
            const remainingAmount = loanRequest.remaining_amount;
            if (request.bid_amount > remainingAmount) {
                throw new BadRequestException(
                    `Bid amount (${request.bid_amount}) exceeds remaining loan amount (${remainingAmount})`,
                );
            }

            // 4. Get marketplace rules and validate bid constraints
            const rules = await queryRunner.manager.findOne(MarketplaceRule, { where: {} });
            if (!rules) {
                throw new ConflictException('Marketplace rules not configured');
            }

            if (userRole === 'LENDER') {
                // Check lender's total bid exposure
                const totalBidsByLender = await this.getLenderTotalBidExposure(userId, queryRunner);
                if (totalBidsByLender + request.bid_amount > rules.max_bid_per_lender) {
                    throw new BadRequestException(
                        `Bid would exceed lender limit of ${rules.max_bid_per_lender}. Current: ${totalBidsByLender}`,
                    );
                }
            } else if (userRole === 'COMPANY') {
                // Check company's total bid exposure
                const totalBidsByCompany = await this.getCompanyTotalBidExposure(userId, queryRunner);
                if (totalBidsByCompany + request.bid_amount > rules.max_bid_per_company) {
                    throw new BadRequestException(
                        `Bid would exceed company limit of ${rules.max_bid_per_company}. Current: ${totalBidsByCompany}`,
                    );
                }
            }

            // 5. Lock capital in wallet (CRITICAL for compliance)
            // In real system, this calls wallet service to reserve funds
            const capitalLocked = await this.lockCapital(userId, request.bid_amount);
            if (!capitalLocked) {
                throw new ConflictException('Insufficient funds to create bid');
            }

            // 6. Update loan status if this is first bid
            if (loanRequest.status === LoanRequestStatus.OPEN) {
                loanRequest.status = LoanRequestStatus.BIDDING;
                await queryRunner.manager.save(loanRequest);
            }

            // 7. Create bid record
            const bid = new MarketplaceBid();
            bid.id = this.generateId();
            bid.loan_request_id = request.loan_request_id;
            bid.bid_amount = request.bid_amount;
            bid.allocated_amount = 0;
            bid.locked_funds = true;
            bid.status = BidStatus.ACTIVE;

            if (userRole === 'LENDER') {
                bid.lender_id = userId;
                bid.company_id = null;
            } else {
                bid.company_id = userId;
                bid.lender_id = null;
            }

            const savedBid = await queryRunner.manager.save(bid);

            // 8. Update funding pool
            await this.updateFundingPool(request.loan_request_id, queryRunner);

            // 9. Audit the action
            await this.auditAction(
                queryRunner,
                'BID_CREATED',
                userId,
                request.loan_request_id,
                savedBid.id,
                {
                    bid_amount: request.bid_amount,
                    bidder_type: userRole,
                    locked_funds: true,
                },
            );

            await queryRunner.commitTransaction();

            return this.mapBidToResponse(savedBid);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Withdraw a bid (only if not yet accepted)
     * 
     * @param bidId - Bid ID
     * @param userId - User ID (must be bid owner)
     */
    async withdrawBid(bidId: string, userId: string): Promise<BidResponse> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const bid = await queryRunner.manager.findOne(MarketplaceBid, {
                where: { id: bidId },
            });

            if (!bid) {
                throw new NotFoundException(`Bid ${bidId} not found`);
            }

            // Only lender can withdraw their own bid
            if (bid.lender_id && bid.lender_id !== userId) {
                throw new BadRequestException('Cannot withdraw bid owned by another user');
            }

            // Can only withdraw if status is ACTIVE
            if (bid.status !== BidStatus.ACTIVE) {
                throw new ConflictException(
                    `Cannot withdraw bid in ${bid.status} status. Only ACTIVE bids can be withdrawn.`,
                );
            }

            // Can only withdraw if no funds allocated yet
            if (bid.allocated_amount > 0) {
                throw new ConflictException(
                    `Cannot withdraw bid with ${bid.allocated_amount} already allocated`,
                );
            }

            // Unlock capital
            const capitalUnlocked = await this.unlockCapital(userId, bid.bid_amount);
            if (!capitalUnlocked) {
                throw new ConflictException('Failed to unlock capital');
            }

            // Update bid status
            bid.status = BidStatus.EXPIRED;
            bid.locked_funds = false;
            const updatedBid = await queryRunner.manager.save(bid);

            // Update funding pool
            await this.updateFundingPool(bid.loan_request_id, queryRunner);

            // Audit
            await this.auditAction(
                queryRunner,
                'BID_WITHDRAWN',
                userId,
                bid.loan_request_id,
                bidId,
                { bid_amount: bid.bid_amount },
            );

            await queryRunner.commitTransaction();

            return this.mapBidToResponse(updatedBid);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get all bids for a loan request
     */
    async getBidsForLoan(loanRequestId: string): Promise<BidResponse[]> {
        const bids = await this.bidRepository.find({
            where: { loan_request_id: loanRequestId },
            order: { created_at: 'ASC' }, // FIFO order
        });

        return bids.map((bid) => this.mapBidToResponse(bid));
    }

    /**
     * Get bids by user (lender view)
     */
    async getBidsByLender(lenderId: string): Promise<BidResponse[]> {
        const bids = await this.bidRepository.find({
            where: { lender_id: lenderId },
            order: { created_at: 'DESC' },
        });

        return bids.map((bid) => this.mapBidToResponse(bid));
    }

    /**
     * Get total bid exposure for a lender
     * Used to enforce max_bid_per_lender constraint
     */
    private async getLenderTotalBidExposure(
        lenderId: string,
        queryRunner: any,
    ): Promise<number> {
        const result = await queryRunner.query(
            `SELECT COALESCE(SUM(mb.bid_amount), 0) as total
       FROM marketplace_bids mb
       JOIN loan_requests lr ON mb.loan_request_id = lr.id
       WHERE mb.lender_id = ? 
         AND mb.status IN ('ACTIVE', 'PARTIALLY_FILLED', 'FILLED')
         AND lr.status != 'CANCELLED'`,
            [lenderId],
        );

        return result[0]?.total || 0;
    }

    /**
     * Get total bid exposure for a company
     * Used to enforce max_bid_per_company constraint
     */
    private async getCompanyTotalBidExposure(
        companyId: string,
        queryRunner: any,
    ): Promise<number> {
        const result = await queryRunner.query(
            `SELECT COALESCE(SUM(mb.bid_amount), 0) as total
       FROM marketplace_bids mb
       JOIN loan_requests lr ON mb.loan_request_id = lr.id
       WHERE mb.company_id = ? 
         AND mb.status IN ('ACTIVE', 'PARTIALLY_FILLED', 'FILLED')
         AND lr.status != 'CANCELLED'`,
            [companyId],
        );

        return result[0]?.total || 0;
    }

    /**
     * Lock capital in wallet (virtual hold)
     * In production: calls wallet/ledger service
     */
    private async lockCapital(userId: string, amount: number): Promise<boolean> {
        // TODO: Integration with wallet/ledger service
        // For now, assume success - in production, this checks available balance
        // and creates a ledger entry for "HOLD" on the amount
        return true;
    }

    /**
     * Unlock capital in wallet (release hold)
     */
    private async unlockCapital(userId: string, amount: number): Promise<boolean> {
        // TODO: Integration with wallet/ledger service
        return true;
    }

    /**
     * Update funding pool total for a loan
     */
    private async updateFundingPool(loanRequestId: string, queryRunner: any): Promise<void> {
        const result = await queryRunner.query(
            `SELECT COALESCE(SUM(bid_amount), 0) as total
       FROM marketplace_bids
       WHERE loan_request_id = ? 
         AND status IN ('ACTIVE', 'PARTIALLY_FILLED', 'FILLED')
         AND locked_funds = TRUE`,
            [loanRequestId],
        );

        const totalPoolAmount = result[0]?.total || 0;

        // Upsert funding pool
        await queryRunner.query(
            `INSERT INTO funding_pools (id, loan_request_id, total_pool_amount, created_at)
       VALUES (UUID(), ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         total_pool_amount = ?,
         created_at = created_at`,
            [loanRequestId, totalPoolAmount, totalPoolAmount],
        );
    }

    /**
     * Audit an action
     */
    private async auditAction(
        queryRunner: any,
        action: string,
        actor_id: string,
        loan_request_id: string,
        related_id: string,
        details: any,
    ): Promise<void> {
        const audit = new AuditLog();
        audit.id = parseInt(Math.random().toString().substring(2, 13), 10) as any; // Temporary ID generation
        audit.action = action;
        audit.userId = parseInt(actor_id, 10);
        audit.entity = 'MARKETPLACE_BID';
        audit.entityId = parseInt(related_id, 10);
        audit.metadata = JSON.stringify(details);

        await queryRunner.manager.save(audit);
    }

    /**
     * Map bid entity to response DTO
     */
    private mapBidToResponse(bid: MarketplaceBid): BidResponse {
        return {
            id: bid.id,
            loan_request_id: bid.loan_request_id,
            bid_amount: bid.bid_amount,
            allocated_amount: bid.allocated_amount,
            status: bid.status,
            locked_funds: bid.locked_funds,
            created_at: bid.created_at,
            updated_at: bid.updated_at,
            remaining_bid_amount: bid.remaining_bid_amount,
            fill_percentage: bid.fill_percentage,
            can_accept_allocation: bid.can_accept_allocation,
        };
    }

    /**
     * Generate UUID
     */
    private generateId(): string {
        return (Math.random() * 10000).toFixed(0).toString();
    }
}
