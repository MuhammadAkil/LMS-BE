import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { useExpressServer } from 'routing-controllers';
import config from './config/Config';
import { AppDataSource } from './config/database';
import { initializeSwagger } from './config/SwaggerConfig';
import { GlobalAuthMiddleware } from './middleware/globalAuth.middleware';
import { errorHandler } from './middleware/errorHandler';
import path from 'path';

const PORT = config.server.port;

const INTERNAL_API_PREFIX = "/api";

// Create Express app
const expressApp = express();

// Middleware
expressApp.use(helmet());
expressApp.use(cors());
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

// Health check (before routing-controllers)
expressApp.get('/health', (_req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Setup routing-controllers with auto-discovery
// Auto-discovers all controllers in the controller directory
const app = useExpressServer(expressApp, {
    routePrefix: INTERNAL_API_PREFIX,
    controllers: [path.join(__dirname, 'controller/**/*.{js,ts}')],
    middlewares: [GlobalAuthMiddleware],
    defaultErrorHandler: false,
    validation: {
        whitelist: true,
        forbidNonWhitelisted: true,
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
