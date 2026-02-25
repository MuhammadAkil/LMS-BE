import { ExpressMiddlewareInterface, Middleware } from 'routing-controllers';
import { Request, Response, NextFunction } from 'express';
import { JwtTokenUtil } from '../util/JwtTokenUtil';
import { CustomerAuthSessionRepository } from '../repository/CustomerAuthSessionRepository';
import { CustomerService } from '../service/CustomerService';
import { CustomUserDetails } from '../security/CustomUserDetails';
import { UserService } from '../service/UserService';
import { UserSessionRepository } from '../repository/UserSessionRepository';

declare global {
    namespace Express {
        interface Request {
            user?: CustomUserDetails;
        }
    }
}

/**
 * Public routes that don't require authentication.
 * req.path in Express is the full path (e.g. /api/users/login),
 * so we include both /api-prefixed and bare paths to be safe.
 */
const getPublicRoutes = (): string[] => {
    return [
        // With /api prefix (actual req.path value)
        '/api/users/login',
        '/api/users/signup',
        '/api/users/logout',
        '/api/auth/admin/login',
        '/api/user/login',
        '/api/user/signup',
        '/api/user/logout',
        '/api/docs',
        '/api/docs/**',
        // Without /api prefix (fallback)
        '/users/login',
        '/users/signup',
        '/users/logout',
        '/user/login',
        '/user/signup',
        '/user/logout',
        '/health',
        '/docs',
        '/docs/**',
    ];
};

/**
 * Global authentication middleware
 * Requires authentication for all routes except those in PUBLIC_ROUTES
 */
@Middleware({ type: 'before', priority: 1 })
export class GlobalAuthMiddleware implements ExpressMiddlewareInterface {
    async use(req: Request, res: Response, next: NextFunction): Promise<void> {
        // req.path is the full path including /api prefix (e.g. /api/users/login)
        const path = req.path;

        // Debug: log path to understand what we're receiving
        console.log('Auth middleware - path:', path, 'originalUrl:', req.originalUrl, 'url:', req.url);

        const publicRoutes = getPublicRoutes();

        // Check if route is public
        const isPublicRoute = publicRoutes.some((route) => {
            if (route.endsWith('/**')) {
                // Handle wildcard routes like /api/user/**
                const baseRoute = route.replace('/**', '');
                return path.startsWith(baseRoute);
            }
            return path === route || path.startsWith(route + '/');
        });

        if (isPublicRoute) {
            console.log(`Public route accessed: ${path}`);
            return next();
        }

        // Require authentication for all other routes
        const authHeader = req.headers.authorization;
        let token: string | null = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else {
            console.log(`JWT Token missing or invalid format for path: ${path}`);
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized',
                statusMessageDetail: 'Authorization is required for this request',
            });
            return;
        }

        if (!token) {
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized',
                statusMessageDetail: 'Authorization is required for this request',
            });
            return;
        }

        try {
            // All LMS routes use User JWT — treat every authenticated route as a User route
            const isUserAuthRoute =
                path.startsWith('/api/admin') ||
                path.startsWith('/api/payments') ||
                path.startsWith('/api/company') ||
                path.startsWith('/api/lender') ||
                path.startsWith('/api/borrower') ||
                path.startsWith('/api/repayment') ||
                // fallback without /api prefix
                path.startsWith('/admin') ||
                path.startsWith('/payments') ||
                path.startsWith('/company') ||
                path.startsWith('/lender') ||
                path.startsWith('/borrower') ||
                path.startsWith('/repayment');

            if (isUserAuthRoute) {
                // User JWT validation
                if (!JwtTokenUtil.validateToken(token)) {
                    res.status(401).json({
                        statusCode: '401',
                        statusMessage: 'Unauthorized',
                        statusMessageDetail: 'Invalid or expired token',
                    });
                    return;
                }

                // Extract user info from token
                const userId = JwtTokenUtil.getUserIdFromToken(token);
                const email = JwtTokenUtil.getEmailFromToken(token);
                const roleId = JwtTokenUtil.getRoleIdFromToken(token);

                if (!userId || !email || !roleId) {
                    res.status(401).json({
                        statusCode: '401',
                        statusMessage: 'Unauthorized',
                        statusMessageDetail: 'Invalid token: missing user information',
                    });
                    return;
                }

                // Verify user exists and get full user details
                const userService = new UserService();
                const user = await userService.getUserById(userId);

                if (!user) {
                    res.status(401).json({
                        statusCode: '401',
                        statusMessage: 'Unauthorized',
                        statusMessageDetail: 'User not found',
                    });
                    return;
                }

                // Check if session is active
                const userSessionRepo = new UserSessionRepository();
                const activeSession = await userSessionRepo.findByToken(token);

                if (!activeSession) {
                    res.status(401).json({
                        statusCode: '401',
                        statusMessage: 'Unauthorized',
                        statusMessageDetail: 'Session expired or invalid',
                    });
                    return;
                }

                // Attach user info to request — set both id and userId so all guards work
                const userDetails: CustomUserDetails = {
                    id: user.id,
                    userId: user.id,
                    email: user.email,
                    roleId: user.roleId,
                    isSuperAdmin: user.isSuperAdmin ?? false,
                    twoFAVerified: false,
                };
                // Also expose roleId directly on the object for guards that read user.roleId
                (userDetails as any).roleId = user.roleId;

                // For COMPANY role (roleId === 4), resolve companyId from the user record
                if (user.roleId === 4) {
                    userDetails.companyId = user.companyId ?? undefined;
                }

                req.user = userDetails;
                console.log(`Authenticated user request for user: ${email}, path: ${path}`);
                next();
            } else {
                // Regular routes use Customer authentication
                try {
                    const decoded = JwtTokenUtil.decodeToken(token);

                    // If token has userId, it's a User token — not valid for Customer routes
                    if (decoded.userId) {
                        res.status(401).json({
                            statusCode: '401',
                            statusMessage: 'Unauthorized',
                            statusMessageDetail: 'Invalid token type for this route',
                        });
                        return;
                    }

                    // For Customer routes, we'd need Customer-specific token validation
                    // TODO: Implement Customer token validation when Customer auth is needed
                    next();
                } catch (error: any) {
                    console.log('Customer authentication error:', error);
                    res.status(401).json({
                        statusCode: '401',
                        statusMessage: 'Unauthorized',
                        statusMessageDetail: error.message || 'Authentication failed',
                    });
                }
            }
        } catch (error: any) {
            console.log('Authentication error:', error);
            res.status(401).json({
                statusCode: '401',
                statusMessage: 'Unauthorized',
                statusMessageDetail: error.message || 'Authentication failed',
            });
        }
    }
}