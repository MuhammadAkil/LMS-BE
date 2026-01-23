import { IsNotEmpty, IsString, Matches, Length, IsOptional, IsDateString } from 'class-validator';

export class SignupRequest {
  @IsNotEmpty({ message: 'Mobile number is required' })
  @Length(11, 13, { message: 'Mobile number length must be between 11 and 13' })
  @Matches(/^[0-9]+$/, { message: 'Mobile number must contain only digits' })
  mobileNumber!: string;

  @IsNotEmpty({ message: 'Full name is required' })
  @Length(1, 150, { message: 'Full name must not exceed 150 characters' })
  @IsString()
  fullName!: string;

  @IsNotEmpty({ message: 'CNIC is required' })
  @Length(1, 20, { message: 'CNIC must not exceed 20 characters' })
  @IsString()
  cnic!: string;

  @IsOptional()
  @Length(0, 150, { message: 'Email must not exceed 150 characters' })
  @Matches(/^[A-Za-z0-9+_.-]+@(.+)$/, { message: 'Invalid email format' })
  email?: string;

  @IsNotEmpty({ message: 'Password is required' })
  @Length(8, undefined, { message: 'Password must be at least 8 characters' })
  @IsString()
  password!: string;

  @IsNotEmpty({ message: 'Date of birth is required' })
  @IsDateString()
  dateOfBirth!: string;
}
