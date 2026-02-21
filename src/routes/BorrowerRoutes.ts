import { Express, Request, Response, NextFunction } from 'express';
import { BorrowerDashboardController } from '../controller/BorrowerDashboardController';
import { BorrowerVerificationController } from '../controller/BorrowerVerificationController';
import { BorrowerApplicationsController } from '../controller/BorrowerApplicationsController';
import { BorrowerPaymentsController } from '../controller/BorrowerPaymentsController';
import { BorrowerLoansController } from '../controller/BorrowerLoansController';
import { BorrowerLoanHistoryController } from '../controller/BorrowerLoanHistoryController';
import { BorrowerDocumentsController } from '../controller/BorrowerDocumentsController';
import { BorrowerNotificationsController } from '../controller/BorrowerNotificationsController';
import { BorrowerProfileController } from '../controller/BorrowerProfileController';
import { BorrowerMarketplaceService } from '../service/BorrowerMarketplaceService';

import {
    BorrowerRoleGuard,
    BorrowerStatusGuard,
    BorrowerVerificationGuard,
    BorrowerCommissionPaymentGuard,
    applyBorrowerGuards,
    applyBorrowerInvestmentGuards,
} from '../middleware/BorrowerGuards';

import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';

// ============================================
// CONTROLLER INSTANTIATION
// ============================================

const dashboardController = new BorrowerDashboardController();
const verificationController = new BorrowerVerificationController();
const applicationsController = new BorrowerApplicationsController();
const paymentsController = new BorrowerPaymentsController();
const loansController = new BorrowerLoansController();
const loanHistoryController = new BorrowerLoanHistoryController();
const documentsController = new BorrowerDocumentsController();
const notificationsController = new BorrowerNotificationsController();
const profileController = new BorrowerProfileController();
const marketplaceService = new BorrowerMarketplaceService();

// ============================================
// GUARD CHAIN HELPERS
// ============================================

/**
 * Standard guard chain for borrower endpoints
 * Order: Auth → Role → Status → Verification
 * allowReadOnly: true for GET endpoints
 * requiredLevel: verification level (0-3)
 */
const borrowerGuardChain = (allowReadOnly: boolean = false, requiredLevel: number = 0) => {
    return [
        AuthenticationMiddleware,
        BorrowerRoleGuard,
        BorrowerStatusGuard(allowReadOnly),
        BorrowerVerificationGuard(requiredLevel),
    ];
};

/**
 * Guard chain for investment operations (requires commission payment)
 * Order: Role → Status → Verification → Commission Payment
 */
const borrowerInvestmentGuardChain = (requiredLevel: number = 0) => {
    return [
        AuthenticationMiddleware,
        BorrowerRoleGuard,
        BorrowerStatusGuard(false), // Must be ACTIVE
        BorrowerVerificationGuard(requiredLevel), // Must meet verification level
        BorrowerCommissionPaymentGuard, // Must have paid commission
    ];
};

// ============================================
// ROUTE REGISTRATION
// ============================================

