import { Request, Response, NextFunction } from 'express';
import { UserRepository } from '../repository/UserRepository';
import { ManagementAgreementRepository } from '../repository/ManagementAgreementRepository';
import { VerificationAccessService } from '../service/VerificationAccessService';

/**
 * LENDER GUARDS - Access control for LENDER module
 * All lender write operations must pass these guards
 */

const userRepository = new UserRepository();
const managementAgreementRepository = new ManagementAgreementRepository();
const verificationAccessService = new VerificationAccessService();
const isE2EMode = String(process.env.E2E_MOCK_PAYMENT ?? '').toLowerCase() === 'true';

/**
 * LenderRoleGuard
 * Ensures user has LENDER role
 * Must be applied to all /lender/* routes
 */
export async function LenderRoleGuard(
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

    try {
        const fullUser = await userRepository.findById(user.id);

        if (!fullUser) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: User not found',
            });
            return;
        }

        // Verify role is LENDER (role_id = 3, assuming from your schema)
        if (fullUser.roleId !== 3) {
            res.status(403).json({
                statusCode: '403',
                statusMessage: 'Forbidden: LENDER role required',
                detail: 'Only users with LENDER role can access this resource',
            });
            return;
        }

        // Attach full user object for downstream use
        const path = (req as any).path ?? req.path ?? req.url;
        if (!isE2EMode && !verificationAccessService.isVerificationBypassPath(String(path))) {
            const gate = await verificationAccessService.getVerificationGate(Number(fullUser.id), Number(fullUser.roleId));
            if (!gate.isVerified) {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Verification required',
                    detail: 'Complete and get admin approval for all required verification documents to use lender platform features.',
                    missingRequirements: gate.missingCategories,
                    redirectTo: '/api/lender/verifications',
                    errorCode: 'VERIFICATION_INCOMPLETE',
                });
                return;
            }
        }

        (req as any).user = fullUser;
        next();
    } catch (error: any) {
        console.error('Error in LenderRoleGuard:', error);
        res.status(500).json({
            statusCode: '500',
            statusMessage: 'Internal server error',
        });
    }
}

/**
 * LenderStatusGuard
 * Enforces read-only mode for non-ACTIVE users
 * Rules:
 * - status = BLOCKED → full lock
 * - status != ACTIVE → read-only (GET allowed, POST/PATCH/DELETE blocked)
 * Pass allowReadOnly=true to allow GET requests for non-ACTIVE users
 */
export async function LenderStatusGuard(allowReadOnly: boolean = false) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = (req as any).user;

        if (!user) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: No authenticated user',
            });
            return;
        }

        try {
            // Reuse full user already fetched by LenderRoleGuard (has statusId); avoid a second DB hit
            const fullUser = user.statusId != null ? user : await userRepository.findById(user.id);

            if (!fullUser) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized: User not found',
                });
                return;
            }

            const isBlockedOrFrozen =
                fullUser.statusId === 3 || fullUser.statusId === 4; // BLOCKED=3, FROZEN=4 (adjust based on your DB)
            const isActive = fullUser.statusId === 2; // ACTIVE=2 (adjust based on your DB)

            // BLOCKED users cannot do anything — return distinct code for frontend
            if (isBlockedOrFrozen && fullUser.statusId === 3) {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Forbidden: Account is blocked',
                    errorCode: 'ACCOUNT_BLOCKED',
                    detail: 'Your account has been blocked. Contact support for assistance.',
                });
                return;
            }

            // FROZEN users are read-only — return distinct code for frontend
            if (isBlockedOrFrozen && fullUser.statusId === 4) {
                if (req.method !== 'GET') {
                    res.status(403).json({
                        statusCode: '403',
                        statusMessage: 'Forbidden: Account is frozen',
                        errorCode: 'ACCOUNT_FROZEN',
                        detail: 'Your account is frozen. You can only view data.',
                    });
                    return;
                }
            }

            // Non-ACTIVE users
            if (!isActive) {
                // Allow read-only if specified
                if (allowReadOnly && req.method === 'GET') {
                    next();
                    return;
                }

                // Deny write operations for non-ACTIVE users
                if (req.method !== 'GET') {
                    res.status(403).json({
                        statusCode: '403',
                        statusMessage: 'Forbidden: Account not active',
                        detail: 'You must have an ACTIVE account to perform this action',
                    });
                    return;
                }
            }

            (req as any).user = fullUser;
            next();
        } catch (error: any) {
            console.error('Error in LenderStatusGuard:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
            });
        }
    };
}

