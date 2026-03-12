import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { useExpressServer } from 'routing-controllers';
import config from './config/Config';
import { AppDataSource } from './config/database';
import { initializeSwagger } from './config/SwaggerConfig';
import { GlobalAuthMiddleware } from './middleware/globalAuth.middleware';
import { BorrowerGuardMiddleware } from './middleware/BorrowerGuardMiddleware';
import { errorHandler } from './middleware/errorHandler';
import path from 'path';

const PORT = config.server.port;

const INTERNAL_API_PREFIX = "/api";

// Rate limit: 10 login attempts per 15 min per IP (per spec)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many login attempts. Try again in 15 minutes.' } },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limit: 5 signup attempts per hour per IP
const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many signup attempts. Try again in 1 hour.' } },
    standardHeaders: true,
    legacyHeaders: false,
});

// Create Express app
const expressApp = express();

// Build allowed origins: include localhost dev ports and FRONTEND_URL if configured
const allowedOrigins: (string | RegExp)[] = [
    /^https?:\/\/localhost(:\d+)?$/,
];
if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

// Middleware
expressApp.use(helmet());
expressApp.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

// Apply rate limits to auth routes
expressApp.use('/api/users/login', loginLimiter);
expressApp.use('/api/auth/admin/login', loginLimiter);
expressApp.use('/api/users/signup', signupLimiter);

// Health check (before routing-controllers)
expressApp.get('/health', (_req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Przelewy24 webhook (public, no auth) — must be reachable by P24 servers
expressApp.post('/webhook/p24', async (req, res) => {
    try {
        const body = req.body;
        const { sessionId, orderId, amount, currency, sign } = body;

        // Determine payment type by looking up the payment record
        const { PaymentRepository } = await import('./repository/PaymentRepository');
        const paymentRepo = new PaymentRepository();
        const payment = await paymentRepo.findBySessionId(sessionId);

        if (payment && (payment.paymentStep === 'PORTAL_COMMISSION' || payment.paymentStep === 'VOLUNTARY_COMMISSION')) {
            // Route to commission payment handler
            const { BorrowerPaymentsService } = await import('./service/BorrowerPaymentsService');
            const service = new BorrowerPaymentsService();
            await service.handleCommissionWebhook(sessionId, orderId, amount, currency ?? 'PLN', sign);
        } else if (payment && payment.paymentStep === 'DELEGATED_LENDER_MANAGEMENT_FEE') {
            // Route to delegated lender payment handler
            const { LenderOffersService } = await import('./service/LenderOffersService');
            const service = new LenderOffersService();
            await service.handleDelegatedPaymentWebhook(sessionId, orderId, amount, currency ?? 'PLN', sign);
        } else {
            // Route to generic payment handler (course payments, etc.)
            const { LmsPaymentsService } = await import('./service/LmsPaymentsService');
            const service = new LmsPaymentsService();
            await service.handleWebhook(body);
        }

        res.status(200).send('OK');
    } catch (err: any) {
        console.error('P24 webhook error:', err);
        res.status(400).send(err?.message ?? 'Bad Request');
    }
});

// Serve generated PDFs (authenticated via query token in production)
expressApp.use('/generated_pdfs', express.static(path.join(__dirname, '..', 'generated_pdfs')));
expressApp.use('/exports', express.static(path.join(__dirname, '..', 'exports')));
expressApp.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Setup routing-controllers with auto-discovery
// Auto-discovers all controllers in the controller directory
const app = useExpressServer(expressApp, {
    routePrefix: INTERNAL_API_PREFIX,
    controllers: [path.join(__dirname, 'controller/**/*.{js,ts}')],
    middlewares: [GlobalAuthMiddleware, BorrowerGuardMiddleware],
    defaultErrorHandler: false,
    validation: {
        whitelist: true,
        forbidNonWhitelisted: true,
    },
    plainToClassTransformOptions: {
        enableImplicitConversion: true,
    },
});

// Swagger Documentation
initializeSwagger(app);

// Error handling middleware (must be last)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    errorHandler(err, req, res, next);
});

// Initialize database and start server
AppDataSource.initialize()
    .then(() => {
        console.log('Database connection established');
        console.log('DB USER:', process.env.MYSQL_USER);
        console.log('DB HOST:', process.env.MYSQL_HOST);
        app.listen(PORT, () => {
            console.log(`LMS application started on port ${PORT}`);
            console.log(`API available at http://localhost:${PORT}${INTERNAL_API_PREFIX}`);
            console.log(`Swagger docs available at http://localhost:${PORT}/docs`);
        });
    })
    .catch((error: any) => {
        console.log('Error during MySQL database initialization:', error);
        console.log('Database connection failed. Please check:');
        console.log(`  - MySQL Host: ${config.mysql.host}`);
        console.log(`  - MySQL Port: ${config.mysql.port}`);
        console.log(`  - MySQL User: ${config.mysql.username}`);
        console.log(`  - MySQL Database: ${config.mysql.database}`);
        console.log('  - Make sure MySQL is running and credentials are correct');
        console.log('  - Check your environment variables (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE)');
        process.exit(1);
    });

export default app;
