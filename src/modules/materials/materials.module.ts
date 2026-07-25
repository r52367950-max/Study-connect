import { Module } from "@nestjs/common";
import { DownloadsModule } from "../downloads/downloads.module";
import {
  createFileScannerFromEnv,
  FILE_SCANNER,
  FileScanService,
} from "./file-scan.service";
import { MaterialsController } from "./materials.controller";
import { MaterialsService } from "./materials.service";
import { RecommendationsService } from "./recommendations.service";

@Module({
  imports: [DownloadsModule],
  controllers: [MaterialsController],
  providers: [
    MaterialsService,
    FileScanService,
    RecommendationsService,
    // Selects the scanner backend (ClamAV / commercial AV / CDR / local policy)
    // from env. Bound to an explicit token because FileScanner is an interface.
    { provide: FILE_SCANNER, useFactory: createFileScannerFromEnv },
  ],
  exports: [RecommendationsService],
})
export class MaterialsModule {}
