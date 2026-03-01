import { Controller, Get, Patch, Put, Post, Delete, Body, Param, QueryParam, UseBefore, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminUsersService } from '../service/AdminUsersService';
import { AdminGuard, SuperAdminGuard } from '../middleware/AdminGuards';
import {
  UserListItemDto,
  UserDetailDto,
  UpdateUserStatusRequest,
  UpdateUserLevelRequest,
  AuditLogDto,
} from '../dto/AdminDtos';

/**
 * Admin Users Controller
 * Endpoints for user management
 *
 * Routes:
 * - GET    /admin/users              -> List users (AdminGuard)
 * - GET    /admin/users/:id          -> Get user details (AdminGuard)
 * - PATCH  /admin/users/:id/status   -> Update status (SuperAdminGuard)
 * - PATCH  /admin/users/:id/level    -> Update level (SuperAdminGuard)
 * - GET    /admin/users/:id/logs     -> Get audit logs (AdminGuard)
 */
@Controller('/admin/users')
@UseBefore(AdminGuard)
export class AdminUsersController {
  private readonly usersService: AdminUsersService;

  constructor() {
    this.usersService = new AdminUsersService();
  }

  /**
   * GET /admin/users
   * Returns paginated list of users
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   *
   * Response: UserListItemDto[]
   */
  @Get('/')
  async getAllUsers(
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number
  ): Promise<UserListItemDto[]> {
    const result = await this.usersService.getAllUsers(limit || 20, offset || 0);
    return (result as any).data || result;
  }

  /**
   * GET /admin/users/:id
   * Returns user details with audit history
   *
   * Response: UserDetailDto
   */
  @Get('/:id')
  async getUserById(@Param('id') userId: number): Promise<UserDetailDto> {
    return this.usersService.getUserById(userId);
  }

  /**
   * PATCH /admin/users/:id/status
   * Updates user status (ACTIVE, BLOCKED, PENDING, etc.)
   * Requires SuperAdminGuard
   *
   * Body: UpdateUserStatusRequest
   * - newStatus: string (ACTIVE, BLOCKED, PENDING)
   * - reason: string (required)
   *
   * Response: UserDetailDto
   */
  @Patch('/:id/status')
  @UseBefore(SuperAdminGuard)
  async updateUserStatus(
    @Param('id') userId: number,
    @Body() request: UpdateUserStatusRequest,
    @Req() req: Request
  ): Promise<UserDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.usersService.updateUserStatus(userId, request, adminId);
  }

  /**
   * PATCH /admin/users/:id/level
   * Updates user verification level
   * Requires SuperAdminGuard
   *
   * Body: UpdateUserLevelRequest
   * - newLevel: number (0-10)
   * - reason: string (required)
   *
   * Response: UserDetailDto
   */
  @Patch('/:id/level')
  @UseBefore(SuperAdminGuard)
  async updateUserLevel(
    @Param('id') userId: number,
    @Body() request: UpdateUserLevelRequest,
    @Req() req: Request
  ): Promise<UserDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.usersService.updateUserLevel(userId, request, adminId);
  }

  /**
   * GET /admin/users/:id/logs
   * Returns audit logs for user
   */
  @Get('/:id/logs')
  async getUserAuditLogs(
    @Param('id') userId: number,
    @QueryParam('limit') limit?: number
  ): Promise<AuditLogDto[]> {
    const result = await this.usersService.getUserAuditLogs(userId, limit || 50);
    return (result as any).data || result;
  }

  @Put('/:id/block')
  @UseBefore(SuperAdminGuard)
  async blockUser(@Param('id') userId: number, @Body() body: { reason?: string }, @Req() req: Request): Promise<UserDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    return this.usersService.blockUser(userId, adminId, body.reason) as Promise<UserDetailDto>;
  }

  @Put('/:id/freeze')
  @UseBefore(SuperAdminGuard)
  async freezeUser(@Param('id') userId: number, @Body() body: { reason?: string }, @Req() req: Request): Promise<UserDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    return this.usersService.freezeUser(userId, adminId, body.reason) as Promise<UserDetailDto>;
  }

  @Put('/:id/approve')
  @UseBefore(SuperAdminGuard)
  async approveUser(@Param('id') userId: number, @Body() body: { note?: string }, @Req() req: Request): Promise<UserDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    return this.usersService.approveUser(userId, adminId, body.note) as Promise<UserDetailDto>;
  }

  @Put('/:id/reject')
  @UseBefore(SuperAdminGuard)
  async rejectUser(@Param('id') userId: number, @Body() body: { reason: string }, @Req() req: Request): Promise<UserDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    if (!body?.reason?.trim()) throw new Error('Rejection reason is required');
    return this.usersService.rejectUser(userId, adminId, body.reason) as Promise<UserDetailDto>;
  }

  /**
   * Soft-delete user (sets deleted_at). Frontend calls DELETE /admin/users/:id.
   */
  @Delete('/:id')
  @UseBefore(SuperAdminGuard)
  async deleteUser(@Param('id') userId: number, @Req() req: Request): Promise<{ success: boolean }> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    return this.usersService.softDeleteUser(userId, adminId);
  }

  @Post('/bulk-approve')
  @UseBefore(SuperAdminGuard)
  async bulkApprove(@Body() body: { userIds: number[] }, @Req() req: Request): Promise<{ success: boolean; approved: number; failed: number }> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    return this.usersService.bulkApprove(body.userIds || [], adminId);
  }
}
