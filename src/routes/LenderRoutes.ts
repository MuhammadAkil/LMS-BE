/**
 * LENDER MODULE - APPLICATION SETUP & ROUTING
 * Comprehensive integration guide for Express.js app
 * 
 * This file shows how to:
 * 1. Import all lender controllers and guards
 * 2. Register routes with proper guard chains
 * 3. Integrate with Express app
 */

import { Express, Request, Response, NextFunction } from 'express';

// ============================================
// IMPORTS
// ============================================

// Controllers
import { LenderDashboardController, LenderLoansController } from '../controller/LenderDashboardController';
import { LenderOffersController } from '../controller/LenderOffersController';
import { LenderInvestmentsController } from '../controller/LenderInvestmentsController';
import { LenderRemindersController, LenderExportsController } from '../controller/LenderExportsController';
import { LenderManagementController } from '../controller/LenderManagementController';
import { LenderVerificationController, LenderProfileController } from '../controller/LenderVerificationController';
import { LenderNotificationsController } from '../controller/LenderNotificationsController';
import { LenderDocumentsController } from '../controller/LenderDocumentsController';
import { LenderBankAccountController } from '../controller/LenderBankAccountController';

// Guards
import {
    LenderRoleGuard,
    LenderStatusGuard,
    LenderVerificationGuard,
    LenderBankAccountGuard,
    applyLenderGuards,
} from '../middleware/LenderGuards';

// Existing middleware
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';

// ============================================
// CONTROLLER INSTANTIATION
// ============================================

const dashboardController = new LenderDashboardController();
const loansController = new LenderLoansController();
const offersController = new LenderOffersController();
const investmentsController = new LenderInvestmentsController();
const remindersController = new LenderRemindersController();
const exportsController = new LenderExportsController();
const managementController = new LenderManagementController();
const verificationController = new LenderVerificationController();
const profileController = new LenderProfileController();
const notificationsController = new LenderNotificationsController();
const documentsController = new LenderDocumentsController();
const bankAccountController = new LenderBankAccountController();

// ============================================
// GUARD CHAIN HELPERS
// ============================================

/**
 * Wrap higher-order middleware functions to make them compatible with Express spread operator
 */
const wrapGuard = (guardFactory: (param?: any) => Promise<any>, param?: any) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const middleware = await guardFactory(param);
        return middleware(req, res, next);
    };
};

/**
 * Standard guard chain for all lender routes
 * Order: Role → Status → Verification
 * allowReadOnly: true to allow GET requests for non-ACTIVE users
 */
const lenderGuardChain = (allowReadOnly: boolean = false, requiredVerificationLevel: number = 0) => {
    return [
        AuthenticationMiddleware.verifyToken,
        LenderRoleGuard,
        wrapGuard(LenderStatusGuard, allowReadOnly),
        wrapGuard(LenderVerificationGuard, requiredVerificationLevel),
    ];
};

/**
 * Guard chain for investment operations (requires bank account)
 * Order: Role → Status → Verification → BankAccount
 */
const lenderInvestmentGuardChain = (requiredVerificationLevel: number = 2) => {
    return [
        AuthenticationMiddleware.verifyToken,
        LenderRoleGuard,
        wrapGuard(LenderStatusGuard, false), // Must be ACTIVE
        wrapGuard(LenderVerificationGuard, requiredVerificationLevel), // Must meet verification level
        LenderBankAccountGuard, // Must have verified bank account
    ];
};

// ============================================
// ROUTE REGISTRATION
// ============================================

