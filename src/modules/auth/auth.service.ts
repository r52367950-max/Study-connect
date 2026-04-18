import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto';
import { PrismaService } from '../../infra';
import { RateLimitService } from '../../common/rate-limit.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export type AuthUser = Pick<User, 'id' | 'email' | 'username' | 'role'>;

type AccessPayload = {
  sub: string;
  email: string;
  username: string;
  role: UserRole;
  exp: number;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string; user: AuthUser }> {
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
      accessToken: this.issueAccessToken(user),
      user,
    };
  }

  async login(dto: LoginDto, ipAddress = 'unknown'): Promise<{ accessToken: string; user: AuthUser }> {
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

    if (!user || !this.verifyPassword(dto.password, user.passwordHash)) {
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
      accessToken: this.issueAccessToken(profile),
      user: profile,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    const payload = this.parseAndVerifyToken(token);

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
    };
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

  private issueAccessToken(user: AuthUser): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: AccessPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const signature = this.sign(unsigned);

    return `${unsigned}.${signature}`;
  }

  private parseAndVerifyToken(token: string): AccessPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const unsigned = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = this.sign(unsigned);

    if (!this.safeEqualText(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid token signature');
    }

    const payloadText = this.base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadText) as Partial<AccessPayload>;

    if (!payload.sub || !payload.email || !payload.username || !payload.role || !payload.exp) {
      throw new UnauthorizedException('Malformed token payload');
    }

    return payload as AccessPayload;
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
