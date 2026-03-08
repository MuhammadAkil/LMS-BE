import { Controller, Get, Post, Req, Res, UseBefore } from 'routing-controllers';
import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { LenderRoleGuard } from '../middleware/LenderGuards';

/**
 * LENDER WALLET CONTROLLER
 * GET  /lender/wallet              - Get wallet balance
 * POST /lender/wallet/topup        - Top-up wallet via card (simulated)
 * POST /lender/wallet/withdraw     - Withdraw to bank account
 * GET  /lender/wallet/transactions - Transaction history
 */
@Controller('/lender')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderWalletController {

    private get walletRepo() {
        return AppDataSource.getRepository('investor_wallets');
    }

    private get txRepo() {
        return AppDataSource.getRepository('transaction_logs');
    }

    private get userRepo() {
        return AppDataSource.getRepository('users');
    }

    // ─── GET /lender/wallet ──────────────────────────────────────────────────
    @Get('/wallet')
    async getWallet(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({ statusCode: '401', statusMessage: 'Unauthorized', timestamp: new Date().toISOString() });
                return;
            }

            const db = AppDataSource.manager;
            const wallets = await db.query(
                'SELECT * FROM investor_wallets WHERE user_id = ?',
                [lenderId]
            ) as any[];

            const wallet = wallets[0] ?? null;

            const users = await db.query(
                'SELECT bank_account, first_name, last_name FROM users WHERE id = ?',
                [lenderId]
            ) as any[];
            const user = users[0] ?? {};

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Wallet retrieved successfully',
                data: {
                    balance: wallet ? parseFloat(wallet.balance ?? '0') : 0,
                    reserved: wallet ? parseFloat(wallet.reserved ?? '0') : 0,
                    available: wallet ? parseFloat(wallet.available ?? '0') : 0,
                    currency: 'PLN',
                    bankAccount: user.bank_account ?? null,
                    accountHolder: user.first_name && user.last_name
                        ? `${user.first_name} ${user.last_name}`
                        : null,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('LenderWalletController.getWallet error:', error);
            res.status(500).json({ statusCode: '500', statusMessage: 'Failed to retrieve wallet', errors: [error.message], timestamp: new Date().toISOString() });
        }
    }

    // ─── POST /lender/wallet/topup ───────────────────────────────────────────
    // IMPORTANT: This endpoint simulates a top-up flow using a payment token.
    // Raw card data (cardNumber, CVV, expiry) must NEVER be transmitted through
    // or stored by the application server — doing so violates PCI DSS.
    // In production, integrate a PCI-compliant payment gateway (e.g. Stripe, P24)
    // and pass only a client-side payment token returned by the gateway's SDK.
    @Post('/wallet/topup')
    async topupWallet(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({ statusCode: '401', statusMessage: 'Unauthorized', timestamp: new Date().toISOString() });
                return;
            }

            // Accept a payment token from a PCI-compliant gateway SDK (not raw card data).
            // paymentToken: opaque string created by the client-side payment widget.
            // cardLastFour: optional last-4 digits supplied by the gateway for display only.
            const { amount, paymentToken, cardLastFour } = req.body;

            // Validate amount
            const amountNum = parseFloat(amount);
            if (!amount || isNaN(amountNum) || amountNum <= 0) {
                res.status(400).json({ statusCode: '400', statusMessage: 'Invalid amount. Must be a positive number.', timestamp: new Date().toISOString() });
                return;
            }
            if (amountNum < 100) {
                res.status(400).json({ statusCode: '400', statusMessage: 'Minimum top-up amount is 100 PLN.', timestamp: new Date().toISOString() });
                return;
            }
            if (amountNum > 100000) {
                res.status(400).json({ statusCode: '400', statusMessage: 'Maximum single top-up is 100,000 PLN.', timestamp: new Date().toISOString() });
                return;
            }

            // A payment token must be provided (non-empty string).
            if (!paymentToken || typeof paymentToken !== 'string' || !paymentToken.trim()) {
                res.status(400).json({ statusCode: '400', statusMessage: 'A valid payment token is required.', timestamp: new Date().toISOString() });
                return;
            }

            const db = AppDataSource.manager;

            // Upsert wallet
            await db.query(
                `INSERT INTO investor_wallets (user_id, balance, reserved, available, updated_at)
                 VALUES (?, ?, 0, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                   balance   = balance   + VALUES(balance),
                   available = available + VALUES(balance),
                   updated_at = NOW()`,
                [lenderId, amountNum, amountNum]
            );

            // Insert transaction log
            await db.query(
                `INSERT INTO transaction_logs (user_id, transaction_type, amount, status, reference_id, created_at)
                 VALUES (?, 'TOP_UP', ?, 'COMPLETED', NULL, NOW())`,
                [lenderId, amountNum]
            );

            // Fetch updated wallet
            const wallets = await db.query('SELECT * FROM investor_wallets WHERE user_id = ?', [lenderId]) as any[];
            const wallet = wallets[0];

            const maskedCard = cardLastFour ? `**** **** **** ${String(cardLastFour).slice(-4)}` : null;

            res.status(200).json({
                statusCode: '200',
                statusMessage: `Wallet topped up successfully with ${amountNum.toFixed(2)} PLN`,
                data: {
                    transactionType: 'TOP_UP',
                    amount: amountNum,
                    currency: 'PLN',
                    status: 'COMPLETED',
                    cardUsed: maskedCard,
                    wallet: {
                        balance: parseFloat(wallet.balance),
                        reserved: parseFloat(wallet.reserved ?? '0'),
                        available: parseFloat(wallet.available),
                    },
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('LenderWalletController.topupWallet error:', error);
            res.status(500).json({ statusCode: '500', statusMessage: 'Top-up failed', errors: [error.message], timestamp: new Date().toISOString() });
        }
    }

    // ─── POST /lender/wallet/withdraw ────────────────────────────────────────
    @Post('/wallet/withdraw')
    async withdrawWallet(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({ statusCode: '401', statusMessage: 'Unauthorized', timestamp: new Date().toISOString() });
                return;
            }

            const { amount } = req.body;
            const amountNum = parseFloat(amount);

            if (!amount || isNaN(amountNum) || amountNum <= 0) {
                res.status(400).json({ statusCode: '400', statusMessage: 'Invalid amount.', timestamp: new Date().toISOString() });
                return;
            }
            if (amountNum < 50) {
                res.status(400).json({ statusCode: '400', statusMessage: 'Minimum withdrawal is 50 PLN.', timestamp: new Date().toISOString() });
                return;
            }

            const db = AppDataSource.manager;

            // Check available balance
            const wallets = await db.query('SELECT * FROM investor_wallets WHERE user_id = ?', [lenderId]) as any[];
            const wallet = wallets[0];

            if (!wallet) {
                res.status(400).json({ statusCode: '400', statusMessage: 'No wallet found. Please top up first.', timestamp: new Date().toISOString() });
                return;
            }

            const available = parseFloat(wallet.available ?? '0');
            if (amountNum > available) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: `Insufficient available balance. Available: ${available.toFixed(2)} PLN`,
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            // Check bank account linked
            const users = await db.query('SELECT bank_account FROM users WHERE id = ?', [lenderId]) as any[];
            const user = users[0];
            if (!user?.bank_account) {
                res.status(400).json({ statusCode: '400', statusMessage: 'No bank account linked. Please add a bank account in your profile first.', timestamp: new Date().toISOString() });
                return;
            }

            // Deduct from wallet
            await db.query(
                `UPDATE investor_wallets
                 SET balance   = balance   - ?,
                     available = available - ?,
                     updated_at = NOW()
                 WHERE user_id = ?`,
                [amountNum, amountNum, lenderId]
            );

            // Insert transaction log
            await db.query(
                `INSERT INTO transaction_logs (user_id, transaction_type, amount, status, reference_id, created_at)
                 VALUES (?, 'WITHDRAWAL', ?, 'COMPLETED', NULL, NOW())`,
                [lenderId, amountNum]
            );

            // Fetch updated wallet
            const walletsUpdated = await db.query('SELECT * FROM investor_wallets WHERE user_id = ?', [lenderId]) as any[];
            const updatedWallet = walletsUpdated[0];

            const maskedIban = `${user.bank_account.slice(0, 6)}****${user.bank_account.slice(-4)}`;

            res.status(200).json({
                statusCode: '200',
                statusMessage: `Withdrawal of ${amountNum.toFixed(2)} PLN initiated`,
                data: {
                    transactionType: 'WITHDRAWAL',
                    amount: amountNum,
                    currency: 'PLN',
                    status: 'COMPLETED',
                    destinationAccount: maskedIban,
                    estimatedArrival: '1-2 business days',
                    wallet: {
                        balance: parseFloat(updatedWallet.balance),
                        reserved: parseFloat(updatedWallet.reserved ?? '0'),
                        available: parseFloat(updatedWallet.available),
                    },
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('LenderWalletController.withdrawWallet error:', error);
            res.status(500).json({ statusCode: '500', statusMessage: 'Withdrawal failed', errors: [error.message], timestamp: new Date().toISOString() });
        }
    }

    // ─── GET /lender/wallet/transactions ─────────────────────────────────────
    @Get('/wallet/transactions')
    async getTransactions(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({ statusCode: '401', statusMessage: 'Unauthorized', timestamp: new Date().toISOString() });
                return;
            }

            const page = parseInt((req.query['page'] as string) ?? '1', 10) || 1;
            const pageSize = Math.min(parseInt((req.query['pageSize'] as string) ?? '20', 10) || 20, 100);
            const offset = (page - 1) * pageSize;

            const db = AppDataSource.manager;

            const transactions = await db.query(
                `SELECT id, transaction_type, amount, status, reference_id, created_at
                 FROM transaction_logs
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [lenderId, pageSize, offset]
            ) as any[];

            const countResult = await db.query(
                'SELECT COUNT(*) as total FROM transaction_logs WHERE user_id = ?',
                [lenderId]
            ) as any[];
            const total = countResult[0]?.total ?? 0;

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Transactions retrieved successfully',
                data: {
                    transactions: transactions.map((t: any) => ({
                        id: t.id,
                        type: t.transaction_type,
                        amount: parseFloat(t.amount ?? '0'),
                        currency: 'PLN',
                        status: t.status,
                        referenceId: t.reference_id,
                        createdAt: t.created_at,
                    })),
                    pagination: {
                        page,
                        pageSize,
                        total,
                        totalPages: Math.ceil(total / pageSize),
                    },
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('LenderWalletController.getTransactions error:', error);
            res.status(500).json({ statusCode: '500', statusMessage: 'Failed to retrieve transactions', errors: [error.message], timestamp: new Date().toISOString() });
        }
    }
}
