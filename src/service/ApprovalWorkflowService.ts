import { ApprovalWorkflowLogRepository } from '../repository/ApprovalWorkflowLogRepository';
import { CommissionConfigRepository } from '../repository/CommissionConfigRepository';
import { ManagementCommissionRepository } from '../repository/ManagementCommissionRepository';
import { FileGenerationConfigRepository } from '../repository/FileGenerationConfigRepository';
import { AdminAuditService } from './AdminAuditService';
import { LmsNotificationService } from './LmsNotificationService';
import { EmailService } from './EmailService';
import { UserRepository } from '../repository/UserRepository';
import { AppDataSource } from '../config/database';

export type ApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type ApprovableEntityType = 'COMMISSION_CONFIG' | 'MANAGEMENT_COMMISSION' | 'TEMPLATE' | 'FILE_CONFIG';

export interface ApprovalTransition {
  entityType: ApprovableEntityType;
  entityId: number;
  newStatus: ApprovalStatus;
  actorId: number;
  comment?: string;
}

export interface PendingApprovalItem {
  entityType: string;
  entityId: number;
  description: string;
  createdBy: number;
  createdAt: string;
  status: string;
}

/**
 * Generic Approval State Machine
 *
 * Allowed transitions:
 * DRAFT → PENDING_APPROVAL (by creator)
 * PENDING_APPROVAL → APPROVED (by admin)
 * PENDING_APPROVAL → REJECTED (by admin)
 * REJECTED → DRAFT (by creator — to revise and resubmit)
 */
export class ApprovalWorkflowService {
  private logRepo: ApprovalWorkflowLogRepository;
  private commissionConfigRepo: CommissionConfigRepository;
  private managementCommissionRepo: ManagementCommissionRepository;
  private fileConfigRepo: FileGenerationConfigRepository;
  private auditService: AdminAuditService;
  private notificationService: LmsNotificationService;
  private emailService: EmailService;
  private userRepo: UserRepository;

  constructor() {
    this.logRepo = new ApprovalWorkflowLogRepository();
    this.commissionConfigRepo = new CommissionConfigRepository();
    this.managementCommissionRepo = new ManagementCommissionRepository();
    this.fileConfigRepo = new FileGenerationConfigRepository();
    this.auditService = new AdminAuditService();
    this.notificationService = new LmsNotificationService();
    this.emailService = new EmailService();
    this.userRepo = new UserRepository();
  }

  /**
   * Transition an entity through the approval state machine.
   */
  async transition(params: ApprovalTransition): Promise<void> {
    const { entityType, entityId, newStatus, actorId, comment } = params;

    const current = await this.getCurrentStatus(entityType, entityId);
    if (!current) throw new Error(`${entityType} #${entityId} not found`);

    this.validateTransition(current.status, newStatus, actorId, current.createdBy);

    const fromStatus = current.status;

    // Apply the transition
    await this.applyStatusChange(entityType, entityId, newStatus, actorId, comment);

    // Log the transition
    await this.logRepo.create({
      entityType,
      entityId,
      fromStatus,
      toStatus: newStatus,
      actorId,
      comment,
    });

    // Audit log
    await this.auditService.logAction(
      actorId,
      `${entityType}_${newStatus}`,
      entityType,
      entityId,
      { fromStatus, toStatus: newStatus, comment }
    );

    // Notify the creator
    await this.notifyTransition(entityType, entityId, newStatus, current.createdBy, actorId, comment);
  }

  /**
   * Submit for approval (DRAFT → PENDING_APPROVAL).
   */
  async submitForApproval(entityType: ApprovableEntityType, entityId: number, actorId: number): Promise<void> {
    await this.transition({ entityType, entityId, newStatus: 'PENDING_APPROVAL', actorId });
  }

  /**
   * Approve an entity (PENDING_APPROVAL → APPROVED). Admin only.
   */
  async approve(entityType: ApprovableEntityType, entityId: number, adminId: number, comment?: string): Promise<void> {
    await this.transition({ entityType, entityId, newStatus: 'APPROVED', actorId: adminId, comment });
  }

  /**
   * Reject an entity (PENDING_APPROVAL → REJECTED). Admin only.
   */
  async reject(entityType: ApprovableEntityType, entityId: number, adminId: number, comment: string): Promise<void> {
    if (!comment?.trim()) throw new Error('Rejection comment is required');
    await this.transition({ entityType, entityId, newStatus: 'REJECTED', actorId: adminId, comment });
  }

  /**
   * Revert to draft (REJECTED → DRAFT). Creator only.
   */
  async revertToDraft(entityType: ApprovableEntityType, entityId: number, actorId: number): Promise<void> {
    await this.transition({ entityType, entityId, newStatus: 'DRAFT', actorId });
  }

