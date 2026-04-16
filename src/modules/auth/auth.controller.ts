import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request, Response } from 'express';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RolesGuard } from './guards/roles.guard';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiOkResponse({ type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const authResult = await this.authService.register(dto);
    this.setAuthCookie(response, authResult.accessToken);
    return { user: authResult.user };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login and set JWT access token in HttpOnly cookie' })
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const authResult = await this.authService.login(dto);
    this.setAuthCookie(response, authResult.accessToken);
    return { user: authResult.user };
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Clear JWT auth cookie' })
  @ApiOkResponse({
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  logout(@Res({ passthrough: true }) response: Response): { success: true } {
    response.clearCookie('auth-token', {
      httpOnly: true,
      secure: this.getCookieSecure(),
      sameSite: this.getCookieSameSite(),
      path: '/',
    });
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

  private setAuthCookie(response: Response, token: string): void {
    response.cookie('auth-token', token, {
      httpOnly: true,
      secure: this.getCookieSecure(),
      sameSite: this.getCookieSameSite(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
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
}
