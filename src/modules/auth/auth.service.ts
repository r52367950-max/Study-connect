import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, UserRole, UserStatus } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto';
import { PrismaService } from '../../infra';
import { RateLimitService } from '../../common/rate-limit.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export type AuthUser = Pick<User, 'id' | 'email' | 'username' | 'role'>;

type AccessPayload = {
  type: 'access';
  sub: string;
  email: string;
  username: string;
  role: UserRole;
  ver: number;
  exp: number;
};

type RefreshPayload = {
  type: 'refresh';
  sub: string;
  ver: number;
  exp: number;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });

    if (existing) {
      throw new BadRequestException('Email or username already exists');
    }

    const passwordHash = this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        role: UserRole.USER,
      },
      select: {
        id: true,
        email: true,
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
    const email = dto.email.toLowerCase();
    const lock = this.rateLimitService.checkLoginLock(`login-email:${email}`);
    if (lock.locked) {
      throw new HttpException(
        `Too many login failures, retry in ${Math.ceil(lock.retryAfterMs / 1000)}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const userStatus = user && 'status' in user ? user.status : UserStatus.ACTIVE;
    if (!user || userStatus === UserStatus.BANNED || !this.verifyPassword(dto.password, user.passwordHash)) {
      this.rateLimitService.recordLoginFailure({
        email,
        ip: ipAddress,
        failureWindowMs: this.getNumber('RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS', 60_000),
        maxFailures: this.getNumber('RATE_LIMIT_LOGIN_MAX_FAILURES', 5),
        lockMs: this.getNumber('RATE_LIMIT_LOGIN_LOCK_MS', 5 * 60_000),
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    this.rateLimitService.recordLoginSuccess(email, ipAddress);

    const profile: AuthUser = {
      id: user.id,
      email: user.email,
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
      where: { email: payload.email },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        tokenVersion: true,
      },
    });

    const userStatus = user && 'status' in user ? user.status : UserStatus.ACTIVE;
    const tokenVersion = user?.tokenVersion ?? 0;
    if (!user || user.id !== payload.sub || userStatus === UserStatus.BANNED || tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Token invalidated');
    }

    return {
      id: user.id,
      email: user.email,
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

  async rotateTokenVersion(userId: string): Promise<void> {
    if (typeof (this.prisma.user as { update?: unknown }).update !== 'function') {
      return;
    }
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

    if (!this.verifyPassword(currentPassword, user.passwordHash)) {
      throw new ForbiddenException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: this.hashPassword(newPassword),
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

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, savedHash] = stored.split(':');

    if (!salt || !savedHash) {
      return false;
    }

    const inputHash = scryptSync(password, salt, 64);
    const savedBuffer = Buffer.from(savedHash, 'hex');

    if (savedBuffer.length !== inputHash.length) {
      return false;
    }

    return timingSafeEqual(savedBuffer, inputHash);
  }

  private issueAccessToken(user: AuthUser, tokenVersion: number): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: AccessPayload = {
      type: 'access',
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      ver: tokenVersion,
      exp: Math.floor(Date.now() / 1000) + this.getNumber('JWT_ACCESS_TTL_SECONDS', 15 * 60),
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
      !payload.email ||
      !payload.username ||
      !payload.role ||
      typeof payload.ver !== 'number' ||
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
      return JSON.parse(payloadText) as Record<string, unknown>;
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
