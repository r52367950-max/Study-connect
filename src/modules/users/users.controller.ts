import { Body, Controller, Delete, Get, HttpCode, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { ProfileResponseDto } from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';
import { UserDataExportService } from './user-data-export.service';
import { UserPrivacyService } from './user-privacy.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@Roles(UserRole.USER, UserRole.ADMIN)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userDataExportService: UserDataExportService,
    private readonly userPrivacyService: UserPrivacyService,
  ) {}

  @Get('me/profile')
  @ApiOperation({ summary: "Get the current user's onboarding profile" })
  @ApiOkResponse({ type: ProfileResponseDto })
  getMyProfile(@Req() req: Request): Promise<ProfileResponseDto> {
    return this.usersService.getProfile(req.user.id);
  }

  @Get('me/export')
  @RateLimit({ name: 'users-data-export', limit: 5, windowMs: 60 * 60_000 })
  @ApiOperation({ summary: "Export the current user's profile, content, ratings, favorites, downloads and view events" })
  exportMyData(@Req() req: Request) {
    return this.userDataExportService.buildExport(req.user.id);
  }

  @Delete('me')
  @HttpCode(200)
  @RateLimit({ name: 'users-account-anonymize', limit: 3, windowMs: 24 * 60 * 60_000 })
  @ApiOperation({ summary: 'Anonymize the current account and remove direct behavioral data' })
  anonymizeMyAccount(@Req() req: Request) {
    return this.userPrivacyService.anonymizeAccount(req.user.id);
  }

  @Put('me/profile')
  @RateLimit({ name: 'users-profile-update', limit: 30, windowMs: 60_000 })
  @ApiOperation({ summary: "Update the current user's onboarding profile" })
  @ApiOkResponse({ type: ProfileResponseDto })
  updateMyProfile(
    @Req() req: Request,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.usersService.updateProfile(req.user.id, dto);
  }
}
