import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import {
    CompanyConditionsResponse,
    SubmitConditionsRequest,
    UpdateAutoOfferSettingsRequest,
} from '../dto/CompanyDtos';

const CONDITIONS_STATUS = {
    NOT_SUBMITTED: 'not_submitted',
    PENDING_APPROVAL: 'pending_approval',
    APPROVED: 'approved',
    REVISION_REQUIRED: 'revision_required',
} as const;

/** Polish IBAN: PL + 26 digits */
function isValidPolishIban(iban: string): boolean {
    if (!iban || typeof iban !== 'string') return false;
    const trimmed = iban.replace(/\s/g, '');
    return /^PL\d{26}$/.test(trimmed);
}

export class CompanyConditionsService {
    private auditService: CompanyAuditService;

    constructor() {
        this.auditService = new CompanyAuditService();
    }

    async getConditions(companyId: number): Promise<CompanyConditionsResponse> {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            const rows = await queryRunner.query(
                `SELECT id, conditions_json, conditions_status, conditions_locked_at, admin_revision_note, min_managed_amount, bankAccount, commission_pct
                 FROM companies WHERE id = ?`,
                [companyId]
            );
            if (!rows || rows.length === 0) {
                await queryRunner.release();
                throw new Error('Company not found');
            }
            const c = rows[0];
            const json = typeof c.conditions_json === 'string' ? JSON.parse(c.conditions_json || '{}') : (c.conditions_json || {});
            const status = c.conditions_status ?? (c.conditions_locked_at ? CONDITIONS_STATUS.APPROVED : (json.minManagedAmount != null ? CONDITIONS_STATUS.PENDING_APPROVAL : CONDITIONS_STATUS.NOT_SUBMITTED));
            return {
                conditionsStatus: status,
                adminRevisionNote: c.admin_revision_note ?? undefined,
                minManagedAmount: Number(json.minManagedAmount ?? c.min_managed_amount ?? 0),
                minPeriodMonths: Number(json.minPeriodMonths ?? 12),
                managementCommissionRate: Number(json.managementCommissionRate ?? c.commission_pct ?? 0),
                bankAccount: json.bankAccount ?? c.bankAccount ?? '',
                handleReminders: Boolean(json.handleReminders ?? true),
                handleCourtClaims: Boolean(json.handleCourtClaims ?? false),
                autoOfferSettings: json.autoOfferSettings ?? undefined,
                conditionsLockedAt: c.conditions_locked_at,
            };
        } finally {
            await queryRunner.release();
        }
    }

    async submitConditions(companyId: number, userId: number, body: SubmitConditionsRequest): Promise<CompanyConditionsResponse> {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            if (!isValidPolishIban(body.bankAccount)) {
                throw new Error('Bank account must be a valid Polish IBAN (PL + 26 digits)');
            }
            const maxCommission = await this.getMaxCompanyCommissionRate(queryRunner);
            if (body.managementCommissionRate > maxCommission) {
                throw new Error(`Commission rate cannot exceed ${maxCommission}%`);
            }
            const existing = await queryRunner.query(`SELECT conditions_json FROM companies WHERE id = ?`, [companyId]);
            const existingJson = (existing && existing[0] && existing[0].conditions_json)
                ? (typeof existing[0].conditions_json === 'string' ? JSON.parse(existing[0].conditions_json) : existing[0].conditions_json)
                : {};
            const conditionsJson = JSON.stringify({
                minManagedAmount: body.minManagedAmount,
                minPeriodMonths: body.minPeriodMonths,
                managementCommissionRate: body.managementCommissionRate,
                bankAccount: body.bankAccount.trim(),
                handleReminders: body.handleReminders,
                handleCourtClaims: body.handleCourtClaims,
                autoOfferSettings: existingJson.autoOfferSettings ?? {},
            });
            await queryRunner.query(
                `UPDATE companies SET conditions_json = ?, conditions_status = ?, admin_revision_note = NULL, updated_at = NOW() WHERE id = ?`,
                [conditionsJson, CONDITIONS_STATUS.PENDING_APPROVAL, companyId]
            );
            await this.auditService.logAction(userId, 'CONDITIONS_SUBMITTED', 'COMPANY', companyId, { companyId });
            return this.getConditions(companyId);
        } finally {
            await queryRunner.release();
        }
    }

    private async getMaxCompanyCommissionRate(qr: any): Promise<number> {
        try {
            const r = await qr.query(`SELECT \`value\` FROM platform_configs WHERE \`key\` = 'MAX_COMPANY_COMMISSION_RATE' LIMIT 1`);
            if (r && r[0] && r[0].value != null) return Number(r[0].value);
        } catch (_) { }
        return 20; // default cap 20%
    }

    async requestChanges(companyId: number, userId: number): Promise<CompanyConditionsResponse> {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            const rows = await queryRunner.query(
                `SELECT conditions_status FROM companies WHERE id = ?`,
                [companyId]
            );
            if (!rows || rows.length === 0) throw new Error('Company not found');
            if (rows[0].conditions_status !== CONDITIONS_STATUS.APPROVED) {
                throw new Error('Only approved conditions can be sent back for changes');
            }
            await queryRunner.query(
                `UPDATE companies SET conditions_status = ?, updated_at = NOW() WHERE id = ?`,
                [CONDITIONS_STATUS.PENDING_APPROVAL, companyId]
            );
            await this.auditService.logAction(userId, 'CONDITIONS_REQUEST_CHANGES', 'COMPANY', companyId, { companyId });
            return this.getConditions(companyId);
        } finally {
            await queryRunner.release();
        }
    }

    async updateAutoOfferSettings(companyId: number, userId: number, body: UpdateAutoOfferSettingsRequest): Promise<CompanyConditionsResponse> {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            const rows = await queryRunner.query(
                `SELECT conditions_json, conditions_status FROM companies WHERE id = ?`,
                [companyId]
            );
            if (!rows || rows.length === 0) throw new Error('Company not found');
            const json = typeof rows[0].conditions_json === 'string' ? JSON.parse(rows[0].conditions_json || '{}') : (rows[0].conditions_json || {});
            const autoOfferSettings = {
                ...(json.autoOfferSettings || {}),
                ...(body.borrowerLevels != null && { borrowerLevels: body.borrowerLevels }),
                ...(body.loanAmountMin != null && { loanAmountMin: body.loanAmountMin }),
                ...(body.loanAmountMax != null && { loanAmountMax: body.loanAmountMax }),
                ...(body.loanDurations != null && { loanDurations: body.loanDurations }),
                ...(body.maxExposurePerBorrower != null && { maxExposurePerBorrower: body.maxExposurePerBorrower }),
                ...(body.maxTotalExposurePerLender != null && { maxTotalExposurePerLender: body.maxTotalExposurePerLender }),
                ...(body.maxTotalExposurePercent != null && { maxTotalExposurePercent: body.maxTotalExposurePercent }),
            };
            json.autoOfferSettings = autoOfferSettings;
            await queryRunner.query(
                `UPDATE companies SET conditions_json = ?, updated_at = NOW() WHERE id = ?`,
                [JSON.stringify(json), companyId]
            );
            await this.auditService.logAction(userId, 'CONDITIONS_AUTO_OFFER_UPDATED', 'COMPANY', companyId, { companyId });
            return this.getConditions(companyId);
        } finally {
            await queryRunner.release();
        }
    }
}
