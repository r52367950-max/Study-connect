import { Module } from '@nestjs/common';
import { FileScanService } from './file-scan.service';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { RecommendationsService } from './recommendations.service';

@Module({
  controllers: [MaterialsController],
  providers: [MaterialsService, FileScanService, RecommendationsService],
  exports: [RecommendationsService],
})
export class MaterialsModule {}
