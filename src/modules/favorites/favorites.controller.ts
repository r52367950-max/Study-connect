import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RateLimit } from '../../common/rate-limit.decorator';
import { FavoritesQueryDto } from './dto/favorites-query.dto';
import { FavoritesService } from './favorites.service';

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
@UseGuards(RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's favorites" })
  list(@Req() req: Request, @Query() query: FavoritesQueryDto) {
    return this.favoritesService.list(req.user.id, query);
  }

  @Post(':materialId')
  @RateLimit({ name: 'favorites-add', limit: 60, windowMs: 60_000 })
  @ApiOperation({ summary: 'Favorite one material' })
  add(@Req() req: Request, @Param('materialId', new ParseUUIDPipe()) materialId: string) {
    return this.favoritesService.add(req.user.id, materialId);
  }

  @Delete(':materialId')
  @RateLimit({ name: 'favorites-remove', limit: 60, windowMs: 60_000 })
  @ApiOperation({ summary: 'Remove one favorite' })
  remove(@Req() req: Request, @Param('materialId', new ParseUUIDPipe()) materialId: string) {
    return this.favoritesService.remove(req.user.id, materialId);
  }
}
