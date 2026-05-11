import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RateLimit } from '../../common/rate-limit.decorator';
import { ProfileResponseDto } from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/profile')
  @ApiOperation({ summary: "Get the current user's onboarding profile" })
  @ApiOkResponse({ type: ProfileResponseDto })
  getMyProfile(@Req() req: Request): Promise<ProfileResponseDto> {
    return this.usersService.getProfile(req.user.id);
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
