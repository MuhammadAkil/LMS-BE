/**
 * Shared close logic: pro-rata allocation, loan/application state transition, notifications.
 * Used by: auto-close (after offer at 100%), manual close (borrower), admin force-close.
 */

import { QueryRunner } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Loan } from '../domain/Loan';
import { LoanApplication } from '../domain/LoanApplication';
import { LoanOffer } from '../domain/LoanOffer';
import { AuditLog } from '../domain/AuditLog';
import { calculateProRata, OfferForProRata } from '../util/proRataUtil';
import { LmsNotificationService } from './LmsNotificationService';

const LOAN_STATUS_ACTIVE = 1; // DB: loan_statuses id=1 code=ACTIVE
const APPLICATION_STATUS_CLOSED = 3; // DB: loan_application_statuses id=3 code=CLOSED

export class MarketplaceCloseService {
    private notificationService: LmsNotificationService;

    constructor() {
        this.notificationService = new LmsNotificationService();
    }

    /**
     * Call from within offer-creation transaction when fundedPercent >= 100.
     * Uses the same queryRunner so close is atomic with the offer.
     */
    async tryAutoCloseAfterOffer(
        queryRunner: QueryRunner,
        loanIdNum: number,
        fundedPercent: number
    ): Promise<boolean> {
        if (fundedPercent < 100) return false;
        const loan = await queryRunner.manager.findOne(Loan, { where: { id: loanIdNum } });
        if (!loan || loan.statusId !== LOAN_STATUS_ACTIVE) return false;
        await this.closeLoanWithProRataInternal(loanIdNum, queryRunner, 'auto');
        return true;
    }

    /**
     * Standalone close (manual close by borrower or admin). Uses its own transaction.
     */
    async closeLoanWithProRata(loanIdNum: number, closedBy: 'borrower' | 'admin'): Promise<void> {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            await this.closeLoanWithProRataInternal(loanIdNum, queryRunner, closedBy);
            await queryRunner.commitTransaction();
            await this.notifyPartiesForClose(loanIdNum, closedBy);
        } catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        } finally {
            await queryRunner.release();
        }
    }

    private async closeLoanWithProRataInternal(
        loanIdNum: number,
        queryRunner: QueryRunner,
        closedBy: 'auto' | 'borrower' | 'admin'
    ): Promise<void> {
        const loan = await queryRunner.manager.findOne(Loan, { where: { id: loanIdNum } });
        if (!loan) throw new Error('Loan not found');
        if (loan.statusId !== LOAN_STATUS_ACTIVE) throw new Error('Loan is not in active state for closing');

        const application = await queryRunner.manager.findOne(LoanApplication, {
            where: { id: loan.applicationId },
        });
        if (!application) throw new Error('Application not found');

        const offers = await queryRunner.manager.find(LoanOffer, {
            where: { loanId: loanIdNum },
            order: { createdAt: 'ASC' },
        });
        if (offers.length === 0) throw new Error('No offers to close');

        const loanAmount = Number(loan.totalAmount);
        const totalOffered = offers.reduce((s, o) => s + Number(o.amount), 0);
        const amountToDistribute = Math.min(totalOffered, loanAmount);
        const offersForProRata: OfferForProRata[] = offers.map((o) => ({
            id: o.id,
            amount: Number(o.amount),
        }));
        const confirmedMap = calculateProRata(amountToDistribute, offersForProRata);

        for (const offer of offers) {
            const confirmed = confirmedMap.get(offer.id) ?? 0;
            await queryRunner.manager.update(
                LoanOffer,
                { id: offer.id },
                { confirmedAmount: confirmed } as any
            );
        }

        const finalFundedAmount = amountToDistribute;
        const finalFundedPercent = loanAmount > 0 ? (finalFundedAmount / loanAmount) * 100 : 0;

        // Keep loan statusId=1 (ACTIVE) — status remains ACTIVE throughout repayment lifecycle.
        // fundedAmount is updated to the confirmed pro-rata distribution.
        await queryRunner.manager.update(
            Loan,
            { id: loanIdNum },
            { fundedAmount: finalFundedAmount } as any
        );
        await queryRunner.manager.update(
            LoanApplication,
            { id: loan.applicationId },
            {
                statusId: APPLICATION_STATUS_CLOSED,
                fundedAmount: finalFundedAmount,
                fundedPercent: finalFundedPercent,
            } as any
        );

        const auditRepo = queryRunner.manager.getRepository(AuditLog);
        const audit = auditRepo.create({
            action: closedBy === 'auto' ? 'LOAN_AUTO_CLOSED' : closedBy === 'borrower' ? 'LOAN_MANUALLY_CLOSED' : 'LOAN_FORCE_CLOSED_ADMIN',
            entity: 'LOAN',
            entityId: loanIdNum,
            userId: loan.borrowerId,
            metadata: JSON.stringify({ closedBy, finalFundedAmount, offerCount: offers.length }),
        });
        await auditRepo.save(audit);

        // Notifications are sent by notifyPartiesForClose() after transaction commit
        // to avoid cross-connection issues when called from tryAutoCloseAfterOffer.
    }

    /** Call after transaction commit to notify borrower and lenders. */
    async notifyPartiesForClose(loanIdNum: number, closedBy: 'auto' | 'borrower' | 'admin'): Promise<void> {
        const loanRepo = AppDataSource.getRepository(Loan);
        const offerRepo = AppDataSource.getRepository(LoanOffer);
        const loan = await loanRepo.findOne({ where: { id: loanIdNum } });
        if (!loan) return;
        const offers = await offerRepo.find({ where: { loanId: loanIdNum } });
        const totalOffered = offers.reduce((s, o) => s + Number(o.amount), 0);
        const loanAmount = Number(loan.totalAmount);
        const amountToDistribute = Math.min(totalOffered, loanAmount);
        const offersForProRata: OfferForProRata[] = offers.map((o) => ({ id: o.id, amount: Number(o.amount) }));
        const confirmedMap = calculateProRata(amountToDistribute, offersForProRata);
        const finalFundedPercent = loanAmount > 0 ? (amountToDistribute / loanAmount) * 100 : 0;

        await this.notificationService.notify(
            loan.borrowerId,
            'LOAN_FUNDED',
            'Loan funded',
            `Your loan is fully funded (${finalFundedPercent.toFixed(1)}%). Proceed to payment.`,
            { loanId: loanIdNum, fundedPercent: finalFundedPercent }
        );
        for (const offer of offers) {
            const confirmed = confirmedMap.get(offer.id) ?? Number(offer.confirmedAmount ?? 0);
            await this.notificationService.notify(
                offer.lenderId,
                'OFFER_CONFIRMED',
                'Offer confirmed',
                `Your offer has been confirmed for ${confirmed.toFixed(2)} PLN.`,
                { offerId: offer.id, loanId: loanIdNum, confirmedAmount: confirmed }
            );
        }
    }
}
