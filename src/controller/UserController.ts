import {
  JsonController,
  Post,
  Body,
  HttpCode,
} from 'routing-controllers';
import { StatusCodes } from 'http-status-codes';
import { CustomerService } from '../service/CustomerService';
import { LoginRequest } from '../dto/LoginRequest';
import { SignupRequest } from '../dto/SignupRequest';
import { LogoutRequest } from '../dto/LogoutRequest';
import { ModuleResponse } from '../dto/ModuleResponse';

/**
 * @swagger
 * tags:
 *   - name: User
 *     description: User management endpoints
 */
@JsonController('/user')
export class UserController {
  private customerService: CustomerService;

  constructor() {
    this.customerService = new CustomerService();
  }

  /**
   * @swagger
   * /user/login:
   *   post:
   *     summary: Login user
   *     description: Login user with mobile number and password
   *     tags: [User]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - mobileNumber
   *               - password
   *             properties:
   *               mobileNumber:
   *                 type: string
   *                 minLength: 11
   *                 maxLength: 13
   *                 example: "03001234567"
   *               password:
   *                 type: string
   *                 example: "password123"
   *     responses:
   *       200:
   *         description: Login successful
   *       401:
   *         description: Invalid credentials
   */
  @Post('/login')
  @HttpCode(StatusCodes.OK)
  async login(@Body() loginRequest: LoginRequest): Promise<ModuleResponse> {
    return await this.customerService.login(loginRequest);
  }

  /**
   * @swagger
   * /user/signup:
   *   post:
   *     summary: Register a new customer
   *     description: Register a new customer
   *     tags: [User]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - mobileNumber
   *               - fullName
   *               - cnic
   *               - password
   *               - dateOfBirth
   *             properties:
   *               mobileNumber:
   *                 type: string
   *                 example: "03001234567"
   *               fullName:
   *                 type: string
   *                 example: "John Doe"
   *               cnic:
   *                 type: string
   *                 example: "12345-1234567-1"
   *               email:
   *                 type: string
   *                 example: "john@example.com"
   *               password:
   *                 type: string
   *                 example: "password123"
   *               dateOfBirth:
   *                 type: string
   *                 format: date
   *                 example: "1990-01-01"
   *     responses:
   *       201:
   *         description: Customer created successfully
   *       400:
   *         description: Bad request
   */
  @Post('/signup')
  @HttpCode(StatusCodes.CREATED)
  async signup(@Body() signupRequest: SignupRequest): Promise<ModuleResponse> {
    return await this.customerService.signup(signupRequest);
  }

  /**
   * @swagger
   * /user/logout:
   *   post:
   *     summary: Logout user
   *     description: Logout user by mobile number
   *     tags: [User]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - mobileNumber
   *             properties:
   *               mobileNumber:
   *                 type: string
   *                 example: "03001234567"
   *     responses:
   *       200:
   *         description: Logout successful
   *       401:
   *         description: Unauthorized
   */
  @Post('/logout')
  @HttpCode(StatusCodes.OK)
  async logout(@Body() logoutRequest: LogoutRequest): Promise<ModuleResponse> {
    return await this.customerService.logout(logoutRequest);
  }
}
