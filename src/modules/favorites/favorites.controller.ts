import { Controller, Delete, Get, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { FavoritesQueryDto } from './dto/favorites-query.dto';
import { FavoritesService } from './favorites.service';

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
@Roles(UserRole.USER, UserRole.ADMIN)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's favorites" })
  list(@Req() req: Request, @Query() query: FavoritesQueryDto) {
    return this.favoritesService.list(req.user.id, query);
  }

  @Get('ids')
  @ApiOperation({ summary: "All favorited material ids (star state / sidebar count)" })
  listIds(@Req() req: Request) {
    return this.favoritesService.listIds(req.user.id);
  }

  @Post(':materialId')
  @RateLimit({ name: 'favorites-add', limit: 60, windowMs: 60_000 })
  @ApiOperation({ summary: 'Favorite one material' })
  add(
    @Req() req: Request,
    // B9: invalid UUIDs return 404 (hidden resource semantics, not 400 validation error)
    @Param('materialId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) materialId: string,
  ) {
    return this.favoritesService.add(req.user.id, materialId);
  }

  @Delete(':materialId')
  @RateLimit({ name: 'favorites-remove', limit: 60, windowMs: 60_000 })
  @ApiOperation({ summary: 'Remove one favorite' })
  remove(
    @Req() req: Request,
    // B9: invalid UUIDs return 404 (hidden resource semantics, not 400 validation error)
    @Param('materialId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) materialId: string,
  ) {
    return this.favoritesService.remove(req.user.id, materialId);
  }
}
