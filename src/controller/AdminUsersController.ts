import { Controller, Get, Post, Patch, Body, Param, Query, UseMiddleware, Req } from 'routing-controllers';
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
@UseMiddleware(AdminGuard)
export class AdminUsersController {
  private usersService: AdminUsersService;

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
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ): Promise<UserListItemDto[]> {
    return this.usersService.getAllUsers(limit || 20, offset || 0);
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
  @UseMiddleware(SuperAdminGuard)
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
  @UseMiddleware(SuperAdminGuard)
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
   *
   * Response: AuditLogDto[]
   */
  @Get('/:id/logs')
  async getUserAuditLogs(
    @Param('id') userId: number,
    @Query('limit') limit?: number
  ): Promise<AuditLogDto[]> {
    return this.usersService.getUserAuditLogs(userId, limit || 50);
  }
}
