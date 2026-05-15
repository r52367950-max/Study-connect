import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OtpChannel } from '@prisma/client';
import { Request } from 'express';
import { Public } from '../decorators/public.decorator';
import { RateLimit } from '../../../common/rate-limit.decorator';
import { normalizePhone } from '../../../common/util';
import { SendOtpDto, OtpChannelDto } from './dto/send-otp.dto';
import { OtpService } from './otp.service';

@ApiTags('auth')
@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Public()
  @Post('send')
  @RateLimit({ name: 'auth-otp-send-ip', limit: 10, windowMs: 60_000 })
  @ApiOperation({ summary: 'Send OTP via SMS or email' })
  @ApiOkResponse({
    schema: {
      properties: {
        cooldownSeconds: { type: 'number' },
        expiresInSeconds: { type: 'number' },
      },
    },
  })
  async send(
    @Body() dto: SendOtpDto,
    @Req() req: Request,
  ): Promise<{ cooldownSeconds: number; expiresInSeconds: number }> {
    const identifier =
      dto.channel === OtpChannelDto.SMS
        ? normalizePhone(dto.phone!)
        : dto.email!.toLowerCase();
    const channel = dto.channel === OtpChannelDto.SMS ? OtpChannel.SMS : OtpChannel.EMAIL;
    return this.otpService.send({
      channel,
      identifier,
      purpose: dto.purpose,
      ip: req.ip,
    });
  }
}
