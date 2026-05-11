import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Register with either email or phone (one is required).
 * `otpCode` must come from a prior `/auth/otp/send` cycle with purpose=REGISTER
 * matching the identifier being registered.
 */
export class RegisterDto {
  @ApiProperty({ example: 'student@example.com', required: false })
  @ValidateIf((dto: RegisterDto) => !dto.phone)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '13800000000', required: false })
  @ValidateIf((dto: RegisterDto) => !dto.email)
  @IsString()
  @Matches(/^[+\d][\d\s-]{6,19}$/, { message: 'invalid phone format' })
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'alice' })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username!: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  otpCode!: string;
}
