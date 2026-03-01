/**
 * FundingAllocationService
 * Handles allocation of bids to loans
 * 
 * Responsibilities:
 * - Allocate bid amounts to loans based on strategy (FIFO, PRO_RATA)
 * - Update bid status based on fill percentage
 * - Update loan funding progress
 * - Check minimum funding threshold
 * - Prevent over-allocation
 * - Audit all allocations
 * 
 * Compliance:
 * - One allocation per bid per loan
 * - Allocations cannot exceed bid amount
 * - Loan status transitions must follow rules
 */

import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { FundingAllocation } from '../domain/FundingAllocation';
import { MarketplaceBid, BidStatus } from '../domain/MarketplaceBid';
import { LoanRequest, LoanRequestStatus } from '../domain/LoanRequest';
import { MarketplaceRule, AllocationStrategy } from '../domain/MarketplaceRule';
import { AuditLog } from '../domain/AuditLog';

@Injectable()
export class FundingAllocationService {
    constructor(
        private dataSource: DataSource,
        @InjectRepository(FundingAllocation)
        private allocationRepository: Repository<FundingAllocation>,
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
     * Accept funding for a loan request
     * 
     * Rules:
     * 1. Minimum funding threshold must be met
     * 2. Only borrower can accept
     * 3. Allocates based on strategy (FIFO or PRO_RATA)
     * 4. Updates bid statuses
     * 5. Transitions loan to FUNDED status
     * 
     * @param loanRequestId - Loan request ID
     * @param borrowerId - Borrower ID (must own the loan)
     * @param bidIds - Optional specific bid IDs to accept (default: all active)
     */
    async acceptFunding(
        loanRequestId: string,
        borrowerId: string,
        bidIds?: string[],
    ): Promise<{ accepted_bid_count: number; total_funded: number }> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Validate loan request exists and belongs to borrower
            const loanRequest = await queryRunner.manager.findOne(LoanRequest, {
                where: { id: loanRequestId },
            });

            if (!loanRequest) {
                throw new NotFoundException(`Loan request ${loanRequestId} not found`);
            }

            if (loanRequest.borrower_id !== borrowerId) {
                throw new BadRequestException('Loan request belongs to another borrower');
            }

            // 2. Check minimum funding threshold is met
            if (!loanRequest.is_minimum_threshold_met) {
                throw new ConflictException(
                    `Minimum funding threshold not met. Required: ${loanRequest.min_funding_threshold}, Current: ${loanRequest.amount_funded}`,
                );
            }

            // 3. Get marketplace rules
            const rules = await queryRunner.manager.findOne(MarketplaceRule, { where: {} });
            if (!rules) {
                throw new ConflictException('Marketplace rules not configured');
            }

            // 4. Get eligible bids
            const bids = await this.getEligibleBids(loanRequestId, bidIds, queryRunner);

            if (bids.length === 0) {
                throw new BadRequestException('No eligible bids to accept');
            }

            // 5. Allocate funds based on strategy
            const allocations = await this.performAllocation(
                loanRequest,
                bids,
                rules.allocation_strategy,
                queryRunner,
            );

            // 6. Update loan status to FUNDED
            loanRequest.status = LoanRequestStatus.FUNDED;
            await queryRunner.manager.save(loanRequest);

            // 7. Audit
            await this.auditAction(
                queryRunner,
                'FUNDING_ACCEPTED',
                borrowerId,
                loanRequestId,
                'LOAN_REQUEST',
                {
                    bid_count: allocations.length,
                    total_allocated: allocations.reduce((sum, a) => sum + a.allocated_amount, 0),
                },
            );

            await queryRunner.commitTransaction();

            return {
                accepted_bid_count: allocations.length,
                total_funded: loanRequest.amount_funded,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Get eligible bids for allocation
     * 
     * Filters:
     * - Status must be ACTIVE or PARTIALLY_FILLED
     * - Must have available remaining bid amount
     * - Respects specific bid_ids if provided
     */
    private async getEligibleBids(
        loanRequestId: string,
        bidIds: string[] | undefined,
        queryRunner: any,
    ): Promise<MarketplaceBid[]> {
        let query = queryRunner.manager
            .createQueryBuilder(MarketplaceBid, 'mb')
            .where('mb.loan_request_id = :loanRequestId', { loanRequestId })
            .andWhere('mb.status IN (:...statuses)', {
                statuses: [BidStatus.ACTIVE, BidStatus.PARTIALLY_FILLED],
            })
            .andWhere('mb.bid_amount > mb.allocated_amount')
            .orderBy('mb.created_at', 'ASC'); // FIFO by default

        if (bidIds && bidIds.length > 0) {
            query = query.andWhere('mb.id IN (:...bidIds)', { bidIds });
        }

        return query.getMany();
    }

    /**
     * Perform allocation of bids to loan
     * 
     * Strategies:
     * - FIFO: Allocate in creation order until loan fully funded
     * - PRO_RATA: Allocate proportionally based on bid amounts
     */
    private async performAllocation(
        loanRequest: LoanRequest,
        bids: MarketplaceBid[],
        strategy: AllocationStrategy,
        queryRunner: any,
    ): Promise<FundingAllocation[]> {
        const allocations: FundingAllocation[] = [];
        let totalAllocated = loanRequest.amount_funded;
        const remainingToFund = loanRequest.remaining_amount;

        if (strategy === AllocationStrategy.FIFO) {
            // First-In, First-Out: allocate to earliest bids first
            for (const bid of bids) {
                if (totalAllocated >= loanRequest.amount_requested) {
                    break;
                }

                const availableInBid = bid.bid_amount - bid.allocated_amount;
                const toAllocate = Math.min(availableInBid, loanRequest.amount_requested - totalAllocated);

                if (toAllocate > 0) {
                    const allocation = new FundingAllocation();
                    allocation.id = this.generateId();
                    allocation.loan_request_id = loanRequest.id;
                    allocation.bid_id = bid.id;
                    allocation.lender_id = bid.lender_id || await this.getCompanyLenderId(bid.company_id); // Get actual lender from company
                    allocation.allocated_amount = toAllocate;

                    const savedAllocation = await queryRunner.manager.save(allocation);
                    allocations.push(savedAllocation);

                    // Update bid
                    bid.allocated_amount += toAllocate;
                    bid.status = bid.allocated_amount >= bid.bid_amount ? BidStatus.FILLED : BidStatus.PARTIALLY_FILLED;
                    await queryRunner.manager.save(bid);

                    totalAllocated += toAllocate;
                }
            }
        } else if (strategy === AllocationStrategy.PRO_RATA) {
            // Pro-rata: allocate proportionally to bid amounts
            const totalBidAmount = bids.reduce((sum, b) => sum + (b.bid_amount - b.allocated_amount), 0);

            for (const bid of bids) {
                if (totalAllocated >= loanRequest.amount_requested) {
                    break;
                }

                const availableInBid = bid.bid_amount - bid.allocated_amount;
                const proportion = availableInBid / totalBidAmount;
                const toAllocate = Math.min(
                    Math.floor(remainingToFund * proportion),
                    loanRequest.amount_requested - totalAllocated,
                );

                if (toAllocate > 0) {
                    const allocation = new FundingAllocation();
                    allocation.id = this.generateId();
                    allocation.loan_request_id = loanRequest.id;
                    allocation.bid_id = bid.id;
                    allocation.lender_id = bid.lender_id || await this.getCompanyLenderId(bid.company_id);
                    allocation.allocated_amount = toAllocate;

                    const savedAllocation = await queryRunner.manager.save(allocation);
                    allocations.push(savedAllocation);

                    bid.allocated_amount += toAllocate;
                    bid.status = bid.allocated_amount >= bid.bid_amount ? BidStatus.FILLED : BidStatus.PARTIALLY_FILLED;
                    await queryRunner.manager.save(bid);

                    totalAllocated += toAllocate;
                }
            }
        }

        // Update loan funded amount
        loanRequest.amount_funded = totalAllocated;
        await queryRunner.manager.save(loanRequest);

        return allocations;
    }

    /**
     * Get lender ID from company (for company auto-bid allocations)
     * In real system, this would query company's primary lender or treasury account
     */
    private async getCompanyLenderId(companyId: string): Promise<string> {
        // TODO: Query company_lenders table for company's treasury/primary account
        // For now, return company_id as lender_id
        return companyId;
    }

    /**
     * Get allocations for a loan request
     */
    async getAllocationsForLoan(loanRequestId: string): Promise<FundingAllocation[]> {
        return this.allocationRepository.find({
            where: { loan_request_id: loanRequestId },
            order: { created_at: 'ASC' },
        });
    }

    /**
     * Audit an action
     */
    private async auditAction(
        queryRunner: any,
        action: string,
        actor_id: string,
        target_id: string,
        target_type: string,
        details: any,
    ): Promise<void> {
        const audit = new AuditLog();
        audit.id = parseInt(Math.random().toString().substring(2, 13), 10) as any; // Temporary ID generation
        audit.action = action;
        audit.userId = parseInt(actor_id, 10);
        audit.entity = target_type;
        audit.entityId = parseInt(target_id, 10);
        audit.metadata = JSON.stringify(details);

        await queryRunner.manager.save(audit);
    }

    /**
     * Generate UUID
     */
    private generateId(): string {
        return (Math.random() * 10000).toFixed(0).toString();
    }
}
