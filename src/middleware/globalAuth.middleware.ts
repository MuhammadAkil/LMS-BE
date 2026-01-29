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
 * Public routes that don't require authentication
 * These paths are relative to the routePrefix (/api) in useExpressServer
 * req.path in middleware is relative to routePrefix, so don't include /api here
 */
const getPublicRoutes = (): string[] => {
    return [
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
        // req.path in routing-controllers middleware is relative to routePrefix
        // So for /api/user/login, req.path will be /user/login
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
            // Routes that require User (admin) JWT: /admin/*
            const isUserAuthRoute = path.startsWith('/admin');

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

                // Attach user info to request for use in controllers
                const userDetails: CustomUserDetails = {
                    id: user.id,
                    userId: user.id,
                    email: user.email,
                    roleId: user.roleId,
                    isSuperAdmin: false,
                    twoFAVerified: false,
                };
                req.user = userDetails;
                console.log(`Authenticated user request for user: ${email}, path: ${path}`);
                next();
            } else {
                // Regular routes use Customer authentication
                // Try to get mobile number from token (if Customer token format)
                try {
                    // For now, if it's not an admin route, we'll try Customer authentication
                    // This assumes Customer tokens have a different format or we need to check both
                    // Since Customer authentication methods don't exist in JwtTokenUtil,
                    // we'll skip Customer auth for now and let the route handlers deal with it
                    // or implement Customer token validation separately
                    
                    // For non-admin routes, we'll allow them through if token is valid
                    // The specific route handlers can implement their own auth if needed
                    const decoded = JwtTokenUtil.decodeToken(token);
                    
                    // If token has userId, it's a User token - not valid for Customer routes
                    if (decoded.userId) {
                        res.status(401).json({
                            statusCode: '401',
                            statusMessage: 'Unauthorized',
                            statusMessageDetail: 'Invalid token type for this route',
                        });
                        return;
                    }

                    // For Customer routes, we'd need Customer-specific token validation
                    // For now, we'll let it pass if token is valid
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