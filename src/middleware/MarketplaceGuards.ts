/**
 * Marketplace Guards
 * Fine-grained access control for marketplace operations
 * 
 * Guards:
 * - LoanStatusGuard: Ensures loan is in correct status for operation
 * - FundingWindowGuard: Ensures funding window is open
 * - CapitalLockGuard: Ensures capital is properly locked for bids
 * - AgreementGuard: Ensures company has signed agreement to bid
 */

import {
    Injectable,
    CanActivate,
    ExecutionContext,
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { LoanRequest, LoanRequestStatus } from '../domain/LoanRequest';
import { MarketplaceBid } from '../domain/MarketplaceBid';

/**
 * LoanStatusGuard
 * Verifies loan request is in a valid status for the operation
 * 
 * Usage: @UseGuards(LoanStatusGuard(['OPEN', 'BIDDING']))
 */
@Injectable()
export class LoanStatusGuard implements CanActivate {
    constructor(
        @InjectRepository(LoanRequest)
        private loanRequestRepository: Repository<LoanRequest>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const { id: loanRequestId } = request.params;
        const allowedStatuses = request.guardMetadata?.statuses || [
            LoanRequestStatus.OPEN,
            LoanRequestStatus.BIDDING,
        ];

        const loanRequest = await this.loanRequestRepository.findOne({
            where: { id: loanRequestId },
        });

        if (!loanRequest) {
            throw new NotFoundException(`Loan request ${loanRequestId} not found`);
        }

        if (!allowedStatuses.includes(loanRequest.status)) {
            throw new BadRequestException(
                `Loan is in ${loanRequest.status} status. This operation requires: ${allowedStatuses.join(', ')}`,
            );
        }

        // Attach loan to request for controller use
        request.loanRequest = loanRequest;

        return true;
    }
}

/**
 * FundingWindowGuard
 * Verifies funding window is still open
 */
@Injectable()
export class FundingWindowGuard implements CanActivate {
    constructor(
        @InjectRepository(LoanRequest)
        private loanRequestRepository: Repository<LoanRequest>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const { id: loanRequestId } = request.params;

        const loanRequest = await this.loanRequestRepository.findOne({
            where: { id: loanRequestId },
        });

        if (!loanRequest) {
            throw new NotFoundException(`Loan request ${loanRequestId} not found`);
        }

        if (!loanRequest.is_funding_window_open) {
            throw new BadRequestException(
                `Funding window closed. Deadline was ${loanRequest.funding_window_ends_at}`,
            );
        }

        request.loanRequest = loanRequest;

        return true;
    }
}

/**
 * CapitalLockGuard
 * Verifies bid has capital locked
 * Prevents operations on unlockedCapital bids
 */
@Injectable()
export class CapitalLockGuard implements CanActivate {
    constructor(
        @InjectRepository(MarketplaceBid)
        private bidRepository: Repository<MarketplaceBid>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const { bidId } = request.params;

        const bid = await this.bidRepository.findOne({
            where: { id: bidId },
        });

        if (!bid) {
            throw new NotFoundException(`Bid ${bidId} not found`);
        }

        if (!bid.locked_funds) {
            throw new ForbiddenException('Capital must be locked for this bid');
        }

        request.bid = bid;

        return true;
    }
}

/**
 * AgreementGuard
 * Verifies company has signed management agreement
 * Required for company auto-bidding
 */
@Injectable()
export class AgreementGuard implements CanActivate {
    constructor(private dataSource: DataSource) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const { companyId } = request.body;
        const userId = request.user.id;

        // TODO: Query ManagementAgreement table
        // Verify:
        // 1. Company exists
        // 2. User is authorized to bid on behalf of company
        // 3. Agreement is signed and active
        // 4. Agreement hasn't been revoked

        const hasAgreement = await this.checkAgreement(companyId, userId);

        if (!hasAgreement) {
            throw new ForbiddenException(
                'Company does not have an active marketplace agreement',
            );
        }

        request.companyId = companyId;

        return true;
    }

    private async checkAgreement(companyId: string, userId: string): Promise<boolean> {
        // TODO: Implement agreement check
        // SELECT COUNT(*) FROM management_agreements
        // WHERE company_id = ? AND authorized_user_id = ? AND status = 'ACTIVE' AND signed_at IS NOT NULL
        return true;
    }
}

/**
 * MarketplaceRuleGuard
 * Validates bid against marketplace rules
 * Checked in BidService but can be used as guard for pre-validation
 */
@Injectable()
export class MarketplaceRuleGuard implements CanActivate {
    constructor(private dataSource: DataSource) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const { bid_amount } = request.body;

        // Get marketplace rules
        const result = await this.dataSource.query(
            `SELECT max_bid_per_lender, max_bid_per_company FROM marketplace_rules LIMIT 1`,
        );

        if (result.length === 0) {
            throw new ForbiddenException('Marketplace rules not configured');
        }

        // Validate bid amount is positive
        if (bid_amount <= 0) {
            throw new BadRequestException('Bid amount must be positive');
        }

        // Max amount check (prevent obvious abuse)
        const maxSingleBid = Math.max(
            result[0].max_bid_per_lender,
            result[0].max_bid_per_company,
        );

        if (bid_amount > maxSingleBid) {
            throw new BadRequestException(`Bid amount exceeds maximum allowed (${maxSingleBid})`);
        }

        return true;
    }
}

/**
 * BorrowerOwnershipGuard
 * Verifies requesting user is the loan borrower
 */
@Injectable()
export class BorrowerOwnershipGuard implements CanActivate {
    constructor(
        @InjectRepository(LoanRequest)
        private loanRequestRepository: Repository<LoanRequest>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const { id: loanRequestId } = request.params;
        const userId = request.user.id;

        const loanRequest = await this.loanRequestRepository.findOne({
            where: { id: loanRequestId },
        });

        if (!loanRequest) {
            throw new NotFoundException(`Loan request ${loanRequestId} not found`);
        }

        if (loanRequest.borrower_id !== userId) {
            throw new ForbiddenException('You can only access your own loan requests');
        }

        request.loanRequest = loanRequest;

        return true;
    }
}

/**
 * BidOwnershipGuard
 * Verifies requesting user is the bid owner (lender)
 */
@Injectable()
export class BidOwnershipGuard implements CanActivate {
    constructor(
        @InjectRepository(MarketplaceBid)
        private bidRepository: Repository<MarketplaceBid>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const { bidId } = request.params;
        const userId = request.user.id;

        const bid = await this.bidRepository.findOne({
            where: { id: bidId },
        });

        if (!bid) {
            throw new NotFoundException(`Bid ${bidId} not found`);
        }

        // Only lender can manage their own bid (company bids are managed differently)
        if (bid.lender_id && bid.lender_id !== userId) {
            throw new ForbiddenException('You can only access your own bids');
        }

        request.bid = bid;

        return true;
    }
}
