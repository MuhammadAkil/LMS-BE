import { Request, Response, NextFunction } from 'express';
import { UserStatusCode, UserRoleCode } from '../util/Enums';
import { UserRepository } from '../repository/UserRepository';

/**
 * LENDER GUARDS - Access control for LENDER module
 * All lender write operations must pass these guards
 */

const userRepository = new UserRepository();

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
            const fullUser = await userRepository.findById(user.id);

            if (!fullUser) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized: User not found',
                });
                return;
            }

            const userStatus = fullUser.statusId; // This should be mapped to status code from database
            const isBlockedOrFrozen =
                fullUser.statusId === 3 || fullUser.statusId === 4; // BLOCKED=3, FROZEN=4 (adjust based on your DB)
            const isActive = fullUser.statusId === 2; // ACTIVE=2 (adjust based on your DB)

            // BLOCKED users cannot do anything
            if (isBlockedOrFrozen && fullUser.statusId === 3) {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Forbidden: Account is blocked',
                    detail: 'Your account has been blocked. Contact support for assistance.',
                });
                return;
            }

            // FROZEN users are read-only
            if (isBlockedOrFrozen && fullUser.statusId === 4) {
                if (req.method !== 'GET') {
                    res.status(403).json({
                        statusCode: '403',
                        statusMessage: 'Forbidden: Account is frozen',
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

            // Check if user's verification level meets requirement
            if ((fullUser.level || 0) < requiredLevel) {
                res.status(403).json({
                    statusCode: '403',
                    statusMessage: 'Forbidden: Insufficient verification level',
                    detail: `This action requires verification level ${requiredLevel}. Current level: ${fullUser.level || 0}`,
                    redirectTo: '/lender/verifications', // Redirect to Verification Center
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

        // Check if user has verified bank account
        // Assuming bank account info is in a related table or user profile
        // This is a placeholder - adjust based on your schema
        const hasBankAccount = fullUser.phone !== null; // Replace with actual bank account check

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
