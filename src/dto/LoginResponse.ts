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
  jwtToken!: string;
  /** @deprecated use jwtToken */
  token!: string;
  userId!: number;
  email!: string;
  roleId!: number;
  role!: string;
  expiresAt!: Date;

  constructor(token: string, userId: number, email: string, roleId: number, expiresAt: Date, role?: string) {
    this.jwtToken = token;
    this.token = token;
    this.userId = userId;
    this.email = email;
    this.roleId = roleId;
    this.role = role ?? LoginResponse.roleIdToName(roleId);
    this.expiresAt = expiresAt;
  }

  private static roleIdToName(roleId: number): string {
    const map: Record<number, string> = {
      1: 'ADMIN',
      2: 'BORROWER',
      3: 'LENDER',
      4: 'COMPANY',
    };
    return map[roleId] ?? 'BORROWER';
  }
}
