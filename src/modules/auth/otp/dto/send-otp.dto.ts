import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Matches, ValidateIf } from 'class-validator';
import { OtpPurpose } from '@prisma/client';

export enum OtpChannelDto {
  SMS = 'sms',
  EMAIL = 'email',
}

export class SendOtpDto {
  @ApiProperty({ enum: OtpChannelDto, example: OtpChannelDto.SMS })
  @IsEnum(OtpChannelDto)
  channel!: OtpChannelDto;

  @ApiProperty({ example: '13800000000', required: false })
  @ValidateIf((dto: SendOtpDto) => dto.channel === OtpChannelDto.SMS)
  @IsString()
  @Matches(/^[+\d][\d\s-]{6,19}$/, { message: 'invalid phone format' })
  phone?: string;

  @ApiProperty({ example: 'student@example.com', required: false })
  @ValidateIf((dto: SendOtpDto) => dto.channel === OtpChannelDto.EMAIL)
  @IsEmail()
  email?: string;

  @ApiProperty({ enum: OtpPurpose, example: OtpPurpose.LOGIN })
  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;
}
