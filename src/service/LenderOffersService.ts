import {
    MakeOfferRequest,
    MakeOfferResponse,
    OfferValidationResponse,
} from '../dto/LenderDtos';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import { AppDataSource } from '../config/database';
import { LoanOffer } from '../domain/LoanOffer';

const MIN_OFFER_PLN = 10;

/**
 * L-03: LENDER OFFERS SERVICE (CRITICAL PATH)
 * Min 10 PLN enforced; remaining amount from DB; atomic create/cancel
 */
export class LenderOffersService {
    private auditLogRepository: AuditLogRepository;
    private loanRepo: LoanRepository;
    private loanAppRepo: LoanApplicationRepository;
    private loanOfferRepo: LoanOfferRepository;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
        this.loanRepo = new LoanRepository();
        this.loanAppRepo = new LoanApplicationRepository();
        this.loanOfferRepo = new LoanOfferRepository();
    }

    async validateOffer(
        lenderId: string,
        loanId: string,
        offerAmount: number
    ): Promise<OfferValidationResponse> {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (offerAmount < MIN_OFFER_PLN) {
            errors.push(`Minimum offer is ${MIN_OFFER_PLN} PLN`);
        }
        if (offerAmount <= 0) {
            errors.push('Offer amount must be greater than 0');
        }

        const loanIdNum = parseInt(loanId, 10);
        const loan = await this.loanRepo.findById(loanIdNum);
        if (!loan) {
            errors.push('Loan not found');
            return { isValid: false, errors, warnings, remainingCapacity: 0, estimatedROI: 0 };
        }
        if (loan.statusId !== 1) {
            errors.push('Loan is not open for offers');
            return { isValid: false, errors, warnings, remainingCapacity: 0, estimatedROI: 0 };
        }

        const existingOffer = await this.loanOfferRepo.findByLoanIdAndLenderId(loanIdNum, parseInt(lenderId, 10));
        if (existingOffer) {
            errors.push('You already have an active offer on this loan. Cancel it first or use a different loan.');
            return { isValid: false, errors, warnings, remainingCapacity: 0, estimatedROI: 0 };
        }

        const totalOffered = await this.loanOfferRepo.sumAmountByLoanId(loanIdNum);
        const totalAmount = Number(loan.totalAmount);
        const remainingAmount = Math.max(0, totalAmount - totalOffered);

        if (remainingAmount < offerAmount) {
            errors.push(`Insufficient remaining loan amount. Available: ${remainingAmount.toFixed(2)} PLN`);
        }
        if (offerAmount > 1000000) {
            errors.push('Amount exceeds maximum allowed value');
        }

        const estimatedROI = totalAmount > 0 ? (offerAmount * 0.08) / 12 : 0;

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            remainingCapacity: Math.round(remainingAmount * 100) / 100,
            estimatedROI,
        };
    }

    async createOffer(lenderId: string, request: MakeOfferRequest): Promise<MakeOfferResponse> {
        const validation = await this.validateOffer(lenderId, request.loanId, request.amount);
        if (!validation.isValid) {
            throw new Error(`Offer validation failed: ${validation.errors.join(', ')}`);
        }

        const loanIdNum = parseInt(request.loanId, 10);
        const lenderIdNum = parseInt(lenderId, 10);
        const existingOffer = await this.loanOfferRepo.findByLoanIdAndLenderId(loanIdNum, lenderIdNum);
        if (existingOffer) {
            throw new Error('DUPLICATE_OFFER: You already have an active offer on this loan.');
        }

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const offer = new LoanOffer();
            offer.loanId = loanIdNum;
            offer.lenderId = lenderIdNum;
            offer.amount = request.amount;
            const saved = await this.loanOfferRepo.save(offer);

            const totalOffered = await this.loanOfferRepo.sumAmountByLoanId(loanIdNum);
            const loan = await this.loanRepo.findById(loanIdNum);
            if (!loan) throw new Error('Loan not found');
            const totalAmount = Number(loan.totalAmount);
            const fundedAmount = Math.min(totalOffered, totalAmount);
            const fundedPercent = totalAmount > 0 ? (fundedAmount / totalAmount) * 100 : 0;

            await this.loanRepo.update(loanIdNum, {
                fundedAmount,
            } as any);
            await this.loanAppRepo.update(loan.applicationId, {
                fundedAmount,
                fundedPercent,
            } as any);

            await this.auditLogRepository.create({
                actorId: lenderIdNum,
                action: 'OFFER_CREATED',
                entity: 'LOAN_OFFER',
                entityId: saved.id,
                createdAt: new Date(),
            } as any);

            // Auto-close at 100%: run close logic in same transaction
            const { MarketplaceCloseService } = await import('./MarketplaceCloseService');
            const closeService = new MarketplaceCloseService();
            const didClose = await closeService.tryAutoCloseAfterOffer(queryRunner, loanIdNum, fundedPercent);

            await queryRunner.commitTransaction();

            if (didClose) await closeService.notifyPartiesForClose(loanIdNum, 'auto');

            return {
                offerId: String(saved.id),
                loanId: request.loanId,
                lenderId,
                amount: request.amount,
                loanFundedPercent: Math.round(fundedPercent * 100) / 100,
                createdAt: (saved.createdAt as Date).toISOString(),
                message: didClose ? 'Offer created and loan fully funded.' : 'Offer created successfully.',
            };
        } catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * List all offers placed by this lender (for "My Bids" / My Offers).
     */
    async listMyOffers(lenderId: string): Promise<Array<{
        offerId: string;
        loanId: string;
        amount: number;
        confirmedAmount: number | null;
        loanAmount: number;
        loanStatus: string;
        fundedPercent: number;
        createdAt: string;
    }>> {
        const lenderIdNum = parseInt(lenderId, 10);
        const offers = await this.loanOfferRepo.findByLenderId(lenderIdNum);
        const result: Array<{
            offerId: string;
            loanId: string;
            amount: number;
            confirmedAmount: number | null;
            loanAmount: number;
            loanStatus: string;
            fundedPercent: number;
            createdAt: string;
        }> = [];
        for (const o of offers) {
            const loan = await this.loanRepo.findById(o.loanId);
            if (!loan) continue;
            const totalOffered = await this.loanOfferRepo.sumAmountByLoanId(loan.id);
            const totalAmount = Number(loan.totalAmount);
            const fundedPercent = totalAmount > 0 ? Math.min(100, (totalOffered / totalAmount) * 100) : 0;
            const statusCode = loan.statusId === 1 ? 'OPEN' : loan.statusId === 2 ? 'FUNDED' : 'OTHER';
            result.push({
                offerId: String(o.id),
                loanId: String(o.loanId),
                amount: Number(o.amount),
                confirmedAmount: o.confirmedAmount != null ? Number(o.confirmedAmount) : null,
                loanAmount: totalAmount,
                loanStatus: statusCode,
                fundedPercent: Math.round(fundedPercent * 100) / 100,
                createdAt: (o.createdAt as Date).toISOString(),
            });
        }
        return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    /**
     * Cancel offer only if loan is still OPEN (statusId 1) and not yet funded.
     */
    async cancelOffer(lenderId: string, offerId: string): Promise<void> {
        const offerIdNum = parseInt(offerId, 10);
        const offer = await this.loanOfferRepo.findById(offerIdNum);
        if (!offer) throw new Error('Offer not found');
        if (offer.lenderId !== parseInt(lenderId, 10)) throw new Error('Offer not found');

        const loan = await this.loanRepo.findById(offer.loanId);
        if (!loan) throw new Error('Loan not found');
        if (loan.statusId !== 1) throw new Error('Cannot cancel offer: loan is no longer open');

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            await this.loanOfferRepo.delete(offerIdNum);
            const totalOffered = await this.loanOfferRepo.sumAmountByLoanId(loan.id);
            const totalAmount = Number(loan.totalAmount);
            const fundedAmount = Math.min(totalOffered, totalAmount);
            const fundedPercent = totalAmount > 0 ? (fundedAmount / totalAmount) * 100 : 0;
            await this.loanRepo.update(loan.id, { fundedAmount } as any);
            await this.loanAppRepo.update(loan.applicationId, { fundedAmount, fundedPercent } as any);
            await this.auditLogRepository.create({
                actorId: offer.lenderId,
                action: 'OFFER_CANCELLED',
                entity: 'LOAN_OFFER',
                entityId: offerIdNum,
                createdAt: new Date(),
            } as any);
            await queryRunner.commitTransaction();
        } catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        } finally {
            await queryRunner.release();
        }
    }
}
