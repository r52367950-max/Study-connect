import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel, OtpPurpose, User, UserRole, UserStatus } from '@prisma/client';
import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../../infra';
import { RateLimitService } from '../../common/rate-limit.service';
import { normalizePhone } from '../../common/util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OtpService } from './otp/otp.service';

export type AuthUser = Pick<User, 'id' | 'email' | 'username' | 'role'> & {
  phone: string | null;
};

type AccessPayload = {
  type: 'access';
  sub: string;
  role: UserRole;
  ver: number;
  iat: number;
  exp: number;
};

type RefreshPayload = {
  type: 'refresh';
  sub: string;
  ver: number;
  exp: number;
};

const scryptAsync = promisify(scrypt);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
    private readonly otpService: OtpService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    if (!dto.email && !dto.phone) {
      throw new UnprocessableEntityException('Email or phone is required');
    }
    if (dto.email && dto.phone) {
      throw new UnprocessableEntityException('Provide either email or phone, not both');
    }

    const channel = dto.email ? OtpChannel.EMAIL : OtpChannel.SMS;
    const identifier = dto.email
      ? dto.email.toLowerCase()
      : normalizePhone(dto.phone!);

    await this.otpService.consume({
      channel,
      identifier,
      purpose: OtpPurpose.REGISTER,
      code: dto.otpCode,
    });

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          dto.email ? { email: identifier } : undefined,
          dto.phone ? { phone: identifier } : undefined,
          { username: dto.username },
        ].filter(Boolean) as object[],
      },
    });

    if (existing) {
      throw new UnprocessableEntityException('Identifier or username already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email ? identifier : null,
        phone: dto.phone ? identifier : null,
        username: dto.username,
        passwordHash,
        role: UserRole.USER,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        role: true,
      },
    });

    return {
      accessToken: this.issueAccessToken(user, 0),
      refreshToken: this.issueRefreshToken(user.id, 0),
      user,
    };
  }

  async login(dto: LoginDto, ipAddress = 'unknown'): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    if (!dto.email && !dto.phone) {
      throw new UnprocessableEntityException('Email or phone is required');
    }
    if (!dto.password && !dto.otpCode) {
      throw new UnprocessableEntityException('Password or OTP code is required');
    }

    const identifier = dto.email
      ? dto.email.toLowerCase()
      : normalizePhone(dto.phone!);
    const lock = this.rateLimitService.checkLoginLock(`login-id:${identifier}`);
    if (lock.locked) {
      throw new HttpException(
        `Too many login failures, retry in ${Math.ceil(lock.retryAfterMs / 1000)}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.prisma.user.findFirst({
      where: dto.email ? { email: identifier } : { phone: identifier },
    });

    const userStatus = user?.status ?? UserStatus.ACTIVE;
    if (!user || userStatus === UserStatus.BANNED) {
      // Avoid leaking which side failed; record + throw same error
      this.recordLoginFailure(identifier, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (dto.password) {
      if (!(await this.verifyPassword(dto.password, user.passwordHash))) {
        this.recordLoginFailure(identifier, ipAddress);
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      const channel = dto.email ? OtpChannel.EMAIL : OtpChannel.SMS;
      try {
        await this.otpService.consume({
          channel,
          identifier,
          purpose: OtpPurpose.LOGIN,
          code: dto.otpCode!,
        });
      } catch (err) {
        this.recordLoginFailure(identifier, ipAddress);
        throw err;
      }
    }

    this.rateLimitService.recordLoginSuccess(identifier);

    const profile: AuthUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      role: user.role,
    };

    return {
      accessToken: this.issueAccessToken(profile, user.tokenVersion ?? 0),
      refreshToken: this.issueRefreshToken(user.id, user.tokenVersion ?? 0),
      user: profile,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    const payload = this.parseAndVerifyAccessToken(token);

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        role: true,
        status: true,
        tokenVersion: true,
      },
    });

    const userStatus = user?.status ?? UserStatus.ACTIVE;
    const tokenVersion = user?.tokenVersion ?? 0;
    if (!user || userStatus === UserStatus.BANNED || tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Token invalidated');
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      role: user.role,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.parseAndVerifyRefreshToken(refreshToken);
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true, tokenVersion: true },
    });

    if (!user || user.status === UserStatus.BANNED || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Refresh token invalidated');
    }

    return {
      accessToken: this.issueAccessToken(await this.getAuthUser(user.id), user.tokenVersion),
      refreshToken: this.issueRefreshToken(user.id, user.tokenVersion),
    };
  }

  parseAndVerifyRefreshTokenForLogout(token: string): { sub: string } {
    const payload = this.parseAndVerifyRefreshToken(token);
    return { sub: payload.sub };
  }

  async rotateTokenVersion(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, status: true },
    });

    if (!user || user.status === UserStatus.BANNED) {
      throw new UnauthorizedException('User not available');
    }

    if (!(await this.verifyPassword(currentPassword, user.passwordHash))) {
      throw new ForbiddenException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.hashPassword(newPassword),
        tokenVersion: { increment: 1 },
      },
    });
  }

  async banUser(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.BANNED,
        tokenVersion: { increment: 1 },
      },
    });
  }

  private recordLoginFailure(identifier: string, ip: string): void {
    this.rateLimitService.recordLoginFailure({
      identifier,
      ip,
      failureWindowMs: this.getNumber('RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS', 60_000),
      maxFailures: this.getNumber('RATE_LIMIT_LOGIN_MAX_FAILURES', 5),
      lockMs: this.getNumber('RATE_LIMIT_LOGIN_LOCK_MS', 5 * 60_000),
    });
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  private async verifyPassword(password: string, stored: string): Promise<boolean> {
    const [salt, savedHash] = stored.split(':');

    if (!salt || !savedHash) {
      return false;
    }

    const inputHash = (await scryptAsync(password, salt, 64)) as Buffer;
    const savedBuffer = Buffer.from(savedHash, 'hex');

    if (savedBuffer.length !== inputHash.length) {
      return false;
    }

    return timingSafeEqual(savedBuffer, inputHash);
  }

  private issueAccessToken(user: AuthUser, tokenVersion: number): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: AccessPayload = {
      type: 'access',
      sub: user.id,
      role: user.role,
      ver: tokenVersion,
      iat: nowSeconds,
      exp: nowSeconds + this.getNumber('JWT_ACCESS_TTL_SECONDS', 15 * 60),
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const signature = this.sign(unsigned);

    return `${unsigned}.${signature}`;
  }

  private issueRefreshToken(userId: string, tokenVersion: number): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: RefreshPayload = {
      type: 'refresh',
      sub: userId,
      ver: tokenVersion,
      exp: Math.floor(Date.now() / 1000) + this.getNumber('JWT_REFRESH_TTL_SECONDS', 7 * 24 * 60 * 60),
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const signature = this.sign(unsigned);

    return `${unsigned}.${signature}`;
  }

  private parseAndVerifyAccessToken(token: string): AccessPayload {
    const payload = this.parseAndVerifyToken(token) as Partial<AccessPayload>;
    if (
      payload.type !== 'access' ||
      !payload.sub ||
      !payload.role ||
      typeof payload.ver !== 'number' ||
      typeof payload.iat !== 'number' ||
      !payload.exp
    ) {
      throw new UnauthorizedException('Invalid token');
    }
    return payload as AccessPayload;
  }

  private parseAndVerifyRefreshToken(token: string): RefreshPayload {
    const payload = this.parseAndVerifyToken(token) as Partial<RefreshPayload>;
    if (
      payload.type !== 'refresh' ||
      !payload.sub ||
      typeof payload.ver !== 'number' ||
      !payload.exp
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return payload as RefreshPayload;
  }

  private parseAndVerifyToken(token: string): Record<string, unknown> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const [encodedHeader, encodedPayload, signature] = parts;
      const unsigned = `${encodedHeader}.${encodedPayload}`;
      const expectedSignature = this.sign(unsigned);

      if (!this.safeEqualText(signature, expectedSignature)) {
        throw new Error('Invalid token signature');
      }

      const payloadText = this.base64UrlDecode(encodedPayload);
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const exp = typeof payload.exp === 'number' ? payload.exp : NaN;
      const iat = typeof payload.iat === 'number' ? payload.iat : nowSeconds;
      if (!Number.isFinite(exp) || exp + 30 < nowSeconds) {
        throw new Error('Token expired');
      }
      if (!Number.isFinite(iat) || iat > nowSeconds + 30) {
        throw new Error('Token issued in the future');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private async getAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        role: true,
        status: true,
      },
    });
    if (!user || user.status === UserStatus.BANNED) {
      throw new UnauthorizedException('User not available');
    }
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      role: user.role,
    };
  }

  private sign(input: string): string {
    return this.base64UrlEncode(
      createHmac('sha256', this.getJwtSecret()).update(input).digest(),
    );
  }

  private safeEqualText(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);

    if (aBuffer.length !== bBuffer.length) {
      return false;
    }

    return timingSafeEqual(aBuffer, bBuffer);
  }

  private base64UrlEncode(input: string | Buffer): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private base64UrlDecode(input: string): string {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    return Buffer.from(base64 + padding, 'base64').toString('utf8');
  }

  private getJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new BadRequestException('JWT_SECRET is not configured');
    }

    return secret;
  }

  private getNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
