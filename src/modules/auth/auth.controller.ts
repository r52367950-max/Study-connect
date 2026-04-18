import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request, Response } from 'express';
import { CsrfService } from '../../common/security/csrf.service';
import { RateLimit } from '../../common/rate-limit.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RolesGuard } from './guards/roles.guard';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
  ) {}

  @Public()
  @Get('csrf')
  @RateLimit({
    name: 'auth-csrf',
    limit: 90,
    windowMs: 60_000,
  })
  @ApiOperation({ summary: 'Issue CSRF token cookie for state-changing requests' })
  @ApiOkResponse({
    schema: {
      properties: {
        csrfToken: { type: 'string' },
      },
    },
  })
  csrf(@Res({ passthrough: true }) response: Response): { csrfToken: string } {
    return { csrfToken: this.csrfService.issueToken(response) };
  }

  @Public()
  @Post('register')
  @RateLimit({
    name: 'auth-register',
    limit: 12,
    windowMs: 60_000,
  })
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiOkResponse({ type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const authResult = await this.authService.register(dto);
    this.setAuthCookies(response, authResult.accessToken, authResult.refreshToken);
    return { user: authResult.user };
  }

  @Public()
  @Post('login')
  @RateLimit({
    name: 'auth-login-ip',
    limit: 25,
    windowMs: 60_000,
  })
  @ApiOperation({ summary: 'Login and set JWT access token in HttpOnly cookie' })
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const authResult = await this.authService.login(dto, req.ip);
    this.setAuthCookies(response, authResult.accessToken, authResult.refreshToken);
    return { user: authResult.user };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh short-lived access token' })
  @ApiOkResponse({
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    const refreshToken = this.extractCookieToken(req, 'refresh-token');
    const authResult = await this.authService.refreshAccessToken(refreshToken);
    this.setAuthCookies(response, authResult.accessToken, authResult.refreshToken);
    return { success: true };
  }

  @Public()
  @Post('logout')
  @RateLimit({
    name: 'auth-logout',
    limit: 40,
    windowMs: 60_000,
  })
  @ApiOperation({ summary: 'Clear JWT auth cookie' })
  @ApiOkResponse({
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    const token = this.extractCookieToken(req, 'auth-token');
    if (token) {
      const user = await this.authService.verifyAccessToken(token);
      await this.authService.rotateTokenVersion(user.id);
    }
    this.clearAuthCookies(response);
    return { success: true };
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change password and invalidate all active sessions' })
  @ApiOkResponse({
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  async changePassword(
    @Req() req: Request,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
    this.clearAuthCookies(response);
    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get current user profile from JWT' })
  @ApiOkResponse({ type: AuthUserDto })
  me(@Req() req: Request): AuthUserDto {
    const user = req.user;
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string): void {
    response.cookie('auth-token', accessToken, {
      httpOnly: true,
      secure: this.getCookieSecure(),
      sameSite: this.getCookieSameSite(),
      maxAge: this.getAccessTtlMilliseconds(),
      path: '/',
    });
    response.cookie('refresh-token', refreshToken, {
      httpOnly: true,
      secure: this.getCookieSecure(),
      sameSite: this.getCookieSameSite(),
      maxAge: this.getRefreshTtlMilliseconds(),
      path: '/',
    });
  }

  private clearAuthCookies(response: Response): void {
    const options = {
      httpOnly: true,
      secure: this.getCookieSecure(),
      sameSite: this.getCookieSameSite(),
      path: '/',
    } as const;
    response.clearCookie('auth-token', options);
    response.clearCookie('refresh-token', options);
  }

  private extractCookieToken(request: Request, key: 'auth-token' | 'refresh-token'): string {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return '';
    }
    const cookieEntries = cookieHeader.split(';');
    for (const entry of cookieEntries) {
      const [rawName, ...rawValue] = entry.trim().split('=');
      if (rawName === key && rawValue.length > 0) {
        return decodeURIComponent(rawValue.join('='));
      }
    }
    return '';
  }

  private getCookieSecure(): boolean {
    return process.env.AUTH_COOKIE_SECURE === 'true';
  }

  private getCookieSameSite(): 'lax' | 'strict' | 'none' {
    const sameSite = (process.env.AUTH_COOKIE_SAMESITE ?? 'lax').toLowerCase();
    if (sameSite === 'strict' || sameSite === 'none') {
      return sameSite;
    }
    return 'lax';
  }

  private getAccessTtlMilliseconds(): number {
    return this.getEnvPositiveInteger('JWT_ACCESS_TTL_SECONDS', 15 * 60) * 1000;
  }

  private getRefreshTtlMilliseconds(): number {
    return this.getEnvPositiveInteger('JWT_REFRESH_TTL_SECONDS', 7 * 24 * 60 * 60) * 1000;
  }

  private getEnvPositiveInteger(key: string, fallback: number): number {
    const raw = process.env[key];
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