export function registerLenderRoutes(app: Express): void {
    // ============================================
    // L-01: DASHBOARD
    // ============================================

    /**
     * GET /lender/dashboard/stats
     * Returns statistics for dashboard
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/dashboard/stats',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => dashboardController.getDashboardStats(req, res)
    );

    /**
     * GET /lender/dashboard/alerts
     * Returns alerts for lender
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/dashboard/alerts',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => dashboardController.getAlerts(req, res)
    );

    /**
     * PATCH /lender/dashboard/alerts/:alertId
     * Mark alert as resolved
     * Guards: Role, Status, Verification
     */
    app.patch(
        '/lender/dashboard/alerts/:alertId',
        ...lenderGuardChain(false, 0),
        async (req: Request, res: Response) => dashboardController.resolveAlert(req, res)
    );

    // ============================================
    // L-02: BROWSE LOANS
    // ============================================

    /**
     * GET /lender/loans
     * Browse available loans for investment
     * Query params: status, minAmount, maxAmount, minDuration, maxDuration, sortBy, sortOrder, page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/loans',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => loansController.browseLoansPaginated(req, res)
    );

    /**
     * GET /lender/loans/:loanId
     * Get specific loan detail
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/loans/:loanId',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => loansController.getLoanDetail(req, res)
    );

    /**
     * POST /lender/loans/:loanId/disbursement
     * Confirm off-platform disbursement (lender direct bank transfer to borrower).
     * Body: { amount, transferDate, referenceNumber? }
     */
    app.post(
        '/lender/loans/:loanId/disbursement',
        ...lenderGuardChain(false, 0),
        async (req: Request, res: Response) => loansController.confirmDisbursement(req, res)
    );

    // ============================================
    // L-03: MAKE OFFER (CRITICAL)
    // ============================================

    /**
     * POST /lender/offers
     * Create new offer
     * Body: { loanId: string, amount: number }
     * Guards: Role, Status (ACTIVE), Verification (level 2), BankAccount
     * CRITICAL PATH: Transaction-based, audit logging, notifications
     */
    app.post(
        '/lender/offers',
        ...lenderInvestmentGuardChain(2),
        async (req: Request, res: Response) => offersController.createOffer(req, res)
    );

    /**
     * GET /lender/offers/validate
     * Validate offer before creation
     * Query params: loanId, amount
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/offers/validate',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => offersController.validateOffer(req, res)
    );

    // ============================================
    // L-04: MY INVESTMENTS
    // ============================================

    /**
     * GET /lender/investments
     * Get all investments (paginated)
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/investments',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => investmentsController.getInvestmentsPaginated(req, res)
    );

    /**
     * GET /lender/investments/:investmentId
     * Get specific investment detail
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/investments/:investmentId',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => investmentsController.getInvestmentDetail(req, res)
    );

    /**
     * GET /lender/investments/:investmentId/repayments
     * Get repayment schedule for investment
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/investments/:investmentId/repayments',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => investmentsController.getInvestmentRepayments(req, res)
    );

    // ============================================
    // L-05: REMINDERS
    // ============================================

    /**
     * POST /lender/reminders
     * Send reminder to borrower
     * Body: { loanId: string, templateCode?: string }
     * Guards: Role, Status, Verification (level 1)
     */
    app.post(
        '/lender/reminders',
        ...lenderGuardChain(false, 1),
        async (req: Request, res: Response) => remindersController.sendReminder(req, res)
    );

    // ============================================
    // L-06: EXPORTS & CLAIMS
    // ============================================

    /**
     * POST /lender/exports/csv
     * Export investments as CSV
     * Body: { dateFrom?: string, dateTo?: string, statusFilter?: string[] }
     * Guards: Role, Status, Verification (level 1)
     */
    app.post(
        '/lender/exports/csv',
        ...lenderGuardChain(false, 1),
        async (req: Request, res: Response) => exportsController.exportCsv(req, res)
    );

    /**
     * POST /lender/exports/xml
     * Export investments as XML (max 500 items)
     * Body: { dateFrom?: string, dateTo?: string, statusFilter?: string[], limit?: number }
     * Guards: Role, Status, Verification (level 1)
     */
    app.post(
        '/lender/exports/xml',
        ...lenderGuardChain(false, 1),
        async (req: Request, res: Response) => exportsController.exportXml(req, res)
    );

    /**
     * GET /lender/exports/history
     * Get export history
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/exports/history',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => exportsController.getExportHistory(req, res)
    );

    /**
     * POST /lender/claims/generate
     * Generate insurance claim
     * Body: { loanId: string, reason: string }
     * Guards: Role, Status, Verification (level 2)
     */
    app.post(
        '/lender/claims/generate',
        ...lenderGuardChain(false, 2),
        async (req: Request, res: Response) => exportsController.generateClaim(req, res)
    );

    // ============================================
    // L-07: MANAGEMENT AGREEMENTS
    // ============================================

    /**
     * GET /lender/management-companies
     * Get available management companies
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/management-companies',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => managementController.getManagementCompanies(req, res)
    );

    /**
     * POST /lender/management-agreements
     * Create management agreement
     * Body: { companyId: string, amount: number }
     * Guards: Role, Status (ACTIVE), Verification (level 2), BankAccount
     * CRITICAL: Generates PDF, creates immutable record
     */
    app.post(
        '/lender/management-agreements',
        ...lenderInvestmentGuardChain(2),
        async (req: Request, res: Response) => managementController.createManagementAgreement(req, res)
    );

    /**
     * GET /lender/management-agreements
     * Get lender's management agreements
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/management-agreements',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => managementController.getManagementAgreements(req, res)
    );

    /**
     * DELETE /lender/management-agreements/:agreementId
     * Terminate management agreement
     * Guards: Role, Status, Verification (level 2)
     */
    app.delete(
        '/lender/management-agreements/:agreementId',
        ...lenderGuardChain(false, 2),
        async (req: Request, res: Response) => managementController.terminateAgreement(req, res)
    );

    // ============================================
    // L-08: VERIFICATION CENTER
    // ============================================

    /**
     * GET /lender/verifications
     * Get verification status
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/verifications',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => verificationController.getVerifications(req, res)
    );

    /**
     * POST /lender/verifications
     * Submit verification documents
     * Body: { verificationType: string, documents: { fileName: string, filePath: string }[] }
     * Guards: Role, Status, Verification (level 0)
     */
    app.post(
        '/lender/verifications',
        ...lenderGuardChain(false, 0),
        async (req: Request, res: Response) => verificationController.submitVerification(req, res)
    );

    // ============================================
    // L-09: PROFILE
    // ============================================

    /**
     * GET /lender/profile
     * Get lender profile
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/profile',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => profileController.getProfile(req, res)
    );

    /**
     * PATCH /lender/profile
     * Update lender profile
     * Body: { phone?: string }
     * Guards: Role, Status, Verification (level 0)
     * Limited to: phone only
     * Protected fields: email, password, role, status, level
     */
    app.patch(
        '/lender/profile',
        ...lenderGuardChain(false, 0),
        async (req: Request, res: Response) => profileController.updateProfile(req, res)
    );

    /**
     * GET /lender/profile/activity
     * Get lender activity log
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/profile/activity',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => profileController.getActivityLog(req, res)
    );

    // ============================================
    // L-10: NOTIFICATIONS
    // ============================================

    /**
     * GET /lender/notifications
     * Get lender notifications (paginated)
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/notifications',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => notificationsController.getNotifications(req, res)
    );

    /**
     * PATCH /lender/notifications/:id/read
     * Mark notification as read
     * Guards: Role, Status, Verification (level 0)
     */
    app.patch(
        '/lender/notifications/:id/read',
        ...lenderGuardChain(false, 0),
        async (req: Request, res: Response) => notificationsController.markAsRead(req, res)
    );

    // ============================================
    // L-11: DOCUMENT CENTER
    // ============================================

    /**
     * GET /lender/documents
     * Get all lender documents (aggregated)
     * Query params: category (loan-agreement|management-agreement|claim|export), page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/documents',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => documentsController.getDocuments(req, res)
    );

    // ============================================
    // L-12: BANK ACCOUNTS
    // ============================================

    /**
     * GET /lender/bank-accounts
     * Get lender's bank accounts
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/lender/bank-accounts',
        ...lenderGuardChain(true, 0),
        async (req: Request, res: Response) => bankAccountController.getBankAccounts(req, res)
    );

    /**
     * POST /lender/bank-accounts
     * Add a bank account
     * Body: { accountNumber: string, bankName: string, accountHolder: string }
     * Guards: Role, Status, Verification (level 0)
     */
    app.post(
        '/lender/bank-accounts',
        ...lenderGuardChain(false, 0),
        async (req: Request, res: Response) => bankAccountController.addBankAccount(req, res)
    );

    console.log('✅ Lender module routes registered successfully');
}

