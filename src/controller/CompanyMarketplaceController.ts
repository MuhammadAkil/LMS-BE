/**
 * CompanyMarketplaceController
 * Company-facing marketplace endpoints (auto-bidding)
 * 
 * Endpoints:
 * - POST /api/company/marketplace/auto-bid
 * - GET  /api/company/marketplace/activity
 * 
 * Compliance:
 * - Management agreement must be signed
 * - Cannot front-run manual lender bids
 * - Respects queue ordering (FIFO)
 * - Auto-bid rules: max per loan, max borrower exposure
 * - Funds locked from company pool
 * - All actions audited
 */

import {
    Controller,
    Get,
    Post,
    Put,
    Body,
    Req,
    HttpCode,
    QueryParam,
    UseBefore,
} from 'routing-controllers';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, Min, Max, IsNotEmpty } from 'class-validator';
import { Request } from 'express';
import { MarketplaceRequest } from '../common/MarketplaceRequest';
import { MarketplaceBidService } from '../service/MarketplaceBidService';
import { LenderOffersService } from '../service/LenderOffersService';
import { LenderLoansService } from '../service/LenderLoansService';
import { CompanyGuard, CompanyStatusGuard, AgreementSignatureGuard } from '../middleware/CompanyGuards';
import {
    CreateCompanyAutoBidRequest,
    BidResponse,
    CompanyActivityResponse,
} from '../dto/MarketplaceDtos';
import { CompanyRepository } from '../repository/CompanyRepository';
import { AppDataSource } from '../config/database';

enum BorrowerTrustLevel {
    A = 'A', B = 'B', C = 'C', D = 'D', E = 'E', F = 'F',
}

export class SaveAutoBidConfigRequest {
    @IsBoolean()
    @IsNotEmpty()
    enabled!: boolean;

    @IsNumber()
    @Min(10000)
    capitalPool!: number;

    @IsNumber()
    @Min(100)
    maxBidPerLoan!: number;

    @IsNumber()
    @Min(100)
    maxExposurePerBorrower!: number;

    @IsEnum(BorrowerTrustLevel)
    @IsNotEmpty()
    minimumBorrowerLevel!: string;

    @IsInt()
    @Min(1)
    durationMin!: number;

    @IsInt()
    @Max(36)
    durationMax!: number;

    @IsBoolean()
    @IsOptional()
    timeBasedBidding?: boolean;
}

export class CreateDelegatedBidRequest {
    @IsNotEmpty()
    loanId!: string;

    @IsInt()
    lenderId!: number;

    @IsNumber()
    @Min(10)
    amount!: number;
}

@Controller('/company/marketplace')
@UseBefore(CompanyGuard, CompanyStatusGuard)
export class CompanyMarketplaceController {
    private companyRepo = new CompanyRepository();
    private offersService = new LenderOffersService();
    private loansService = new LenderLoansService();

    constructor(
        private bidService: MarketplaceBidService,
    ) { }

    /**
     * GET /api/company/marketplace/config
     * Returns the company's saved auto-bid configuration.
     */
    @Get('config')
    @UseBefore(CompanyGuard, CompanyStatusGuard, AgreementSignatureGuard)
    async getAutoBidConfig(@Req() req: Request): Promise<any> {
        const companyId = (req as any).user?.companyId;
        const company = await this.companyRepo.findById(companyId);
        if (!company) {
            return { statusCode: '404', statusMessage: 'Company not found' };
        }
        return {
            data: company.autoBidConfig ?? {
                enabled: false,
                capitalPool: 250000,
                maxBidPerLoan: 10000,
                maxExposurePerBorrower: 50000,
                minimumBorrowerLevel: 'B',
                durationMin: 1,
                durationMax: 6,
                timeBasedBidding: false,
            },
        };
    }

    /**
     * PUT /api/company/marketplace/config
     * Saves the company's auto-bid configuration.
     */
    @Put('config')
    @UseBefore(CompanyGuard, CompanyStatusGuard, AgreementSignatureGuard)
    async saveAutoBidConfig(
        @Body() body: SaveAutoBidConfigRequest,
        @Req() req: Request,
    ): Promise<any> {
        const companyId = (req as any).user?.companyId;
        const updated = await this.companyRepo.update(companyId, { autoBidConfig: body });
        if (!updated) {
            return { statusCode: '404', statusMessage: 'Company not found' };
        }
        return { data: updated.autoBidConfig };
    }

