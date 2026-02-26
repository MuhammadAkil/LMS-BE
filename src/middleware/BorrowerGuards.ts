import { Request, Response, NextFunction } from 'express';
import { UserRepository } from '../repository/UserRepository';
import { PlatformConfigRepository } from '../repository/PlatformConfigRepository';

/**
 * BORROWER GUARDS - Access control for borrower endpoints
 * Enforces: Role → Status → Verification Level → Commission Payment
 */

// ============================================
// BORROWER ROLE GUARD
// ============================================

/**
 * Ensures user has BORROWER role (role_id = 2)
 * Required for all /borrower/* endpoints
 */
export async function BorrowerRoleGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const user = (req as any).user;

    if (!user) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: No authenticated user',
        });
        return;
    }

    // Role ID 2 = BORROWER (from user_roles lookup table)
    if (user.roleId !== 2) {
        res.status(403).json({
            statusCode: '403',
            statusMessage: 'Forbidden: Borrower access required',
            detail: 'Only users with BORROWER role can access this resource',
        });
        return;
    }

    next();
}

// ============================================
// BORROWER STATUS GUARD
// ============================================

/**
 * Enforces borrower status rules:
 * - BLOCKED (status_id = 4): Full lock, all endpoints return 403
 * - FROZEN (status_id = 3): Read-only (GET only), POST/PUT/DELETE blocked
 * - Inactive (status_id ≠ 1): Limited read-only access if allowReadOnly=true
 * - ACTIVE (status_id = 1): Full access
 *
 * @param allowReadOnly - If true, non-ACTIVE users can access GET endpoints
 */
export function BorrowerStatusGuard(allowReadOnly: boolean = false) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = (req as any).user;

        if (!user) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: No authenticated user',
            });
            return;
        }

        // Status ID 2 = ACTIVE, 3 = BLOCKED, 4 = FROZEN (aligned with UserService, AdminUsersService)
        const status = user.statusId;

        // BLOCKED users: Full lock — cannot access any borrower endpoints
        if (status === 3) {
            res.status(403).json({
                statusCode: '403',
                statusMessage: 'Forbidden: Account is blocked',
                detail: 'Your account has been blocked. Contact support for assistance.',
                errorCode: 'ACCOUNT_BLOCKED',
            });
            return;
        }

        // FROZEN users: Read-only (GET only) — can login and view, cannot create requests
        if (status === 4) {
            const method = req.method.toUpperCase();
            if (method !== 'GET') {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Forbidden: Account is frozen',
                    detail: 'Your account is frozen. You can view data but cannot create new requests. Contact support for assistance.',
                    errorCode: 'ACCOUNT_FROZEN',
                });
                return;
            }
            next();
            return;
        }

        // Non-ACTIVE users (e.g. PENDING 1): Limited read-only if allowReadOnly=true
        if (status !== 2) {
            if (!allowReadOnly) {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Forbidden: Account status does not permit this action',
                    detail: 'Your account must be ACTIVE to perform this operation',
                });
                return;
            }

            const method = req.method.toUpperCase();
            if (method !== 'GET') {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Forbidden: Read-only access only',
                });
                return;
            }
        }

        next();
    };
}

// ============================================
// BORROWER VERIFICATION GUARD
// ============================================

/**
 * Enforces borrower verification level requirements:
 * - user.level < requiredLevel → redirect to verification center
 * - user.level = F (0) → loan creation forbidden
 * - Progressive access: Level 0 (F) < Level 1 < Level 2 < Level 3
 *
 * Verification levels:
 * - F (0): No verification, basic read-only access
 * - 1: Email verified, can create applications
 * - 2: KYC passed, can receive loan offers
 * - 3: Enhanced (bank verified, etc.), full access
 *
 * @param requiredLevel - Minimum verification level required (0-3)
 */
export function BorrowerVerificationGuard(requiredLevel: number = 0) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = (req as any).user;

        if (!user) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: No authenticated user',
            });
            return;
        }

        // Fetch user's verification level from database
        // TODO: Implement verification level lookup
        const userLevel = user.level || 0; // F = 0

        if (userLevel < requiredLevel) {
            res.status(403).json({
                statusCode: '403',
                statusMessage: 'Forbidden: Verification level insufficient',
                detail: `Required verification level: ${requiredLevel}, Current: ${userLevel}`,
                redirectTo: '/api/verification/requirements',
            });
            return;
        }

        // Special rule: Level F (0) cannot create applications
        if (userLevel === 0 && req.path.includes('/applications') && req.method === 'POST') {
            res.status(403).json({
                statusCode: '403',
                statusMessage: 'Forbidden: Loan application creation requires verification',
                detail: 'You must complete email verification before creating a loan application',
                redirectTo: '/api/verification/requirements',
            });
            return;
        }

        next();
    };
}

