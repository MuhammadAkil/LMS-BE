/**
 * Login response DTO
 * @swagger
 * components:
 *   schemas:
 *     LoginResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: JWT token for authentication
 *         userId:
 *           type: number
 *           description: User ID
 *         email:
 *           type: string
 *           description: User email
 *         roleId:
 *           type: number
 *           description: User role ID
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: Token expiration time
 */
export class LoginResponse {
  token!: string;
  userId!: number;
  email!: string;
  roleId!: number;
  expiresAt!: Date;

  constructor(token: string, userId: number, email: string, roleId: number, expiresAt: Date) {
    this.token = token;
    this.userId = userId;
    this.email = email;
    this.roleId = roleId;
    this.expiresAt = expiresAt;
  }
}
