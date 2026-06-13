import { Module } from "@nestjs/common";
import { DownloadsModule } from "../downloads/downloads.module";
import { FileScanService } from "./file-scan.service";
import { MaterialsController } from "./materials.controller";
import { MaterialsService } from "./materials.service";
import { RecommendationsService } from "./recommendations.service";

@Module({
  imports: [DownloadsModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, FileScanService, RecommendationsService],
  exports: [RecommendationsService],
})
export class MaterialsModule {}
