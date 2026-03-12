import { ExpressMiddlewareInterface, Middleware } from 'routing-controllers';
import { Request, Response, NextFunction } from 'express';
import { BorrowerRoleGuard, BorrowerStatusGuard } from './BorrowerGuards';
import { VerificationAccessService } from '../service/VerificationAccessService';

/**
 * Runs after GlobalAuthMiddleware for routes under /api/borrower/*.
 * Enforces: borrower role (roleId === 2), then status (BLOCKED=403, FROZEN=GET only, ACTIVE=full).
 */
@Middleware({ type: 'before', priority: 50 })
export class BorrowerGuardMiddleware implements ExpressMiddlewareInterface {
    private readonly verificationAccessService = new VerificationAccessService();

    async use(req: Request, res: Response, next: NextFunction): Promise<void> {
        const path = (req as any).path ?? req.path ?? req.url;
        if (!path.includes('/borrower')) {
            return next();
        }

        await BorrowerRoleGuard(req, res, () => {
            if (res.headersSent) return;
            const allowReadOnly = req.method.toUpperCase() === 'GET';
            const statusGuard = BorrowerStatusGuard(allowReadOnly);
            statusGuard(req, res, async () => {
                if (res.headersSent) return;
                const user = (req as any).user;
                if (!user?.id || !user?.roleId) {
                    res.status(401).json({
                        statusCode: '401',
                        statusMessage: 'Unauthorized: Missing authenticated user',
                    });
                    return;
                }

                if (this.verificationAccessService.isVerificationBypassPath(path)) {
                    next();
                    return;
                }

                const gate = await this.verificationAccessService.getVerificationGate(Number(user.id), Number(user.roleId));
                if (!gate.isVerified) {
                    res.status(403).json({
                        statusCode: '403',
                        statusMessage: 'Verification required',
                        detail: 'Complete and get admin approval for all required verification documents to use borrower platform features.',
                        missingRequirements: gate.missingCategories,
                        redirectTo: '/api/borrower/verification/requirements',
                        errorCode: 'VERIFICATION_INCOMPLETE',
                    });
                    return;
                }

                next();
            });
        });
    }
}
