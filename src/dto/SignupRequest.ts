import { IsNotEmpty, IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

/**
 * Signup request DTO
 * @swagger
 * components:
 *   schemas:
 *     SignupRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "user@example.com"
 *         password:
 *           type: string
 *           minLength: 8
 *           maxLength: 100
 *           example: "password123"
 *         phone:
 *           type: string
 *           maxLength: 30
 *           example: "+1234567890"
 *         fullName:
 *           type: string
 *           maxLength: 255
 *           example: "John Doe"
 */
export class SignupRequest {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(100, { message: 'Password must not exceed 100 characters' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Phone must not exceed 30 characters' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Full name must not exceed 255 characters' })
  fullName?: string;

  // roleId is automatically assigned by the service and should not be provided by client
  // But accept it if sent and ignore it
  @IsOptional()
  roleId?: number;
}
