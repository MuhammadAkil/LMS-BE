import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, Min } from 'class-validator';

/**
 * Logout request DTO - userId in body
 * @swagger
 * components:
 *   schemas:
 *     LogoutRequest:
 *       type: object
 *       required:
 *         - userId
 *       properties:
 *         userId:
 *           type: integer
 *           example: 1
 */
export class LogoutRequest {
  @IsNotEmpty({ message: 'userId is required' })
  @Type(() => Number)
  @IsInt({ message: 'userId must be an integer' })
  @Min(1, { message: 'userId must be a positive integer' })
  userId!: number;
}
