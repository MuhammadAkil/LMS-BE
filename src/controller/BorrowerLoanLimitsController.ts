import { Request, Response } from 'express';
import { Controller, Get, Req, Res } from 'routing-controllers';
import { UserRepository } from '../repository/UserRepository';
import { LevelRulesRepository } from '../repository/LevelRulesRepository';
import { LoanDurationConfigService } from '../service/LoanDurationConfigService';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LoanRepository } from '../repository/LoanRepository';
import { BorrowerApiResponse } from '../dto/BorrowerDtos';

export interface LoanLimitsDto {
    maxAmount: number;
    maxActiveLoans: number;
    maxActiveApplications: number;
    commissionRate: number;
    availableDurations: Array<{ id: number; label: string; durationMonths?: number; durationDays?: number; repaymentType: string; isEnabled: boolean }>;
}

/**
 * GET /api/borrower/loan-limits
 * Returns limits and config for the current borrower's level (for create-request form).
 */
@Controller('/borrower')
export class BorrowerLoanLimitsController {
    private userRepo: UserRepository;
    private levelRulesRepo: LevelRulesRepository;
    private durationConfigService: LoanDurationConfigService;
    private loanAppRepo: LoanApplicationRepository;
    private loanRepo: LoanRepository;

    constructor() {
        this.userRepo = new UserRepository();
        this.levelRulesRepo = new LevelRulesRepository();
        this.durationConfigService = new LoanDurationConfigService();
        this.loanAppRepo = new LoanApplicationRepository();
        this.loanRepo = new LoanRepository();
    }

    @Get('/loan-limits')
    async getLoanLimits(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const user = (req as any).user;
            const borrowerId = user.id as number;

            const u = await this.userRepo.findById(borrowerId);
            if (!u) {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'User not found',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const level = u.level ?? 0;
            const levelRules = await this.levelRulesRepo.findByLevel(level);

            const maxAmount = Number(levelRules?.maxLoanAmount ?? 0);
            const maxActiveLoans = levelRules?.maxActiveLoans ?? 0;
            const maxActiveApplications = levelRules?.maxApplications ?? 0;
            const commissionRate = Number(levelRules?.commissionPercent ?? 0) / 100;

            const enabledDurations = await this.durationConfigService.getEnabled();
            const availableDurations = enabledDurations.map((d) => ({
                id: d.id,
                label: d.label,
                durationMonths: d.durationMonths,
                durationDays: d.durationDays,
                repaymentType: d.repaymentType,
                isEnabled: true,
            }));

            const data: LoanLimitsDto = {
                maxAmount,
                maxActiveLoans,
                maxActiveApplications,
                commissionRate,
                availableDurations,
            };

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'OK',
                data,
                timestamp: new Date().toISOString(),
            } as BorrowerApiResponse<LoanLimitsDto>);
        } catch (error: any) {
            console.error('Error in getLoanLimits:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
