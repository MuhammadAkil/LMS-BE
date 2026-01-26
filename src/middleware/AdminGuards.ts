import { Request, Response, NextFunction } from 'express';
import { UserRoleCode } from '../util/Enums';

/**
 * Admin Guard - Ensures user has ADMIN role
 * Attaches user info to request if authenticated
 */
export function AdminGuard(req: Request, res: Response, next: NextFunction): void {
  // Assuming authentication middleware already ran and attached user to req
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      statusCode: '401',
      statusMessage: 'Unauthorized: No authenticated user',
    });
    return;
  }

  if (user.roleId !== 1) {
    // roleId 1 = ADMIN
    res.status(403).json({
      statusCode: '403',
      statusMessage: 'Forbidden: Admin access required',
      detail: 'Only users with ADMIN role can access this resource',
    });
    return;
  }

  next();
}

/**
 * SuperAdmin Guard - Ensures user has ADMIN role AND super_admin flag
 * Required for critical operations
 */
export function SuperAdminGuard(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      statusCode: '401',
      statusMessage: 'Unauthorized: No authenticated user',
    });
    return;
  }

  if (user.roleId !== 1) {
    // roleId 1 = ADMIN
    res.status(403).json({
      statusCode: '403',
      statusMessage: 'Forbidden: Admin access required',
    });
    return;
  }

  // Check if user has super-admin flag (stored in custom field)
  if (!user.isSuperAdmin) {
    res.status(403).json({
      statusCode: '403',
      statusMessage: 'Forbidden: Super-admin access required',
      detail: 'This critical operation requires super-admin privileges',
    });
    return;
  }

  next();
}

/**
 * 2FA Verified Guard - Ensures user has completed 2FA verification
 * Required for sensitive operations
 */
export function TwoFAVerifiedGuard(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      statusCode: '401',
      statusMessage: 'Unauthorized: No authenticated user',
    });
    return;
  }

  // Assuming 2FA verification flag is stored in user object
  if (!user.twoFAVerified) {
    res.status(403).json({
      statusCode: '403',
      statusMessage: 'Forbidden: 2FA verification required',
      detail: 'This operation requires two-factor authentication verification',
    });
    return;
  }

  next();
}

/**
 * Combined guard for critical operations: Admin + SuperAdmin + 2FA
 */
export function CriticalOperationGuard(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      statusCode: '401',
      statusMessage: 'Unauthorized: No authenticated user',
    });
    return;
  }

  if (user.roleId !== 1) {
    res.status(403).json({
      statusCode: '403',
      statusMessage: 'Forbidden: Admin access required',
    });
    return;
  }

  if (!user.isSuperAdmin) {
    res.status(403).json({
      statusCode: '403',
      statusMessage: 'Forbidden: Super-admin access required',
    });
    return;
  }

  if (!user.twoFAVerified) {
    res.status(403).json({
      statusCode: '403',
      statusMessage: 'Forbidden: 2FA verification required',
    });
    return;
  }

  next();
}
