import { Request, Response, NextFunction } from 'express';
import { JwtTokenUtil } from '../util/JwtTokenUtil';

/**
 * JWT Authentication Middleware
 * Validates JWT token from Authorization header
 * Extracts user info and attaches to request object
 */
export class AuthenticationMiddleware {
    /**
     * Verify JWT token from Authorization header
     * Middleware function to be used with Express
     */
    static verifyToken(req: Request, res: Response, next: NextFunction): void {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: No token provided',
            });
            return;
        }

        const token = JwtTokenUtil.extractTokenFromHeader(authHeader);

        if (!token) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: Invalid token format. Use "Bearer <token>"',
            });
            return;
        }

        // Validate token
        if (!JwtTokenUtil.validateToken(token)) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: Token is invalid or expired',
            });
            return;
        }

        try {
            // Extract claims from token
            const userId = JwtTokenUtil.getUserIdFromToken(token);
            const email = JwtTokenUtil.getEmailFromToken(token);
            const roleId = JwtTokenUtil.getRoleIdFromToken(token);

            // Attach user info to request object
            (req as any).user = {
                userId,
                email,
                roleId,
                token,
            };

            next();
        } catch (error: any) {
            console.error('Error verifying token:', error);
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized: Failed to verify token',
            });
        }
    }

    /**
     * Optional authentication middleware
     * Does not fail if token is missing, but validates if provided
     */
    static optionalVerifyToken(req: Request, res: Response, next: NextFunction): void {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            next();
            return;
        }

        const token = JwtTokenUtil.extractTokenFromHeader(authHeader);

        if (!token) {
            next();
            return;
        }

        if (!JwtTokenUtil.validateToken(token)) {
            next();
            return;
        }

        try {
            const userId = JwtTokenUtil.getUserIdFromToken(token);
            const email = JwtTokenUtil.getEmailFromToken(token);
            const roleId = JwtTokenUtil.getRoleIdFromToken(token);

            (req as any).user = {
                userId,
                email,
                roleId,
                token,
            };
        } catch (error: any) {
            console.log('Error extracting user from token:', error);
        }

        next();
    }

    /**
     * Extract user from request if authenticated
     */
    static getAuthenticatedUser(req: Request): any {
        return (req as any).user || null;
    }

    /**
     * Check if request is authenticated
     */
    static isAuthenticated(req: Request): boolean {
        return (req as any).user !== undefined;
    }
}