export function registerBorrowerRoutes(app: Express): void {
    // ============================================
    // B-01: DASHBOARD
    // ============================================

    /**
     * GET /api/borrower/dashboard
     * Returns full dashboard with stats and alerts
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/dashboard',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => dashboardController.getDashboard(req, res)
    );

    /**
     * GET /api/borrower/dashboard/stats
     * Returns only dashboard statistics
     */
    app.get(
        '/api/borrower/dashboard/stats',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => dashboardController.getStats(req, res)
    );

    /**
     * GET /api/borrower/dashboard/alerts
     * Returns dashboard alerts
     */
    app.get(
        '/api/borrower/dashboard/alerts',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => dashboardController.getAlerts(req, res)
    );

    // ============================================
    // B-02: VERIFICATION CENTER
    // ============================================

    /**
     * GET /api/borrower/verification/status
     * Returns current verification status
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/verification/status',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => verificationController.getVerificationStatus(req, res)
    );

    /**
     * GET /api/borrower/verification/requirements
     * Returns next level requirements
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/verification/requirements',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => verificationController.getVerificationRequirements(req, res)
    );

    /**
     * POST /api/borrower/verification/upload
     * Submit verification documents
     * Body: { verificationType, documents: [{ fileName, filePath }] }
     * Guards: Role, Status (ACTIVE), Verification (level 0)
     */
    app.post(
        '/api/borrower/verification/upload',
        ...borrowerGuardChain(false, 0),
        async (req: Request, res: Response) => verificationController.uploadVerification(req, res)
    );

    // ============================================
    // B-03: LOAN APPLICATIONS
    // ============================================

    /**
     * POST /api/borrower/applications
     * Create new loan application
     * Body: { amount, durationMonths, purpose?, description? }
     * Guards: Role, Status (ACTIVE), Verification (level 1)
     * Rules: Status=ACTIVE required, Level >= 1, amount within limits
     */
    app.post(
        '/api/borrower/applications',
        ...borrowerGuardChain(false, 1),
        async (req: Request, res: Response) => applicationsController.createApplication(req, res)
    );

    /**
     * GET /api/borrower/applications
     * Get paginated applications list
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/applications',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => applicationsController.getApplications(req, res)
    );

    /**
     * GET /api/borrower/applications/:id
     * Get application details with offers
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/applications/:id',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => applicationsController.getApplicationDetail(req, res)
    );

    /**
     * PUT /api/borrower/applications/:id/cancel
     * Cancel application (only if OPEN)
     * Body: { reason?: string }
     * Guards: Role, Status (ACTIVE), Verification (level 0)
     */
    app.put(
        '/api/borrower/applications/:id/cancel',
        ...borrowerGuardChain(false, 0),
        async (req: Request, res: Response) => applicationsController.cancelApplication(req, res)
    );

    /**
     * POST /api/borrower/applications/:id/close
     * Close application (only if funded >= 50%)
     * Body: { notes?: string }
     * Guards: Role, Status (ACTIVE), Verification (level 0)
     */
    app.post(
        '/api/borrower/applications/:id/close',
        ...borrowerGuardChain(false, 0),
        async (req: Request, res: Response) => applicationsController.closeApplication(req, res)
    );

    // ============================================
    // B-04: COMMISSION PAYMENTS
    // ============================================

    /**
     * POST /api/borrower/payments/commission
     * Initiate commission payment
     * Body: { applicationId, paymentMethod, returnUrl? }
     * Guards: Role, Status (ACTIVE), Verification (level 1)
     * Critical: Must be completed before loan activation
     */
    app.post(
        '/api/borrower/payments/commission',
        ...borrowerGuardChain(false, 1),
        async (req: Request, res: Response) => paymentsController.initiateCommissionPayment(req, res)
    );

    /**
     * GET /api/borrower/payments/status/:id
     * Get payment status
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/payments/status/:id',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => paymentsController.getPaymentStatus(req, res)
    );

    /**
     * POST /api/borrower/payments/callback
     * Payment gateway callback (public, no guards required)
     * Called by Przelewy24 after payment completion
     */
    app.post(
        '/api/borrower/payments/callback',
        async (req: Request, res: Response) => {
            res.status(200).json({ statusCode: '200', statusMessage: 'Use /webhook/p24 for P24 callbacks' });
        }
    );

    // ============================================
    // B-05: ACTIVE LOANS
    // ============================================

    /**
     * GET /api/borrower/loans
     * Get active loans (paginated)
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/loans',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => loansController.getActiveLoansPaginated(req, res)
    );

    /**
     * GET /api/borrower/loans/:id
     * Get loan detail with repayment schedule
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/loans/:id',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => loansController.getLoanDetail(req, res)
    );

    /**
     * GET /api/borrower/loans/:id/schedule
     * Get repayment schedule
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/loans/:id/schedule',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => loansController.getRepaymentSchedule(req, res)
    );

    /**
     * GET /api/borrower/loans/:id/payments
     * Get payment history for loan
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/loans/:id/payments',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => loansController.getPaymentHistory(req, res)
    );

    // ============================================
    // B-06: LOAN HISTORY
    // ============================================

    /**
     * GET /api/borrower/loans/history
     * Get loan history (REPAID and DEFAULTED loans)
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/loans/history',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => loanHistoryController.getLoanHistoryPaginated(req, res)
    );

    /**
     * GET /api/borrower/loans/history/:id
     * Get loan history detail with contract
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/loans/history/:id',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => loanHistoryController.getLoanHistoryDetail(req, res)
    );

    // ============================================
    // B-07: DOCUMENTS
    // ============================================

    /**
     * GET /api/borrower/documents
     * Get all documents (contracts, verifications)
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/documents',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => documentsController.getDocumentsPaginated(req, res)
    );

    /**
     * GET /api/borrower/documents/:id
     * Get document details
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/documents/:id',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => documentsController.getDocumentDetail(req, res)
    );

    /**
     * GET /api/borrower/documents/:id/download
     * Download document
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/documents/:id/download',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => documentsController.downloadDocument(req, res)
    );

    // ============================================
    // B-08: NOTIFICATIONS
    // ============================================

    /**
     * GET /api/borrower/notifications
     * Get notifications (paginated)
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/notifications',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => notificationsController.getNotificationsPaginated(req, res)
    );

    /**
     * PUT /api/borrower/notifications/:id/read
     * Mark notification as read
     * Guards: Role, Status (ACTIVE), Verification (level 0)
     */
    app.put(
        '/api/borrower/notifications/:id/read',
        ...borrowerGuardChain(false, 0),
        async (req: Request, res: Response) => notificationsController.markNotificationRead(req, res)
    );

    /**
     * PUT /api/borrower/notifications/mark-all-read
     * Mark all notifications as read
     * Guards: Role, Status (ACTIVE), Verification (level 0)
     */
    app.put(
        '/api/borrower/notifications/mark-all-read',
        ...borrowerGuardChain(false, 0),
        async (req: Request, res: Response) =>
            notificationsController.markAllNotificationsRead(req, res)
    );

    // ============================================
    // B-09: PROFILE
    // ============================================

    /**
     * GET /api/borrower/profile
     * Get borrower profile
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/profile',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => profileController.getProfile(req, res)
    );

    /**
     * PUT /api/borrower/profile
     * Update borrower profile
     * Body: { firstName?, lastName?, phone?, dateOfBirth? }
     * Guards: Role, Status (ACTIVE), Verification (level 0)
     * Protected fields: email, password, role, status, level
     */
    app.put(
        '/api/borrower/profile',
        ...borrowerGuardChain(false, 0),
        async (req: Request, res: Response) => profileController.updateProfile(req, res)
    );

    /**
     * GET /api/borrower/profile/activity
     * Get borrower activity log
     * Query params: page, pageSize
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/profile/activity',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => profileController.getActivityLog(req, res)
    );

    // ============================================
    // B-08 (EXTRA): BULK NOTIFICATION READ
    // ============================================

    /**
     * PUT /api/borrower/notifications/read
     * Mark multiple notifications as read by IDs
     * Body: { ids: (number|string)[] }
     * Guards: Role, Status (ACTIVE), Verification (level 0)
     * NOTE: Must be registered BEFORE /:id/read to avoid route conflict
     */
    app.put(
        '/api/borrower/notifications/read',
        ...borrowerGuardChain(false, 0),
        async (req: Request, res: Response) => notificationsController.markNotificationsRead(req, res)
    );

    // ============================================
    // B-10: MARKETPLACE (BORROWER-FACING)
    // ============================================

    /**
     * GET /api/borrower/applications/:id/bids
     * View all lender bids on a loan (lender identities masked)
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/applications/:id/bids',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => marketplaceService.getBids(req, res)
    );

    /**
     * GET /api/borrower/applications/:id/funding-status
     * Get comprehensive funding status for a loan application
     * Guards: Role, Status (read-only), Verification (level 0)
     */
    app.get(
        '/api/borrower/applications/:id/funding-status',
        ...borrowerGuardChain(true, 0),
        async (req: Request, res: Response) => marketplaceService.getFundingStatus(req, res)
    );

    /**
     * POST /api/borrower/applications/:id/accept-funding
     * Accept funding — allocates bids, transitions loan to FUNDED
     * Body: { loan_request_id, bid_ids? }
     * Guards: Role, Status (ACTIVE), Verification (level 0)
     */
    app.post(
        '/api/borrower/applications/:id/accept-funding',
        ...borrowerGuardChain(false, 0),
        async (req: Request, res: Response) => marketplaceService.acceptFunding(req, res)
    );

    console.log('✅ Borrower module routes registered successfully (31 endpoints)');
}