// ============================================
// EXAMPLE APP.TS INTEGRATION
// ============================================

/*
import express from 'express';
import { registerLenderRoutes } from './routes/LenderRoutes';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register all lender routes
registerLenderRoutes(app);

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    statusCode: '500',
    statusMessage: 'Internal server error',
    errors: [err.message],
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
*/

// ============================================
// GUARD CHAIN REFERENCE
// ============================================

/*
GUARD EXECUTION ORDER (left-to-right):

1. AuthenticationMiddleware
   - Extracts JWT token from header
   - Validates token
   - Attaches user to request
   - Throws 401 if invalid

2. LenderRoleGuard
   - Verifies user.role_id = 3 (LENDER)
   - Throws 403 if not lender
   - Fetches full user object

3. LenderStatusGuard(allowReadOnly)
   - Checks user.status_id (ACTIVE, BLOCKED, FROZEN, etc.)
   - BLOCKED users: full lock (403)
   - FROZEN users: read-only (GET only)
   - Non-ACTIVE users: read-only if allowReadOnly=true
   - Otherwise: 403

4. LenderVerificationGuard(requiredLevel)
   - Checks user.level >= requiredLevel
   - Enforces: must be ACTIVE + verified
   - Throws 403 with redirectTo: /lender/verifications

5. LenderBankAccountGuard
   - Checks if user has verified bank account
   - Throws 403 if missing
   - Redirects to /lender/profile

TYPICAL CHAINS:

Read-only operations (GET):
- Auth → Role → Status(readOnly=true) → Verification(level 0)

Write operations (POST/PATCH):
- Auth → Role → Status(readOnly=false) → Verification(level 0-2)

Investment operations (critical):
- Auth → Role → Status(readOnly=false) → Verification(level 2) → BankAccount

*/

// ============================================
// ERROR HANDLING IN GUARDS
// ============================================

/*
All guards return consistent error responses:

401 Unauthorized:
{
  statusCode: '401',
  statusMessage: 'Unauthorized: No authenticated user'
}

403 Forbidden:
{
  statusCode: '403',
  statusMessage: 'Forbidden: [reason]',
  detail: '[explanation]',
  redirectTo?: '[path]'  // For verification/profile redirects
}

500 Internal Server Error:
{
  statusCode: '500',
  statusMessage: 'Internal server error'
}
*/
