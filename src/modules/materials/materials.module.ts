import { Module } from '@nestjs/common';
import { FileScanService } from './file-scan.service';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  controllers: [MaterialsController],
  providers: [MaterialsService, FileScanService],
})
export class MaterialsModule {}
