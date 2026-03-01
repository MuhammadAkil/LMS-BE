import { VerificationRepository } from '../repository/VerificationRepository';
import { UserRepository } from '../repository/UserRepository';
import { AdminAuditService } from './AdminAuditService';
import { VerificationListItemDto, VerificationDetailDto, ApproveVerificationRequest, RejectVerificationRequest } from '../dto/AdminDtos';

/**
 * Admin Verification Review Service
 * Handles KYC/verification approvals and rejections
 * Critical operation - requires super-admin + 2FA
 */
export class AdminVerificationsService {
  private verificationRepo: VerificationRepository;
  private userRepo: UserRepository;
  private auditService: AdminAuditService;

  constructor() {
    this.verificationRepo = new VerificationRepository();
    this.userRepo = new UserRepository();
    this.auditService = new AdminAuditService();
  }

  /**
   * Get paginated verification list
   */
  async getAllVerifications(limit: number = 20, offset: number = 0) {
    const [verifications, total] = await this.verificationRepo.findAll(limit, offset);

    const dtos: VerificationListItemDto[] = await Promise.all(
      verifications.map(async v => this.mapToListDto(v))
    );

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get pending verifications (most important for admins)
   */
  async getPendingVerifications(limit: number = 20, offset: number = 0) {
    const [verifications, total] = await this.verificationRepo.findPending(limit, offset);

    const dtos: VerificationListItemDto[] = await Promise.all(
      verifications.map(async v => this.mapToListDto(v))
    );

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get verification detail
   */
  async getVerificationById(verificationId: number): Promise<VerificationDetailDto | null> {
    const verification = await this.verificationRepo.findById(verificationId);
    if (!verification) return null;

    return this.mapToDetailDto(verification);
  }

  /**
   * Approve verification
   * Updates verification status
   * Updates user verification level
   * Creates audit log
   * Triggers notification
   */
  async approveVerification(
    verificationId: number,
    request: ApproveVerificationRequest,
    adminId: number
  ): Promise<VerificationDetailDto | null> {
    const verification = await this.verificationRepo.findById(verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    // Update verification status to APPROVED (statusId = 2)
    const updated = await this.verificationRepo.update(verificationId, {
      statusId: 2, // APPROVED
      reviewedBy: adminId,
      reviewedAt: new Date(),
      reviewComment: request.comment,
    });

    if (!updated) {
      throw new Error('Failed to approve verification');
    }

    // Update user verification level
    const user = await this.userRepo.findById(verification.userId);
    if (user) {
      // Increment verification level based on type
      const newLevel = Math.min(user.level + 1, 10);
      await this.userRepo.update(user.id, { level: newLevel });
    }

    // Log the action and notify user (payload must include title/message for in-app list)
    await this.auditService.logAndNotify(
      adminId,
      'VERIFICATION_APPROVED',
      'VERIFICATION',
      verificationId,
      verification.userId,
      'VERIFICATION_APPROVED',
      {
        title: 'Verification Approved',
        message: `Your ${this.getVerificationType(verification.typeId)} verification has been approved.`,
        verificationType: this.getVerificationType(verification.typeId),
        comment: request.comment || 'No comment',
        approvedBy: adminId,
      },
      {
        verificationType: verification.typeId,
        comment: request.comment,
        approvedBy: adminId,
      }
    );

    return this.getVerificationById(verificationId);
  }

  /**
   * Reject verification
   * CRITICAL: Requires comment (reason for rejection)
   * Updates user verification status
   * Creates audit log
   * Triggers notification
   */
  async rejectVerification(
    verificationId: number,
    request: RejectVerificationRequest,
    adminId: number
  ): Promise<VerificationDetailDto | null> {
    if (!request.comment || request.comment.trim().length === 0) {
      throw new Error('Rejection comment is required');
    }

    const verification = await this.verificationRepo.findById(verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    // Update verification status to REJECTED (statusId = 3)
    const updated = await this.verificationRepo.update(verificationId, {
      statusId: 3, // REJECTED
      reviewedBy: adminId,
      reviewedAt: new Date(),
      reviewComment: request.comment,
    });

    if (!updated) {
      throw new Error('Failed to reject verification');
    }

    await this.auditService.logAndNotify(
      adminId,
      'VERIFICATION_REJECTED',
      'VERIFICATION',
      verificationId,
      verification.userId,
      'VERIFICATION_REJECTED',
      {
        title: 'Verification Rejected',
        message: `Your ${this.getVerificationType(verification.typeId)} verification was rejected. Reason: ${request.comment}`,
        verificationType: this.getVerificationType(verification.typeId),
        reason: request.comment,
        rejectedBy: adminId,
      },
      {
        verificationType: verification.typeId,
        reason: request.comment,
        rejectedBy: adminId,
      }
    );

    return this.getVerificationById(verificationId);
  }

  /**
   * Get verifications by type
   */
  async getVerificationsByType(typeId: number, limit: number = 20, offset: number = 0) {
    const [verifications, total] = await this.verificationRepo.findByType(typeId, limit, offset);

    const dtos: VerificationListItemDto[] = await Promise.all(
      verifications.map(async v => this.mapToListDto(v))
    );

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get verifications by status
   */
  async getVerificationsByStatus(statusId: number, limit: number = 20, offset: number = 0) {
    const [verifications, total] = await this.verificationRepo.findByStatus(statusId, limit, offset);

    const dtos: VerificationListItemDto[] = await Promise.all(
      verifications.map(async v => this.mapToListDto(v))
    );

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get count of pending verifications (for dashboard)
   */
  async getPendingCount(): Promise<number> {
    return await this.verificationRepo.countPending();
  }

  private async mapToListDto(verification: any): Promise<VerificationListItemDto> {
    const user = await this.userRepo.findById(verification.userId);

    return {
      id: verification.id,
      userId: verification.userId,
      userEmail: user?.email || 'UNKNOWN',
      typeId: verification.typeId,
      typeName: this.getVerificationType(verification.typeId),
      statusId: verification.statusId,
      statusName: this.getVerificationStatus(verification.statusId),
      submittedAt: verification.submittedAt,
      reviewedAt: verification.reviewedAt,
      reviewedBy: verification.reviewedBy,
    };
  }

  private async mapToDetailDto(verification: any): Promise<VerificationDetailDto> {
    const user = await this.userRepo.findById(verification.userId);
    const reviewer = verification.reviewedBy ? await this.userRepo.findById(verification.reviewedBy) : null;

    return {
      id: verification.id,
      userId: verification.userId,
      userEmail: user?.email || 'UNKNOWN',
      typeId: verification.typeId,
      typeName: this.getVerificationType(verification.typeId),
      statusId: verification.statusId,
      statusName: this.getVerificationStatus(verification.statusId),
      submittedAt: verification.submittedAt,
      reviewedAt: verification.reviewedAt,
      reviewedBy: verification.reviewedBy,
      reviewerEmail: reviewer?.email,
      reviewComment: verification.reviewComment,
      metadata: verification.metadata ? JSON.parse(verification.metadata) : undefined,
    };
  }

  private getVerificationType(typeId: number): string {
    const typeMap: Record<number, string> = {
      1: 'KYC',
      2: 'BANK',
      3: 'INCOME',
      4: 'BUSINESS',
    };
    return typeMap[typeId] || 'UNKNOWN';
  }

  private getVerificationStatus(statusId: number): string {
    const statusMap: Record<number, string> = {
      1: 'PENDING',
      2: 'APPROVED',
      3: 'REJECTED',
      4: 'EXPIRED',
    };
    return statusMap[statusId] || 'UNKNOWN';
  }
}
