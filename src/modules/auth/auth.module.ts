import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitModule } from '../../common/rate-limit.module';
import { SecurityModule } from '../../common/security/security.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { OtpController } from './otp/otp.controller';
import {
  MAIL_PROVIDER,
  OtpService,
  SMS_PROVIDER,
} from './otp/otp.service';
import { createSmsProvider } from './otp/sms.provider';
import { createMailProvider } from './otp/mail.provider';

@Module({
  imports: [RateLimitModule, SecurityModule],
  controllers: [AuthController, OtpController],
  providers: [
    AuthService,
    RolesGuard,
    OtpService,
    {
      provide: SMS_PROVIDER,
      useFactory: (config: ConfigService) =>
        createSmsProvider({
          ALIYUN_SMS_ACCESS_KEY_ID: config.get('ALIYUN_SMS_ACCESS_KEY_ID'),
          ALIYUN_SMS_ACCESS_KEY_SECRET: config.get('ALIYUN_SMS_ACCESS_KEY_SECRET'),
          ALIYUN_SMS_SIGN_NAME: config.get('ALIYUN_SMS_SIGN_NAME'),
          ALIYUN_SMS_TEMPLATE_CODE: config.get('ALIYUN_SMS_TEMPLATE_CODE'),
          ALIYUN_SMS_ENDPOINT: config.get('ALIYUN_SMS_ENDPOINT'),
        }),
      inject: [ConfigService],
    },
    {
      provide: MAIL_PROVIDER,
      useFactory: (config: ConfigService) =>
        createMailProvider({
          SMTP_HOST: config.get('SMTP_HOST'),
          SMTP_PORT: config.get('SMTP_PORT'),
          SMTP_USER: config.get('SMTP_USER'),
          SMTP_PASS: config.get('SMTP_PASS'),
          SMTP_FROM: config.get('SMTP_FROM'),
        }),
      inject: [ConfigService],
    },
  ],
  exports: [AuthService, OtpService],
})
export class AuthModule {}