// ============================================
// BORROWER COMMISSION PAYMENT GUARD
// ============================================

/**
 * Ensures commission payment is PAID before loan activation
 * Rules:
 * - If loan is DRAFT or PENDING → must have paid commission
 * - If commission status ≠ PAID → block loan activation operations
 * - If no commission record exists → block loan operations
 *
 * Required for: loan activation, loan acceptance endpoints
 */
export async function BorrowerCommissionPaymentGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const user = (req as any).user;

    if (!user) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: No authenticated user',
        });
        return;
    }

    // TODO: Query payments table for commission_type payment with status = PAID
    // SELECT status FROM payments WHERE borrower_id = ? AND payment_type_id = COMMISSION_ID ORDER BY created_at DESC LIMIT 1
    const commissionPaid = user.commissionPaid || false; // TODO: Fetch from DB

    if (!commissionPaid) {
        res.status(403).json({
            statusCode: '403',
            statusMessage: 'Forbidden: Commission payment required',
            detail: 'Commission payment must be completed before loan activation',
            redirectTo: '/api/payments/commission',
        });
        return;
    }

    next();
}

// ============================================
// COMPOSITE GUARD CHAINS
// ============================================

/**
 * Standard guard chain for borrower endpoints
 * Order: Role → Status → Verification
 * allowReadOnly: true for GET endpoints
 * requiredLevel: verification level (0-3)
 */
export async function applyBorrowerGuards(
    req: Request,
    res: Response,
    next: NextFunction,
    allowReadOnly: boolean = false,
    requiredLevel: number = 0
): Promise<void> {
    // Chain: Role → Status → Verification
    try {
        // 1. Role Guard
        await new Promise<void>((resolve, reject) => {
            BorrowerRoleGuard(req, res, (err?: any) => {
                if (err) reject(err);
                else if (res.headersSent) reject(new Error('Response sent by guard'));
                else resolve();
            });
        });

        // 2. Status Guard
        const statusGuard = BorrowerStatusGuard(allowReadOnly);
        await new Promise<void>((resolve, reject) => {
            statusGuard(req, res, (err?: any) => {
                if (err) reject(err);
                else if (res.headersSent) reject(new Error('Response sent by guard'));
                else resolve();
            });
        });

        // 3. Verification Guard
        const verificationGuard = BorrowerVerificationGuard(requiredLevel);
        await new Promise<void>((resolve, reject) => {
            verificationGuard(req, res, (err?: any) => {
                if (err) reject(err);
                else if (res.headersSent) reject(new Error('Response sent by guard'));
                else resolve();
            });
        });

        next();
    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                detail: error.message,
            });
        }
    }
}

/**
 * Investment guard chain for critical loan operations
 * Order: Role → Status (ACTIVE only) → Verification (L2+) → Commission Payment
 * Used for: Accept offer, activate loan, etc.
 */
export async function applyBorrowerInvestmentGuards(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // 1. Role Guard
        await new Promise<void>((resolve, reject) => {
            BorrowerRoleGuard(req, res, (err?: any) => {
                if (err) reject(err);
                else if (res.headersSent) reject(new Error('Response sent by guard'));
                else resolve();
            });
        });

        // 2. Status Guard (ACTIVE only, no read-only)
        const statusGuard = BorrowerStatusGuard(false);
        await new Promise<void>((resolve, reject) => {
            statusGuard(req, res, (err?: any) => {
                if (err) reject(err);
                else if (res.headersSent) reject(new Error('Response sent by guard'));
                else resolve();
            });
        });

        // 3. Verification Guard (Level 2+ required)
        const verificationGuard = BorrowerVerificationGuard(2);
        await new Promise<void>((resolve, reject) => {
            verificationGuard(req, res, (err?: any) => {
                if (err) reject(err);
                else if (res.headersSent) reject(new Error('Response sent by guard'));
                else resolve();
            });
        });

        // 4. Commission Payment Guard
        await new Promise<void>((resolve, reject) => {
            BorrowerCommissionPaymentGuard(req, res, (err?: any) => {
                if (err) reject(err);
                else if (res.headersSent) reject(new Error('Response sent by guard'));
                else resolve();
            });
        });

        next();
    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
                detail: error.message,
            });
        }
    }
}
