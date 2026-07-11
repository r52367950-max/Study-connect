import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Login by either (email | phone) + (password | otpCode).
 * Email and phone are mutually exclusive identifiers.
 * Password and OTP are mutually exclusive credentials.
 */
export class LoginDto {
  @ApiProperty({ example: 'student@example.com', required: false })
  @ValidateIf((dto: LoginDto) => !dto.phone)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '13800000000', required: false })
  @ValidateIf((dto: LoginDto) => !dto.email)
  @IsString()
  @Matches(/^[+\d][\d\s-]{6,19}$/, { message: 'invalid phone format' })
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'StrongPass123!', required: false })
  @ValidateIf((dto: LoginDto) => !dto.otpCode)
  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @ApiProperty({ example: '123456', required: false })
  @ValidateIf((dto: LoginDto) => !dto.password)
  @IsString()
  @Length(6, 6)
  // Codes are generated as 6 digits; rejecting other shapes up-front spares a
  // pointless HMAC + DB lookup per junk attempt.
  @Matches(/^\d{6}$/, { message: 'otpCode must be 6 digits' })
  @IsOptional()
  otpCode?: string;
}