  /**
   * Get all pending approval items across all entity types.
   */
  async getAllPendingApprovals(): Promise<PendingApprovalItem[]> {
    const items: PendingApprovalItem[] = [];

    const [commissions] = await this.commissionConfigRepo.findAll(100, 0);
    const pendingCommissions = commissions.filter(c => c.status === 'PENDING_APPROVAL');
    for (const c of pendingCommissions) {
      items.push({
        entityType: 'COMMISSION_CONFIG',
        entityId: c.id,
        description: `${c.configType} commission config (${(Number(c.commissionPct) * 100).toFixed(2)}%)`,
        createdBy: c.createdBy,
        createdAt: c.createdAt.toISOString(),
        status: c.status,
      });
    }

    const [mgmtCommissions] = await this.managementCommissionRepo.findAll(100, 0);
    const pendingMgmt = mgmtCommissions.filter(m => m.status === 'PENDING_APPROVAL');
    for (const m of pendingMgmt) {
      items.push({
        entityType: 'MANAGEMENT_COMMISSION',
        entityId: m.id,
        description: `Management commission for company #${m.companyId} (${(Number(m.commissionPct) * 100).toFixed(2)}%)`,
        createdBy: m.createdBy,
        createdAt: m.createdAt.toISOString(),
        status: m.status,
      });
    }

    const pendingTemplates = await AppDataSource.query(
      `SELECT id, type, language, created_by, created_at FROM templates WHERE status = 'PENDING_APPROVAL'`
    );
    for (const t of pendingTemplates) {
      items.push({
        entityType: 'TEMPLATE',
        entityId: t.id,
        description: `Template: ${t.type} (${t.language})`,
        createdBy: t.created_by,
        createdAt: t.created_at,
        status: 'PENDING_APPROVAL',
      });
    }

    const [fileConfigs] = await this.fileConfigRepo.findAll(100, 0);
    const pendingFiles = fileConfigs.filter(f => f.status === 'PENDING_APPROVAL');
    for (const f of pendingFiles) {
      items.push({
        entityType: 'FILE_CONFIG',
        entityId: f.id,
        description: `File config: ${f.name} (${f.fileFormat})`,
        createdBy: f.createdBy,
        createdAt: f.createdAt.toISOString(),
        status: f.status,
      });
    }

    return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /**
   * Get approval history for a specific entity.
   */
  async getApprovalHistory(entityType: ApprovableEntityType, entityId: number) {
    return await this.logRepo.findByEntity(entityType, entityId);
  }

  private async getCurrentStatus(entityType: string, entityId: number): Promise<{ status: string; createdBy: number } | null> {
    switch (entityType) {
      case 'COMMISSION_CONFIG': {
        const c = await this.commissionConfigRepo.findById(entityId);
        return c ? { status: c.status, createdBy: c.createdBy } : null;
      }
      case 'MANAGEMENT_COMMISSION': {
        const m = await this.managementCommissionRepo.findById(entityId);
        return m ? { status: m.status, createdBy: m.createdBy } : null;
      }
      case 'TEMPLATE': {
        const rows = await AppDataSource.query(
          `SELECT status, created_by FROM templates WHERE id = ?`, [entityId]
        );
        return rows[0] ? { status: rows[0].status, createdBy: rows[0].created_by } : null;
      }
      case 'FILE_CONFIG': {
        const f = await this.fileConfigRepo.findById(entityId);
        return f ? { status: f.status, createdBy: f.createdBy } : null;
      }
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  private validateTransition(fromStatus: string, toStatus: string, actorId: number, createdBy: number): void {
    const allowed: Record<string, string[]> = {
      DRAFT: ['PENDING_APPROVAL'],
      PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
      REJECTED: ['DRAFT'],
      APPROVED: [], // Terminal state — no transitions out
    };

    if (!allowed[fromStatus]?.includes(toStatus)) {
      throw new Error(`Invalid transition: ${fromStatus} → ${toStatus}`);
    }
  }

  private async applyStatusChange(
    entityType: string,
    entityId: number,
    newStatus: string,
    actorId: number,
    comment?: string
  ): Promise<void> {
    const now = new Date();
    const isApproved = newStatus === 'APPROVED';
    const isRejected = newStatus === 'REJECTED';

    switch (entityType) {
      case 'COMMISSION_CONFIG':
        await this.commissionConfigRepo.update(entityId, {
          status: newStatus as any,
          ...(isApproved && { approvedBy: actorId, approvedAt: now }),
          ...(isRejected && { rejectionReason: comment }),
        });
        break;
      case 'MANAGEMENT_COMMISSION':
        await this.managementCommissionRepo.update(entityId, {
          status: newStatus as any,
          ...(isApproved && { approvedBy: actorId, approvedAt: now }),
          ...(isRejected && { rejectionReason: comment }),
        });
        break;
      case 'TEMPLATE':
        await AppDataSource.query(
          `UPDATE templates SET status = ?, ${isApproved ? 'approved_by = ?, approved_at = NOW(),' : ''} ${isRejected ? 'rejection_reason = ?,' : ''} updated_at = NOW() WHERE id = ?`,
          [
            newStatus,
            ...(isApproved ? [actorId] : []),
            ...(isRejected && comment ? [comment] : []),
            entityId,
          ]
        );
        break;
      case 'FILE_CONFIG':
        await this.fileConfigRepo.update(entityId, {
          status: newStatus as any,
          ...(isApproved && { approvedBy: actorId }),
        });
        break;
    }
  }

  private async notifyTransition(
    entityType: string,
    entityId: number,
    newStatus: string,
    createdBy: number,
    actorId: number,
    comment?: string
  ): Promise<void> {
    const statusLabels: Record<string, string> = {
      PENDING_APPROVAL: 'submitted for approval',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      DRAFT: 'reverted to draft',
    };

    const label = statusLabels[newStatus] ?? newStatus;
    const title = `${entityType} #${entityId} ${label}`;
    const message = comment
      ? `${entityType} #${entityId} has been ${label}. Comment: ${comment}`
      : `${entityType} #${entityId} has been ${label}.`;

    // Notify creator
    await this.notificationService.notify(createdBy, `APPROVAL_${newStatus}`, title, message, {
      entityType,
      entityId: String(entityId),
    });

    // If pending approval, notify all admins
    if (newStatus === 'PENDING_APPROVAL') {
      const admins = await AppDataSource.query(`SELECT id FROM users WHERE role_id = 1 AND status_id = 2`);
      for (const admin of admins) {
        if (admin.id !== createdBy) {
          await this.notificationService.notify(admin.id, 'APPROVAL_PENDING', title, message, {
            entityType,
            entityId: String(entityId),
          });
        }
      }
    }
  }
}
