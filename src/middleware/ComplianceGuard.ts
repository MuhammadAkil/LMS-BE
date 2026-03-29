import { Request, Response, NextFunction } from 'express';

/**
 * Allows only BORROWER (2), LENDER (3), COMPANY (4) to access compliance endpoints.
 * Admins (1) are not required to accept documents; they can be allowed or denied.
 */
export function ComplianceGuard(req: Request, res: Response, next: NextFunction): void {
    const user = (req as any).user;
    if (!user) {
        res.status(401).json({
            statusCode: '401',
            statusMessage: 'Unauthorized',
        });
        return;
    }
    const roleId = Number(user.roleId);
    if (roleId !== 2 && roleId !== 3 && roleId !== 4) {
        res.status(403).json({
            statusCode: '403',
            statusMessage: 'Forbidden: Compliance endpoints are for borrowers, lenders, and companies only',
        });
        return;
    }
    next();
}
