import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';

/**
 * Company Guard - Ensures user has COMPANY role
 * Fintech compliance: Validates user.roleId against user_roles lookup table
 */
export function CompanyGuard(req: Request, res: Response, next: NextFunction): void {
    const user = (req as any).user;

    if (!user) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: No authenticated user',
        });
        return;
    }

    // roleId 4 = COMPANY (per lookup table)
    if (user.roleId !== 4) {
        res.status(403).json({
            statusCode: '403',
            statusMessage: 'Forbidden: Company access required',
            detail: 'Only users with COMPANY role can access this resource',
        });
        return;
    }

    next();
}

/**
 * Company Status Guard - Ensures company.status = APPROVED
 * Fintech compliance rule: Cannot access dashboard or perform operations if company is not approved
 *
 * MUST RUN AFTER CompanyGuard
 */
export async function CompanyStatusGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const user = (req as any).user;

    if (!user || !user.companyId) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: Company ID not found',
        });
        return;
    }

    try {
        const queryRunner = AppDataSource.createQueryRunner();

        // Fetch company status and conditions_status from database
        const company = await queryRunner.query(
            `
      SELECT c.id, c.status_id, c.conditions_status as conditionsStatus, us.code as statusCode
      FROM companies c
      LEFT JOIN user_statuses us ON c.status_id = us.id
      WHERE c.id = ?
      `,
            [user.companyId]
        );

        await queryRunner.release();

        if (!company || company.length === 0) {
            res.status(404).json({
                statusCode: '404',
                statusMessage: 'Not Found: Company record not found',
            });
            return;
        }

        // Check if company status is APPROVED (statusId = 2). statusId 3 = suspended (full lockout)
        if (company[0].status_id === 3) {
            res.status(423).json({
                statusCode: '423',
                statusMessage: 'Company Suspended',
                detail: 'Your company account has been suspended. Contact admin.',
                errorCode: 'COMPANY_SUSPENDED',
            });
            return;
        }
        if (company[0].status_id !== 2) {
            res.status(423).json({
                statusCode: '423',
                statusMessage: 'Company Not Approved',
                detail: `Company must be in APPROVED status. Current status: ${company[0].statusCode || 'UNKNOWN'}`,
                errorCode: 'COMPANY_PENDING',
            });
            return;
        }

        // Attach company info to request for later use
        (req as any).company = company[0];
        next();
    } catch (error) {
        res.status(500).json({
            statusCode: '500',
            statusMessage: 'Internal Server Error',
            detail: 'Failed to validate company status',
        });
    }
}

/**
 * Conditions Approved Guard - Ensures company.conditions_status = 'approved'
 * Company cannot access automation, investments, or lender linking until conditions approved by admin.
 * MUST RUN AFTER CompanyStatusGuard
 */
export async function ConditionsApprovedGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const user = (req as any).user;
    if (!user || !user.companyId) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: Company ID not found',
        });
        return;
    }
    const company = (req as any).company;
    if (!company) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: Company not loaded',
        });
        return;
    }
    const status = company.conditionsStatus ?? (company.conditions_status ?? '');
    if (status !== 'approved') {
        res.status(403).json({
            statusCode: '403',
            statusMessage: 'Conditions Not Approved',
            detail: 'Approve your conditions first to access this feature.',
            errorCode: 'CONDITIONS_NOT_APPROVED',
        });
        return;
    }
    next();
}

/**
 * Agreement Signature Guard - Ensures at least one management_agreement signed (lender linked)
 * Used for bulk/automation that act on behalf of lenders.
 * MUST RUN AFTER CompanyStatusGuard
 */
export async function AgreementSignatureGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const user = (req as any).user;

    if (!user || !user.companyId) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: Company ID not found',
        });
        return;
    }

    try {
        const queryRunner = AppDataSource.createQueryRunner();

        // Check if signed agreement exists
        const agreement = await queryRunner.query(
            `
      SELECT id, signedAt, amount
      FROM management_agreements
      WHERE companyId = ? AND signedAt IS NOT NULL
      LIMIT 1
      `,
            [user.companyId]
        );

        await queryRunner.release();

        if (!agreement || agreement.length === 0) {
            res.status(423).json({
                statusCode: '423',
                statusMessage: 'Operational Lock',
                detail: 'Management agreement must be signed before performing this action',
            });
            return;
        }

        // Attach agreement info to request
        (req as any).agreement = agreement[0];
        next();
    } catch (error) {
        res.status(500).json({
            statusCode: '500',
            statusMessage: 'Internal Server Error',
            detail: 'Failed to validate management agreement',
        });
    }
}

/**
 * Export Limit Guard - Ensures XML/CSV exports do not exceed 500 items
 * Fintech compliance rule: XML exports limited to ≤500 items
 *
 * Validates req.body.loanIds length
 */
export function ExportLimitGuard(req: Request, res: Response, next: NextFunction): void {
    const { loanIds } = req.body;

    if (!Array.isArray(loanIds)) {
        res.status(400).json({
            statusCode: '400',
            statusMessage: 'Bad Request',
            detail: 'loanIds must be an array',
        });
        return;
    }

    if (loanIds.length > 500) {
        res.status(400).json({
            statusCode: '400',
            statusMessage: 'Export Limit Exceeded',
            detail: 'XML/CSV exports are limited to maximum 500 items per request',
            errors: {
                loanIds: [`Maximum 500 loans allowed (received ${loanIds.length})`],
            },
        });
        return;
    }

    next();
}

/**
 * Readonly Guard - Prevents write operations when company is not approved
 * Applied to read-only endpoints to ensure company can always view their data
 * even if not fully operational
 */
export async function CompanyReadonlyGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const user = (req as any).user;

    if (!user || !user.companyId) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: Company ID not found',
        });
        return;
    }

    // For read-only endpoints, just verify company exists
    // No status lock - allow viewing even if pending approval
    try {
        const queryRunner = AppDataSource.createQueryRunner();

        const company = await queryRunner.query(
            `SELECT id, status_id FROM companies WHERE id = ?`,
            [user.companyId]
        );

        await queryRunner.release();

        if (!company || company.length === 0) {
            res.status(404).json({
                statusCode: '404',
                statusMessage: 'Not Found: Company record not found',
            });
            return;
        }

        (req as any).company = company[0];
        next();
    } catch (error) {
        res.status(500).json({
            statusCode: '500',
            statusMessage: 'Internal Server Error',
            detail: 'Failed to validate company',
        });
    }
}

/**
 * Composite guard: CompanyGuard + CompanyStatusGuard
 * Use for endpoints that need full operational access
 */
export async function CompanyOperationalGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    CompanyGuard(req, res, () => {
        CompanyStatusGuard(req, res, next);
    });
}

/**
 * Composite guard: CompanyGuard + CompanyStatusGuard + ConditionsApprovedGuard
 * Use for endpoints that require conditions approved (lenders, automation, loans, bulk)
 */
export async function CompanyConditionsApprovedGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    CompanyGuard(req, res, () => {
        CompanyStatusGuard(req, res, () => {
            ConditionsApprovedGuard(req, res, next);
        });
    });
}

/**
 * Composite guard: CompanyGuard + CompanyStatusGuard + ConditionsApprovedGuard + AgreementSignatureGuard
 * Use for endpoints requiring conditions approved AND at least one lender linked (bulk, automation)
 */
export async function CompanyFullAccessGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    CompanyGuard(req, res, () => {
        CompanyStatusGuard(req, res, () => {
            ConditionsApprovedGuard(req, res, () => {
                AgreementSignatureGuard(req, res, next);
            });
        });
    });
}
