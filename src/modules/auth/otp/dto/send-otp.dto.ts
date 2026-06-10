import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsIn, IsString, Matches, ValidateIf } from 'class-validator';
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

  // RESET stays in the Prisma enum but is not accepted here: there is no redemption
  // endpoint for it yet, so allowing it would mint codes that can never be used.
  @ApiProperty({ enum: [OtpPurpose.REGISTER, OtpPurpose.LOGIN], example: OtpPurpose.LOGIN })
  @IsIn([OtpPurpose.REGISTER, OtpPurpose.LOGIN])
  purpose!: OtpPurpose;
}
