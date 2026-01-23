import { ExpressMiddlewareInterface, Middleware } from 'routing-controllers';
import { Request, Response, NextFunction } from 'express';
import { JwtTokenUtil } from '../util/JwtTokenUtil';
import { CustomerAuthSessionRepository } from '../repository/CustomerAuthSessionRepository';
import { CustomerService } from '../service/CustomerService';
import { CustomUserDetails } from '../security/CustomUserDetails';

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
            const mobileNumber = JwtTokenUtil.getMobileNumberFromToken(token);
            if (!mobileNumber) {
                console.log('Invalid token: mobile number not found');
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    statusMessageDetail: 'Invalid token',
                });
                return;
            }

            // Verify customer exists
            const customerService = new CustomerService();
            const customer = await customerService.getCustomerByMobileNumber(mobileNumber);

            if (!customer) {
                console.log(`Customer not found for mobile number: ${mobileNumber}`);
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    statusMessageDetail: 'Customer not found',
                });
                return;
            }

            // Validate token with customerId
            const customerIdFromToken = JwtTokenUtil.getCustomerIdFromToken(token);
            const customerIdString = customer.id.toHexString();
            const isValid = JwtTokenUtil.validateToken(token, customerIdString);

            if (!isValid || customerIdFromToken !== customerIdString) {
                console.log('Invalid JWT token or customerId mismatch');
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    statusMessageDetail: 'Invalid token',
                });
                return;
            }

            // Check if session is active
            const sessionRepository = new CustomerAuthSessionRepository();
            const activeSession = await sessionRepository.findByJwtToken(token);

            if (!activeSession) {
                console.log('Token not found in active sessions');
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    statusMessageDetail: 'Session expired or invalid',
                });
                return;
            }

            // Attach user info to request for use in controllers
            const userDetails: CustomUserDetails = {
                customerId: customer.id.toHexString(),
                mobileNumber: customer.mobileNumber,
                fullName: customer.fullName,
            };
            req.user = userDetails;
            console.log(`Authenticated request for mobile: ${mobileNumber}, path: ${path}`);
            next();
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