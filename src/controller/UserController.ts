import {
  JsonController,
  Post,
  Body,
  HttpCode,
  Req,
  Res,
} from 'routing-controllers';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { UserService } from '../service/UserService';
import { LoginRequest } from '../dto/LoginRequest';
import { LogoutRequest } from '../dto/LogoutRequest';
import { SignupRequest } from '../dto/SignupRequest';
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
@JsonController('/user')
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
  @Post('/logout')
  @HttpCode(StatusCodes.OK)
  async logout(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: LogoutRequest,
  ): Promise<void> {
    const response = await this.userService.logout(body.userId);
    res.status(Number.parseInt(response.statusCode || '500', 10)).json(response);
  }
}
