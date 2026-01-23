import { IsNotEmpty, Matches, Length } from 'class-validator';

export class LogoutRequest {
  @IsNotEmpty({ message: 'Mobile number is required' })
  @Length(11, 13, { message: 'Mobile number length must be between 11 and 13' })
  @Matches(/^[0-9]+$/, { message: 'Mobile number must contain only digits' })
  mobileNumber!: string;
}