    /**
     * POST /api/company/marketplace/auto-bid
     * 
     * Create an auto-bid for a loan request
     * 
     * Compliance Rules:
     * 1. Company must have signed management agreement
     * 2. Cannot exceed max_bid_per_company limit
     * 3. Must not violate max borrower exposure rules
     * 4. Cannot front-run manual lender bids (respects queue)
     * 5. Funds locked from company pool
     * 
     * Request body:
     * - loan_request_id: string
     * - bid_amount: number (in cents/basis points)
     * 
     * Response: BidResponse with:
     * - company_id set instead of lender_id
     * - status: 'ACTIVE'
     * - locked_funds: true
     */
    @Post('auto-bid')
    @UseBefore(AgreementSignatureGuard)
    @HttpCode(201)
    async createAutoBid(
        @Body() request: CreateCompanyAutoBidRequest,
        @Req() req: Request,
    ): Promise<BidResponse> {
        const companyId = (req as any).user?.companyId;
        if (!companyId) throw new Error('Company ID not found in request');

        const bid = await this.bidService.createBid(
            companyId,
            {
                loan_request_id: request.loan_request_id,
                bid_amount: request.bid_amount,
            },
            'COMPANY',
        );

        return bid;
    }

    /**
     * POST /api/company/marketplace/delegated-bid
     * Company creates delegated bid for linked lender:
     * 24h lender approval window, then 2h payment window.
     */
    @Post('delegated-bid')
    @UseBefore(AgreementSignatureGuard)
    @HttpCode(201)
    async createDelegatedBid(
        @Body() request: CreateDelegatedBidRequest,
        @Req() req: Request,
    ): Promise<any> {
        const companyId = Number((req as any).user?.companyId);
        const userId = Number((req as any).user?.id);
        if (!companyId) throw new Error('Company ID not found in request');
        if (!userId) throw new Error('User ID not found in request');

        const created = await this.offersService.createDelegatedOffer(
            companyId,
            userId,
            {
                loanId: request.loanId,
                lenderId: Number(request.lenderId),
                amount: Number(request.amount),
            }
        );

        return {
            offerId: created.offerId,
            status: created.status,
            approvalExpiresAt: created.approvalExpiresAt,
            commissionAmount: created.commissionAmount,
            message: 'Delegated offer created. Lender must approve within 24h, then pay within 2h.',
        };
    }

    /**
     * GET /api/company/marketplace/open-loans
     * Browse open loans for "act as lender" / proxy investment flow. Same shape as lender browse.
     */
    @Get('open-loans')
    @UseBefore(AgreementSignatureGuard)
    async getOpenLoans(
        @Req() req: Request,
        @QueryParam('page') page: number = 1,
        @QueryParam('pageSize') pageSize: number = 20,
        @QueryParam('minAmount') minAmount?: number,
        @QueryParam('maxAmount') maxAmount?: number,
        @QueryParam('minDuration') minDuration?: number,
        @QueryParam('maxDuration') maxDuration?: number,
    ): Promise<any> {
        const filters = {
            page: Number(page) || 1,
            pageSize: Math.min(Number(pageSize) || 20, 100),
            minAmount: minAmount != null ? Number(minAmount) : undefined,
            maxAmount: maxAmount != null ? Number(maxAmount) : undefined,
            minDuration: minDuration != null ? Number(minDuration) : undefined,
            maxDuration: maxDuration != null ? Number(maxDuration) : undefined,
        };
        return this.loansService.browseOpenLoansForCompany(filters);
    }

    /**
     * GET /api/company/marketplace/activity
     * 
     * View company's marketplace bidding activity
     * 
     * Query parameters:
     * - status: Filter by bid status (ACTIVE, FILLED, etc.)
     * - limit: Number of records (default: 50)
     * - offset: Pagination offset (default: 0)
     * 
     * Response: CompanyActivityResponse[]
     * - bid_id, loan_request_id, bid_amount, status
     * - Borrower name MASKED for privacy
     * - Created timestamp
     */
    @Get('activity')
    @UseBefore(AgreementSignatureGuard)
    async getCompanyActivity(
        @Req() req: Request,
        @QueryParam('status') status?: string,
        @QueryParam('limit') limit: number = 50,
        @QueryParam('offset') offset: number = 0,
    ): Promise<CompanyActivityResponse[]> {
        const companyId = (req as any).user?.companyId;
        if (!companyId) throw new Error('Company ID not found in request');

        const safeLimit = Math.min(Number(limit) || 50, 200);
        const safeOffset = Math.max(Number(offset) || 0, 0);
        const statusFilter = status ? `AND us.code = ?` : '';
        const params: any[] = [companyId];
        if (status) params.push(status);
        params.push(safeLimit, safeOffset);

        const rows = await AppDataSource.query(
            `SELECT
                lo.id,
                lo.loanId,
                lo.lenderId,
                lo.amount,
                lo.confirmed_amount AS confirmedAmount,
                lo.createdAt,
                l.statusId,
                us.code AS statusCode,
                u.email AS lenderEmail,
                COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),  ''), u.email) AS lenderName
             FROM loan_offers lo
             INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId AND cl.companyId = ?
             LEFT JOIN loans l ON l.id = lo.loanId
             LEFT JOIN user_statuses us ON us.id = l.statusId
             LEFT JOIN users u ON u.id = lo.lenderId
             ${statusFilter}
             ORDER BY lo.createdAt DESC
             LIMIT ? OFFSET ?`,
            params
        );

        return rows ?? [];
    }
}
