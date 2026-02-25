import {
  JsonController,
  Post,
  Put,
  Body,
  HttpCode,
  Req,
  Res,
} from 'routing-controllers';
import { JwtTokenUtil } from '../util/JwtTokenUtil';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { UserService } from '../service/UserService';
import { LoginRequest } from '../dto/LoginRequest';
import { LogoutRequest } from '../dto/LogoutRequest';
import { SignupRequest } from '../dto/SignupRequest';
import { ChangePasswordRequest } from '../dto/ChangePasswordRequest';
import { ModuleResponse } from '../dto/ModuleResponse';

/**
 * User Controller
 * Handles user authentication endpoints: login, signup, logout
 * 
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: User authentication endpoints
 */
@JsonController('/users')
export class UserController {
  private readonly userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * @swagger
   * /user/signup:
   *   post:
   *     summary: Register a new user
   *     description: Create a new user account with email and password
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/SignupRequest'
   *     responses:
   *       201:
   *         description: User created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 statusCode:
   *                   type: string
   *                 statusMessage:
   *                   type: string
   *                 dist:
   *                   type: object
   *                   properties:
   *                     userId:
   *                       type: number
   *                     email:
   *                       type: string
   *       400:
   *         description: Bad request - validation failed or email already exists
   *       500:
   *         description: Internal server error
   */
  @Post('/signup')
  @HttpCode(StatusCodes.CREATED)
  async signup(@Body() signupRequest: SignupRequest): Promise<ModuleResponse> {
    return await this.userService.signup(signupRequest);
  }

  /**
   * @swagger
   * /user/login:
   *   post:
   *     summary: Login user
   *     description: Authenticate user with email and password, returns JWT token
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LoginRequest'
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 statusCode:
   *                   type: string
   *                 statusMessage:
   *                   type: string
   *                 dist:
   *                   $ref: '#/components/schemas/LoginResponse'
   *       401:
   *         description: Unauthorized - Invalid credentials
   *       403:
   *         description: Forbidden - User account is not active
   *       500:
   *         description: Internal server error
   */
  @Post('/login')
  @HttpCode(StatusCodes.OK)
  async login(@Body() loginRequest: LoginRequest): Promise<ModuleResponse> {
    return await this.userService.login(loginRequest);
  }

  /**
   * @swagger
   * /user/logout:
   *   post:
   *     summary: Logout user
   *     description: Expire the latest session for the given userId. No authentication required.
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LogoutRequest'
   *     responses:
   *       200:
   *         description: Logout successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 statusCode:
   *                   type: string
   *                 statusMessage:
   *                   type: string
   *       401:
   *         description: Unauthorized - No token provided
   *       403:
   *         description: Forbidden - Token does not belong to user
   *       404:
   *         description: Not Found - Session not found
   *       500:
   *         description: Internal server error
   */
  /**
   * PUT /users/change-password
   * Requires authentication. Validates current password then sets new (min 8 chars, complexity).
   */
  @Put('/change-password')
  @HttpCode(StatusCodes.OK)
  async changePassword(
    @Req() req: Request,
    @Body() body: ChangePasswordRequest,
  ): Promise<ModuleResponse> {
    const userId = (req as any).user?.id ?? (req as any).user?.userId;
    if (!userId) {
      return ModuleResponse.generateCustomResponse(401, 'Authentication required');
    }
    if (body.newPassword !== body.confirmPassword) {
      return ModuleResponse.generateCustomResponse(400, 'New password and confirmation do not match');
    }
    const current = body.currentPassword ?? (body as any).oldPassword;
    if (!current) {
      return ModuleResponse.generateCustomResponse(400, 'Current password is required');
    }
    return await this.userService.changePassword(userId, current, body.newPassword);
  }

  @Post('/logout')
  @HttpCode(StatusCodes.OK)
  async logout(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: LogoutRequest,
  ): Promise<void> {
    let userId = body.userId;

    // Frontend sends jwt_token instead of userId — extract userId from token
    if (!userId && body.jwt_token) {
      try {
        userId = JwtTokenUtil.getUserIdFromToken(body.jwt_token) ?? undefined;
      } catch {
        // ignore decode errors — proceed with undefined userId
      }
    }

    if (!userId) {
      res.status(400).json({ statusCode: '400', statusMessage: 'userId or jwt_token is required' });
      return;
    }

    const response = await this.userService.logout(userId);
    res.status(Number.parseInt(response.statusCode || '500', 10)).json(response);
  }
}
