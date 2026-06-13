import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { OtpAttempt, OtpChannel, OtpPurpose } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../infra';
import { ConfigService } from '@nestjs/config';
import type { MailProvider } from './mail.provider';
import type { SmsProvider } from './sms.provider';
import { MetricsService } from '../../metrics/metrics.service';

export const SMS_PROVIDER = Symbol('OTP_SMS_PROVIDER');
export const MAIL_PROVIDER = Symbol('OTP_MAIL_PROVIDER');

const RESEND_COOLDOWN_MS = 60_000;
const TTL_MS = 5 * 60_000;
const IP_WINDOW_MS = 60_000;
const IP_MAX = 5;
const CODE_LENGTH = 6;
// Cap failed verification attempts so a 6-digit code (1e6 space) cannot be
// brute-forced within its TTL. Window is the same as the code TTL.
const VERIFY_MAX_ATTEMPTS = 5;
const FAILURE_SENTINEL = '__invalid__';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: MailProvider,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async send(input: {
    channel: OtpChannel;
    identifier: string;
    purpose: OtpPurpose;
    ip?: string;
  }): Promise<{ cooldownSeconds: number; expiresInSeconds: number }> {
    await this.enforceIpLimit(input.ip);
    await this.enforceResendCooldown(input.identifier, input.purpose);
    await this.assertDailyCapAvailable(input.identifier);

    const code = this.generateCode();
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + TTL_MS);

    const createdAttempt = await this.prisma.otpAttempt.create({
      data: {
        identifier: input.identifier,
        channel: input.channel,
        purpose: input.purpose,
        codeHash,
        expiresAt,
        ip: input.ip ?? null,
      },
      select: { id: true },
    });

    try {
      this.logger.log({ event: 'OTP_SEND_ATTEMPT', channel: input.channel, purpose: input.purpose, identifier: maskIdentifier(input.identifier) });
      if (input.channel === OtpChannel.SMS) {
        await this.smsProvider.send(input.identifier, code);
      } else {
        await this.mailProvider.send(input.identifier, code);
      }
    } catch (err) {
      await this.prisma.otpAttempt
        .delete({ where: { id: createdAttempt.id } })
        .catch(() => undefined);
      this.metrics?.increment('otp_failures_total', { channel: input.channel, purpose: input.purpose, reason: 'dispatch' });
      this.logger.error(
        `failed to dispatch OTP via ${input.channel} for ${maskIdentifier(input.identifier)}: ${(err as Error).message}`,
      );
      throw new HttpException('Failed to dispatch OTP', HttpStatus.BAD_GATEWAY);
    }

    this.metrics?.increment('otp_sent_total', { channel: input.channel, purpose: input.purpose });
    this.logger.log({ event: 'OTP_SEND_SUCCESS', channel: input.channel, purpose: input.purpose, identifier: maskIdentifier(input.identifier) });

    return {
      cooldownSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000),
      expiresInSeconds: Math.ceil(TTL_MS / 1000),
    };
  }

  async consume(input: {
    channel: OtpChannel;
    identifier: string;
    purpose: OtpPurpose;
    code: string;
  }): Promise<void> {
    // Test-only bypass: lets integration tests exercise register/login without
    // wiring SMS/email providers. Refuses to activate in production no matter
    // how the env is set, so a leaked flag cannot disable OTP for real users.
    if (
      process.env.AUTH_OTP_TEST_BYPASS === 'true' &&
      process.env.NODE_ENV !== 'production'
    ) {
      return;
    }

    await this.assertVerifyAttemptsRemaining(input.channel, input.identifier, input.purpose);

    const now = new Date();
    const attempt = await this.prisma.otpAttempt.findFirst({
      where: {
        identifier: input.identifier,
        channel: input.channel,
        purpose: input.purpose,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt || !this.codesEqual(attempt.codeHash, input.code)) {
      await this.recordVerifyFailure(input.channel, input.identifier, input.purpose);
      this.metrics?.increment('otp_failures_total', { channel: input.channel, purpose: input.purpose, reason: 'invalid_or_expired' });
      this.logger.warn({ event: 'OTP_VERIFY_FAILED', channel: input.channel, purpose: input.purpose, identifier: maskIdentifier(input.identifier) });
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Atomic claim: the consumedAt-null condition makes concurrent consumes of the same
    // code race on the row update — exactly one wins, so an OTP stays single-use.
    const claimed = await this.prisma.otpAttempt.updateMany({
      where: { id: attempt.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (claimed.count === 0) {
      this.metrics?.increment('otp_failures_total', { channel: input.channel, purpose: input.purpose, reason: 'replay' });
      this.logger.warn({ event: 'OTP_VERIFY_REPLAYED', channel: input.channel, purpose: input.purpose, identifier: maskIdentifier(input.identifier) });
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    this.metrics?.increment('otp_consumed_total', { channel: input.channel, purpose: input.purpose });
    this.logger.log({ event: 'OTP_VERIFY_SUCCESS', channel: input.channel, purpose: input.purpose, identifier: maskIdentifier(input.identifier) });
  }


  private async assertDailyCapAvailable(identifier: string): Promise<void> {
    const rawCap = Number(process.env.OTP_DAILY_CAP ?? 10);
    const cap = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : 10;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await this.prisma.otpAttempt.count({
      where: {
        identifier,
        codeHash: { not: this.failureHash() },
        createdAt: { gt: dayAgo },
      },
    });

    if (count >= cap) {
      this.logger.warn(
        {
          event: 'OTP_DAILY_CAP_REACHED',
          identifier: maskIdentifier(identifier),
          cap,
          count,
        },
      );
      throw new HttpException('OTP daily cap reached', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async assertVerifyAttemptsRemaining(
    channel: OtpChannel,
    identifier: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const ttlAgo = new Date(Date.now() - TTL_MS);
    const count = await this.prisma.otpAttempt.count({
      where: {
        channel,
        identifier,
        purpose,
        codeHash: this.failureHash(),
        createdAt: { gt: ttlAgo },
      },
    });

    if (count >= VERIFY_MAX_ATTEMPTS) {
      this.metrics?.increment('otp_failures_total', { channel, purpose, reason: 'verify_rate_limited' });
      throw new HttpException('Too many incorrect codes; request a new one', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async recordVerifyFailure(
    channel: OtpChannel,
    identifier: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.otpAttempt.create({
      data: {
        channel,
        identifier,
        purpose,
        codeHash: this.failureHash(),
        expiresAt: now,
        consumedAt: now,
      },
    });
  }

  private async enforceResendCooldown(identifier: string, purpose: OtpPurpose): Promise<void> {
    const recent = await this.prisma.otpAttempt.findFirst({
      where: {
        identifier,
        purpose,
        codeHash: { not: this.failureHash() },
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (recent) {
      const retryAfter = Math.ceil(
        (recent.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now()) / 1000,
      );
      throw new HttpException(
        `Please wait ${Math.max(retryAfter, 1)}s before requesting another code`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async enforceIpLimit(ip?: string): Promise<void> {
    if (!ip) return;
    const windowStart = new Date(Date.now() - IP_WINDOW_MS);
    const count = await this.prisma.otpAttempt.count({
      where: {
        ip,
        createdAt: { gt: windowStart },
      },
    });
    if (count >= IP_MAX) {
      this.metrics?.increment('otp_failures_total', { reason: 'ip_rate_limited' });
      this.logger.warn({ event: 'OTP_IP_RATE_LIMITED', ip, count, windowMs: IP_WINDOW_MS });
      throw new HttpException('Too many OTP requests from this IP, slow down', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private generateCode(): string {
    const max = 10 ** CODE_LENGTH;
    return String(randomInt(0, max)).padStart(CODE_LENGTH, '0');
  }

  private hashCode(code: string): string {
    return createHmac('sha256', this.secret()).update(code).digest('hex');
  }

  private failureHash(): string {
    return this.hashCode(FAILURE_SENTINEL);
  }

  private codesEqual(stored: string, candidate: string): boolean {
    const expected = Buffer.from(stored, 'hex');
    const actual = Buffer.from(this.hashCode(candidate), 'hex');
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  private secret(): string {
    const secret = this.config.get<string>('OTP_SECRET') ?? this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new BadRequestException('OTP_SECRET (or JWT_SECRET) is not configured');
    }
    return secret;
  }
}

function maskIdentifier(id: string): string {
  if (id.includes('@')) {
    const [name, domain] = id.split('@');
    const head = name.slice(0, 2);
    return `${head}***@${domain}`;
  }
  return id.replace(/^(\+?\d{2,3})(\d+)(\d{2})$/, (_, p1, p2, p3) => `${p1}***${p3}`);
}

export type { OtpAttempt };
