// BorrowerLoanHistoryController - DISABLED
// Routes moved to BorrowerLoansController (@Get('/history') and @Get('/history/:histId'))
// This stub export exists only to satisfy TypeScript module requirements.
import { Request, Response } from 'express';

export class BorrowerLoanHistoryController {
    // These stubs are never called — real routes live in BorrowerLoansController
    async getLoanHistoryPaginated(_req: Request, res: Response): Promise<void> {
        res.status(410).json({ error: 'Route moved to BorrowerLoansController' });
    }
    async getLoanHistoryDetail(_req: Request, res: Response): Promise<void> {
        res.status(410).json({ error: 'Route moved to BorrowerLoansController' });
    }
}
