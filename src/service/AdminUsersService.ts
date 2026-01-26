import { UserRepository } from '../repository/UserRepository';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import { AdminAuditService } from './AdminAuditService';
import { UserListItemDto, UserDetailDto, UpdateUserStatusRequest, UpdateUserLevelRequest } from '../dto/AdminDtos';

/**
 * Admin User Management Service
 * Handles user status changes, level updates, and audit tracking
 */
export class AdminUsersService {
  private userRepo: UserRepository;
  private auditRepo: AuditLogRepository;
  private auditService: AdminAuditService;

  constructor() {
    this.userRepo = new UserRepository();
    this.auditRepo = new AuditLogRepository();
    this.auditService = new AdminAuditService();
  }

  /**
   * Get paginated user list
   */
  async getAllUsers(limit: number = 20, offset: number = 0) {
    const [users, total] = await this.userRepo.findAll(limit, offset);

    const dtos: UserListItemDto[] = users.map(user => ({
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: this.getRoleName(user.roleId),
      statusId: user.statusId,
      statusName: this.getStatusName(user.statusId),
      level: user.level,
      phone: user.phone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<UserDetailDto | null> {
    const user = await this.userRepo.findById(userId);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: this.getRoleName(user.roleId),
      statusId: user.statusId,
      statusName: this.getStatusName(user.statusId),
      level: user.level,
      phone: user.phone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Update user status
   * Validates status exists in database
   * Logs change and triggers notification
   */
  async updateUserStatus(
    userId: number,
    request: UpdateUserStatusRequest,
    adminId: number
  ): Promise<UserDetailDto | null> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const oldStatus = user.statusId;

    // Update user status
    const updated = await this.userRepo.update(userId, {
      statusId: request.statusId,
    });

    if (!updated) {
      throw new Error('Failed to update user status');
    }

    // Log the change
    await this.auditService.logAndNotify(
      adminId,
      'USER_STATUS_CHANGED',
      'USER',
      userId,
      userId, // affectedUserId
      'USER_STATUS_CHANGED', // notificationType
      {
        oldStatusId: oldStatus,
        newStatusId: request.statusId,
        reason: request.reason,
        changedBy: adminId,
      }, // notificationPayload
      {
        oldStatus,
        newStatus: request.statusId,
        reason: request.reason || 'No reason provided',
      } // auditMetadata
    );

    return this.getUserById(userId);
  }

  /**
   * Update user verification level
   * Logs change and triggers notification
   */
  async updateUserLevel(
    userId: number,
    request: UpdateUserLevelRequest,
    adminId: number
  ): Promise<UserDetailDto | null> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const oldLevel = user.level;

    // Update user level
    const updated = await this.userRepo.update(userId, {
      level: request.level,
    });

    if (!updated) {
      throw new Error('Failed to update user level');
    }

    // Log the change
    await this.auditService.logAndNotify(
      adminId,
      'USER_LEVEL_CHANGED',
      'USER',
      userId,
      userId, // affectedUserId
      'USER_LEVEL_CHANGED', // notificationType
      {
        oldLevel,
        newLevel: request.level,
        reason: request.reason,
        changedBy: adminId,
      }, // notificationPayload
      {
        oldLevel,
        newLevel: request.level,
        reason: request.reason || 'Level upgraded by admin',
      } // auditMetadata
    );

    return this.getUserById(userId);
  }

  /**
   * Get audit logs for specific user
   */
  async getUserAuditLogs(userId: number, limit: number = 50, offset: number = 0) {
    const logs = await this.auditRepo.findByEntity('USER', userId);

    return {
      data: logs.slice(offset, offset + limit),
      total: logs.length,
      limit,
      offset,
    };
  }

  /**
   * Get users by status
   */
  async getUsersByStatus(statusId: number, limit: number = 20, offset: number = 0) {
    const [users, total] = await this.userRepo.findByStatus(statusId, limit, offset);

    const dtos: UserListItemDto[] = users.map(user => ({
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: this.getRoleName(user.roleId),
      statusId: user.statusId,
      statusName: this.getStatusName(user.statusId),
      level: user.level,
      phone: user.phone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(limit: number = 20, offset: number = 0) {
    return this.getUsersByStatus(3, limit, offset); // statusId 3 = BLOCKED
  }

  /**
   * Get pending users
   */
  async getPendingUsers(limit: number = 20, offset: number = 0) {
    return this.getUsersByStatus(1, limit, offset); // statusId 1 = PENDING
  }

  private getRoleName(roleId: number): string {
    const roleMap: Record<number, string> = {
      1: 'ADMIN',
      2: 'BORROWER',
      3: 'LENDER',
      4: 'COMPANY',
    };
    return roleMap[roleId] || 'UNKNOWN';
  }

  private getStatusName(statusId: number): string {
    const statusMap: Record<number, string> = {
      1: 'PENDING',
      2: 'ACTIVE',
      3: 'BLOCKED',
      4: 'FROZEN',
    };
    return statusMap[statusId] || 'UNKNOWN';
  }
}
