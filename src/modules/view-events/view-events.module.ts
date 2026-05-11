import { Module } from '@nestjs/common';
import { ViewEventsController } from './view-events.controller';
import { ViewEventsService } from './view-events.service';

@Module({
  controllers: [ViewEventsController],
  providers: [ViewEventsService],
})
export class ViewEventsModule {}
