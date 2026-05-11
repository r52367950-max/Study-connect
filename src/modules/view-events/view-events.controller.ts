import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RateLimit } from '../../common/rate-limit.decorator';
import { LogViewEventDto } from './dto/log-view-event.dto';
import { ViewEventsService } from './view-events.service';

@ApiTags('view-events')
@ApiBearerAuth()
@Controller('view-events')
@UseGuards(RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
export class ViewEventsController {
  constructor(private readonly viewEventsService: ViewEventsService) {}

  @Post()
  @RateLimit({ name: 'view-events-log', limit: 120, windowMs: 60_000 })
  @ApiOperation({ summary: 'Record one impression / dwell signal for recommendations' })
  log(@Req() req: Request, @Body() dto: LogViewEventDto) {
    return this.viewEventsService.log(req.user.id, dto);
  }
}
