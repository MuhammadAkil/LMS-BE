import { Controller, Get, Post, Body, Param, QueryParam, UseBefore, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminVerificationsService } from '../service/AdminVerificationsService';
import { AdminGuard, CriticalOperationGuard } from '../middleware/AdminGuards';
import {
  VerificationListItemDto,
  VerificationDetailDto,
  ApproveVerificationRequest,
  RejectVerificationRequest,
} from '../dto/AdminDtos';

/**
 * Admin Verifications Controller
 * Endpoints for KYC verification review and approval
 * CRITICAL OPERATIONS - Requires SuperAdmin + 2FA
 *
 * Routes:
 * - GET   /admin/verifications           -> List verifications (AdminGuard)
 * - GET   /admin/verifications/pending   -> List pending verifications (AdminGuard)
 * - GET   /admin/verifications/:id       -> Get verification details (AdminGuard)
 * - POST  /admin/verifications/:id/approve -> Approve verification (CriticalOperationGuard)
 * - POST  /admin/verifications/:id/reject  -> Reject verification (CriticalOperationGuard)
 */
@Controller('/admin/verifications')
@UseBefore(AdminGuard)
export class AdminVerificationsController {
  private readonly verificationsService: AdminVerificationsService;

  constructor() {
    this.verificationsService = new AdminVerificationsService();
  }

  /**
   * GET /admin/verifications
   * Returns paginated list of all verifications
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   *
   * Response: VerificationListItemDto[]
   */
  @Get('/')
  async getAllVerifications(
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number
  ): Promise<VerificationListItemDto[]> {
    const result = await this.verificationsService.getAllVerifications(limit || 20, offset || 0);
    return (result as any).data || result;
  }

  /**
   * GET /admin/verifications/pending
   * Returns pending verifications (oldest first - FIFO review)
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   *
   * Response: VerificationListItemDto[]
   */
  @Get('/pending')
  async getPendingVerifications(
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number
  ): Promise<VerificationListItemDto[]> {
    const result = await this.verificationsService.getPendingVerifications(limit || 20, offset || 0);
    return (result as any).data || result;
  }

  /**
   * GET /admin/verifications/:id
   * Returns verification details with reviewer information
   *
   * Response: VerificationDetailDto
   */
  @Get('/:id')
  async getVerificationById(@Param('id') verificationId: number): Promise<VerificationDetailDto> {
    return this.verificationsService.getVerificationById(verificationId);
  }

  /**
   * POST /admin/verifications/:id/approve
   * Approves a verification (KYC)
   * CRITICAL OPERATION - Requires SuperAdmin + 2FA
   *
   * Body: ApproveVerificationRequest
   * - approvalComment: string (optional)
   *
   * Effects:
   * - Sets status = APPROVED
   * - Increments user verification level
   * - Sets reviewedBy, reviewedAt
   * - Logs VERIFICATION_APPROVED
   * - Notifies user of approval
   *
   * Response: VerificationDetailDto
   */
  @Post('/:id/approve')
  @UseBefore(CriticalOperationGuard)
  async approveVerification(
    @Param('id') verificationId: number,
    @Body() request: ApproveVerificationRequest,
    @Req() req: Request
  ): Promise<VerificationDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.verificationsService.approveVerification(verificationId, request, adminId);
  }

  /**
   * POST /admin/verifications/:id/reject
   * Rejects a verification (KYC)
   * CRITICAL OPERATION - Requires SuperAdmin + 2FA
   * REQUIRES rejection comment
   *
   * Body: RejectVerificationRequest
   * - rejectionReason: string (required)
   *
   * Effects:
   * - Sets status = REJECTED
   * - Sets reviewedBy, reviewedAt, reviewComment
   * - Logs VERIFICATION_REJECTED
   * - Notifies user with rejection reason
   *
   * Response: VerificationDetailDto
   * Error: 400 if rejectionReason is missing or empty
   */
  @Post('/:id/reject')
  @UseBefore(CriticalOperationGuard)
  async rejectVerification(
    @Param('id') verificationId: number,
    @Body() request: RejectVerificationRequest,
    @Req() req: Request
  ): Promise<VerificationDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.verificationsService.rejectVerification(verificationId, request, adminId);
  }
}
