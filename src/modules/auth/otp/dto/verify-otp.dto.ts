import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { OtpPurpose } from '@prisma/client';
import { OtpChannelDto } from './send-otp.dto';

export class VerifyOtpDto {
  @ApiProperty({ enum: OtpChannelDto })
  @IsEnum(OtpChannelDto)
  channel!: OtpChannelDto;

  @ApiProperty({ example: '13800000000', required: false })
  @ValidateIf((dto: VerifyOtpDto) => dto.channel === OtpChannelDto.SMS)
  @IsString()
  @Matches(/^[+\d][\d\s-]{6,19}$/)
  phone?: string;

  @ApiProperty({ example: 'student@example.com', required: false })
  @ValidateIf((dto: VerifyOtpDto) => dto.channel === OtpChannelDto.EMAIL)
  @IsEmail()
  email?: string;

  @ApiProperty({ enum: OtpPurpose })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}
