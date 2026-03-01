import { JsonController, Post, Body, HttpCode } from 'routing-controllers';
import { StatusCodes } from 'http-status-codes';
import { UserService } from '../service/UserService';
import { LoginRequest } from '../dto/LoginRequest';
import { ModuleResponse } from '../dto/ModuleResponse';

/**
 * Auth Controller
 * Dedicated admin login: POST /api/auth/admin/login
 * Returns 403 if user is not ADMIN (per spec).
 */
@JsonController('/auth')
export class AuthController {
  private readonly userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  @Post('/admin/login')
  @HttpCode(StatusCodes.OK)
  async adminLogin(@Body() loginRequest: LoginRequest): Promise<ModuleResponse> {
    return await this.userService.adminLogin(loginRequest);
  }
}
