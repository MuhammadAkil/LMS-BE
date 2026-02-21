import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, IsString } from 'class-validator';

/**
 * Logout request DTO
 * Accepts either userId (legacy) or jwt_token + email (frontend format)
 * @swagger
 * components:
 *   schemas:
 *     LogoutRequest:
 *       type: object
 *       properties:
 *         userId:
 *           type: integer
 *           example: 1
 *         jwt_token:
 *           type: string
 *         email:
 *           type: string
 */
export class LogoutRequest {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'userId must be an integer' })
  @Min(1, { message: 'userId must be a positive integer' })
  userId?: number;

  @IsOptional()
  @IsString()
  jwt_token?: string;

  @IsOptional()
  @IsString()
  email?: string;
}
