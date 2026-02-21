import { Controller, Get, Post, Body, Param, QueryParam, UseBefore, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminLoansService, AddInterventionNoteRequest } from '../service/AdminLoansService';
import { AdminGuard, SuperAdminGuard } from '../middleware/AdminGuards';

/**
 * Admin Loans Controller
 * Platform-wide loan oversight and monitoring
 *
 * Routes:
 * - GET  /admin/loans                       -> List all loans with filters (AdminGuard)
 * - GET  /admin/loans/:id                   -> Get loan details (AdminGuard)
 * - POST /admin/loans/:id/intervention-note -> Add intervention note (AdminGuard)
 * - POST /admin/loans/:id/block-borrower    -> Block borrower of loan (SuperAdminGuard)
 */
@Controller('/admin/loans')
@UseBefore(AdminGuard)
export class AdminLoansController {
  private readonly loansService: AdminLoansService;

  constructor() {
    this.loansService = new AdminLoansService();
  }

  /**
   * GET /admin/loans
   * Returns paginated list of all loans with optional filters
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   * - statusId: number (optional, 1=active, 2=completed, 3=defaulted, 4=suspended)
   * - search: string (optional, search by borrower email or loan ID)
   *
   * Response: { data: LoanListItemDto[], total, limit, offset }
   */
  @Get('/')
  async getAllLoans(
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number,
    @QueryParam('statusId') statusId?: number,
    @QueryParam('search') search?: string
  ) {
    return this.loansService.getAllLoans(limit || 20, offset || 0, statusId, search);
  }

  /**
   * GET /admin/loans/:id
   * Returns full loan details
   *
   * Response: LoanDetailDto
   */
  @Get('/:id')
  async getLoanById(@Param('id') loanId: number) {
    return this.loansService.getLoanById(loanId);
  }

  /**
   * POST /admin/loans/:id/intervention-note
   * Adds an admin intervention note to a loan (audit trail only)
   *
   * Body: { note: string }
   * Response: { success: boolean; message: string }
   */
  @Post('/:id/intervention-note')
  async addInterventionNote(
    @Param('id') loanId: number,
    @Body() request: AddInterventionNoteRequest,
    @Req() req: Request
  ) {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found in request');
    return this.loansService.addInterventionNote(loanId, request, adminId);
  }

  /**
   * POST /admin/loans/:id/block-borrower
   * Blocks the borrower associated with a loan
   * Requires SuperAdminGuard
   *
   * Response: { success: boolean; message: string }
   */
  @Post('/:id/block-borrower')
  @UseBefore(SuperAdminGuard)
  async blockBorrower(@Param('id') loanId: number, @Req() req: Request) {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found in request');
    return this.loansService.blockBorrower(loanId, adminId);
  }
}
