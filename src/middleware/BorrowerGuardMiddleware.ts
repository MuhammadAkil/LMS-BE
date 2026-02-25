import { ExpressMiddlewareInterface, Middleware } from 'routing-controllers';
import { Request, Response, NextFunction } from 'express';
import { BorrowerRoleGuard, BorrowerStatusGuard } from './BorrowerGuards';

/**
 * Runs after GlobalAuthMiddleware for routes under /api/borrower/*.
 * Enforces: borrower role (roleId === 2), then status (BLOCKED=403, FROZEN=GET only, ACTIVE=full).
 */
@Middleware({ type: 'before', priority: 2 })
export class BorrowerGuardMiddleware implements ExpressMiddlewareInterface {
    async use(req: Request, res: Response, next: NextFunction): Promise<void> {
        const path = (req as any).path ?? req.path ?? req.url;
        if (!path.includes('/borrower')) {
            return next();
        }

        await BorrowerRoleGuard(req, res, () => {
            if (res.headersSent) return;
            const allowReadOnly = req.method.toUpperCase() === 'GET';
            const statusGuard = BorrowerStatusGuard(allowReadOnly);
            statusGuard(req, res, next);
        });
    }
}