// ============================================
// EXAMPLE APP.TS INTEGRATION
// ============================================

/*
import express from 'express';
import { registerBorrowerRoutes } from './routes/BorrowerRoutes';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register all borrower routes
registerBorrowerRoutes(app);

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

2. BorrowerRoleGuard
   - Verifies user.role_id = 2 (BORROWER)
   - Throws 403 if not borrower
   - Fetches full user object

3. BorrowerStatusGuard(allowReadOnly)
   - Checks user.status_id (ACTIVE, BLOCKED, FROZEN, etc.)
   - BLOCKED users: full lock (403)
   - FROZEN users: read-only (GET only)
   - Non-ACTIVE users: read-only if allowReadOnly=true
   - Otherwise: 403

4. BorrowerVerificationGuard(requiredLevel)
   - Checks user.level >= requiredLevel
   - Enforces: must be ACTIVE + verified
   - Throws 403 with redirectTo: /api/borrower/verification/requirements

5. BorrowerCommissionPaymentGuard
   - Checks if commission payment is PAID
   - Throws 403 if missing or not paid
   - Redirects to /api/borrower/payments/commission

TYPICAL CHAINS:

Read-only operations (GET):
- Auth → Role → Status(readOnly=true) → Verification(level 0)

Write operations (POST/PUT):
- Auth → Role → Status(readOnly=false) → Verification(level 0-1)

Critical operations (loan activation):
- Auth → Role → Status(readOnly=false) → Verification(level 1) → Commission Payment
*/
