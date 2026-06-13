import { Module } from "@nestjs/common";
import { FileScanService } from "./file-scan.service";
import { MaterialsController } from "./materials.controller";
import { MaterialsService } from "./materials.service";
import { RecommendationsService } from "./recommendations.service";
import { MATERIAL_SEARCH_ENGINE } from "./search/material-search-engine";
import { PostgresMaterialSearchEngine } from "./search/postgres-material-search.engine";

@Module({
  controllers: [MaterialsController],
  providers: [
    MaterialsService,
    FileScanService,
    RecommendationsService,
    PostgresMaterialSearchEngine,
    {
      provide: MATERIAL_SEARCH_ENGINE,
      useExisting: PostgresMaterialSearchEngine,
    },
  ],
  exports: [RecommendationsService],
})
export class MaterialsModule {}
