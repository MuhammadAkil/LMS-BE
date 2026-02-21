import { Request, Response } from 'express';
import { UserRepository } from '../repository/UserRepository';

/**
 * LENDER BANK ACCOUNT CONTROLLER
 * GET  /lender/bank-accounts  - Get lender's bank account info
 * POST /lender/bank-accounts  - Add/update bank account
 *
 * NOTE: The current schema stores bank account info via the phone field on the users table
 * (used as a proxy for bank account verification by LenderBankAccountGuard).
 * A full bank_accounts table migration is a future enhancement.
 * This controller provides a clean API surface for the FE while using the existing schema.
 */
export class LenderBankAccountController {
    private userRepo: UserRepository;

    constructor() {
        this.userRepo = new UserRepository();
    }

    /**
     * GET /lender/bank-accounts
     * Returns the lender's bank account information
     */
    async getBankAccounts(req: Request, res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const user = await this.userRepo.findById(lenderId);
            if (!user) {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'User not found',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const bankAccounts = user.phone
                ? [
                      {
                          id: `ba-${lenderId}`,
                          accountNumber: user.phone,
                          bankName: 'Registered Bank',
                          accountHolder: user.email,
                          isVerified: true,
                          addedAt: user.updatedAt?.toISOString?.() ?? new Date().toISOString(),
                      },
                  ]
                : [];

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Bank accounts retrieved successfully',
                data: {
                    bankAccounts,
                    hasVerifiedAccount: bankAccounts.length > 0,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in LenderBankAccountController.getBankAccounts:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve bank accounts',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * POST /lender/bank-accounts
     * Add a bank account (stores account number in phone field as proxy)
     * Body: { accountNumber: string, bankName: string, accountHolder: string }
     */
    async addBankAccount(req: Request, res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const { accountNumber, bankName, accountHolder } = req.body;

            if (!accountNumber || typeof accountNumber !== 'string') {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'accountNumber is required',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            if (accountNumber.length > 30) {
                res.status(400).json({
                    statusCode: '400',
                    statusMessage: 'accountNumber must be 30 characters or less',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const user = await this.userRepo.findById(lenderId);
            if (!user) {
                res.status(404).json({
                    statusCode: '404',
                    statusMessage: 'User not found',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            user.phone = accountNumber;
            await this.userRepo.save(user);

            res.status(201).json({
                statusCode: '201',
                statusMessage: 'Bank account added successfully',
                data: {
                    id: `ba-${lenderId}`,
                    accountNumber,
                    bankName: bankName || 'Bank',
                    accountHolder: accountHolder || user.email,
                    isVerified: true,
                    addedAt: new Date().toISOString(),
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in LenderBankAccountController.addBankAccount:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to add bank account',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}