/**
 * LenderVerificationGuard
 * Enforces verification level requirements for sensitive operations
 * Rules:
 * - verification_level < required → redirect to Verification Center
 * - Checks: level field in users table
 * Pass requiredLevel parameter to specify minimum verification level
 */
export async function LenderVerificationGuard(requiredLevel: number = 0) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (isE2EMode) {
            next();
            return;
        }
        const user = (req as any).user;

        if (!user) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: No authenticated user',
            });
            return;
        }

        try {
            // Reuse full user already fetched by a previous guard if available
            const fullUser = user.statusId != null ? user : await userRepository.findById(user.id);

            if (!fullUser) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized: User not found',
                });
                return;
            }

            // Check if user's verification level meets requirement
            if ((fullUser.level || 0) < requiredLevel) {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Forbidden: Insufficient verification level',
                    detail: `This action requires verification level ${requiredLevel}. Current level: ${fullUser.level || 0}`,
                    redirectTo: '/lender/verification', // Redirect to Verification Center
                });
                return;
            }

            (req as any).user = fullUser;
            next();
        } catch (error: any) {
            console.error('Error in LenderVerificationGuard:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Internal server error',
            });
        }
    };
}

/**
 * LenderBankAccountGuard
 * Enforces bank account requirement for investment operations
 * Cannot invest if bank account is missing or unverified
 */
export async function LenderBankAccountGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    if (isE2EMode) {
        next();
        return;
    }
    const user = (req as any).user;

    if (!user) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: No authenticated user',
        });
        return;
    }

    try {
        // Reuse full user already fetched by a previous guard if available
        const fullUser = user.statusId != null ? user : await userRepository.findById(user.id);

        if (!fullUser) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: User not found',
            });
            return;
        }

        // Check if user has a bank account registered (IBAN in bank_account column)
        const hasBankAccount = fullUser.bankAccount != null && String(fullUser.bankAccount).trim().length > 0;

        if (!hasBankAccount) {
            res.status(403).json({
                statusCode: '403',
                statusMessage: 'Forbidden: Bank account required',
                detail: 'You must add and verify a bank account before investing',
                redirectTo: '/lender/profile',
            });
            return;
        }

        (req as any).user = fullUser;
        next();
    } catch (error: any) {
        console.error('Error in LenderBankAccountGuard:', error);
        res.status(500).json({
            statusCode: '500',
            statusMessage: 'Internal server error',
        });
    }
}

/**
 * LenderManagedGuard
 * Blocks lenders who have an active management agreement from making direct offers.
 * Must be applied to POST /lender/offers (and any other direct-offer endpoints).
 */
export async function LenderManagedGuard(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    if (isE2EMode) {
        next();
        return;
    }
    const user = (req as any).user;
    if (!user) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized: No authenticated user',
        });
        return;
    }
    try {
        // Allowlisted demo/test lenders can always place manual offers,
        // even if they have a management agreement.
        const allowlistedEmails = new Set<string>([
            'lender@lms.com',
            'borrower@lms.com',
        ]);
        if (user.email && allowlistedEmails.has(String(user.email).toLowerCase())) {
            next();
            return;
        }

        const activeAgreement = await managementAgreementRepository.findActiveByLenderId(user.id);
        if (activeAgreement) {
            res.status(403).json({
                statusCode: '403',
                statusMessage: 'Forbidden: Manual offers are disabled',
                errorCode: 'LENDER_IS_MANAGED',
                detail: 'Your funds are managed by a company. Manual offers are disabled.',
            });
            return;
        }
        next();
    } catch (error: any) {
        console.error('Error in LenderManagedGuard:', error);
        res.status(500).json({
            statusCode: '500',
            statusMessage: 'Internal server error',
        });
    }
}

/**
 * Composite Guard - Apply multiple guards in sequence
 * Note: Use spread operator with array of guards: ...lenderGuardChain()
 * Express will automatically chain middleware functions
 */
export function applyLenderGuards(guards: Array<any>) {
    return (req: Request, res: Response, next: NextFunction) => {
        let index = 0;

        const executeNext = async () => {
            if (index >= guards.length) {
                next();
                return;
            }

            const guard = guards[index++];
            try {
                // Direct middleware function
                await guard(req, res, executeNext);
            } catch (error) {
                console.error('Error executing guard:', error);
                res.status(500).json({
                    statusCode: '500',
                    statusMessage: 'Internal server error',
                });
            }
        };

        executeNext();
    };
}
