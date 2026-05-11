import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { OtpAttempt, OtpChannel, OtpPurpose } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../infra';
import { ConfigService } from '@nestjs/config';
import type { MailProvider } from './mail.provider';
import type { SmsProvider } from './sms.provider';

export const SMS_PROVIDER = Symbol('OTP_SMS_PROVIDER');
export const MAIL_PROVIDER = Symbol('OTP_MAIL_PROVIDER');

const RESEND_COOLDOWN_MS = 60_000;
const TTL_MS = 5 * 60_000;
const IP_WINDOW_MS = 60_000;
const IP_MAX = 5;
const CODE_LENGTH = 6;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ipBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: MailProvider,
  ) {}

  async send(input: {
    channel: OtpChannel;
    identifier: string;
    purpose: OtpPurpose;
    ip?: string;
  }): Promise<{ cooldownSeconds: number; expiresInSeconds: number }> {
    this.enforceIpLimit(input.ip);
    await this.enforceResendCooldown(input.identifier, input.purpose);

    const code = this.generateCode();
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + TTL_MS);

    await this.prisma.otpAttempt.create({
      data: {
        identifier: input.identifier,
        channel: input.channel,
        purpose: input.purpose,
        codeHash,
        expiresAt,
        ip: input.ip ?? null,
      },
    });

    try {
      if (input.channel === OtpChannel.SMS) {
        await this.smsProvider.send(input.identifier, code);
      } else {
        await this.mailProvider.send(input.identifier, code);
      }
    } catch (err) {
      this.logger.error(
        `failed to dispatch OTP via ${input.channel} for ${maskIdentifier(input.identifier)}: ${(err as Error).message}`,
      );
      throw new HttpException('Failed to dispatch OTP', HttpStatus.BAD_GATEWAY);
    }

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
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.prisma.otpAttempt.update({
      where: { id: attempt.id },
      data: { consumedAt: now },
    });
  }

  private async enforceResendCooldown(identifier: string, purpose: OtpPurpose): Promise<void> {
    const recent = await this.prisma.otpAttempt.findFirst({
      where: {
        identifier,
        purpose,
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

  private enforceIpLimit(ip?: string): void {
    if (!ip) return;
    const now = Date.now();
    const bucket = this.ipBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      this.ipBuckets.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
      return;
    }
    if (bucket.count >= IP_MAX) {
      throw new HttpException(
        'Too many OTP requests from this IP, slow down',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.count += 1;
  }

  private generateCode(): string {
    const max = 10 ** CODE_LENGTH;
    return String(randomInt(0, max)).padStart(CODE_LENGTH, '0');
  }

  private hashCode(code: string): string {
    return createHmac('sha256', this.secret()).update(code).digest('hex');
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
