import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { MaterialRatingsQueryDto } from './dto/material-ratings-query.dto';
import { MaterialSearchQueryDto } from './dto/material-search-query.dto';
import { UploadFileInput } from './file-upload.type';
import { MaterialsService, UploadedMaterial } from './materials.service';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'text/plain',
];

const MAX_UPLOAD_SIZE_MB_KEY = 'MAX_UPLOAD_SIZE_MB';
const DEFAULT_MAX_UPLOAD_SIZE_MB = 50;

function getMaxUploadSizeMb(configService: ConfigService): number {
  const maxUploadSizeMb = Number(
    configService.get<string>(MAX_UPLOAD_SIZE_MB_KEY) ?? String(DEFAULT_MAX_UPLOAD_SIZE_MB),
  );

  return Number.isFinite(maxUploadSizeMb) && maxUploadSizeMb > 0
    ? maxUploadSizeMb
    : DEFAULT_MAX_UPLOAD_SIZE_MB;
}

function assertUploadFileSize(file: UploadFileInput, maxSizeMb: number): void {
  const maxBytes = maxSizeMb * 1024 * 1024;

  if (file.size > maxBytes) {
    throw new UnprocessableEntityException(`UPLOAD_FILE_TOO_LARGE: max ${maxSizeMb}MB`);
  }
}

@ApiTags('materials')
@ApiBearerAuth()
@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Public material search (APPROVED + PUBLIC only)' })
  list(@Query() query: MaterialSearchQueryDto) {
    return this.materialsService.searchApproved(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Public material detail (APPROVED + PUBLIC only)' })
  @ApiParam({ name: 'id', type: String })
  detail(@Param('id') id: string) {
    return this.materialsService.getApprovedDetail(id);
  }

  @Get(':id/ratings')
  @Public()
  @ApiOperation({ summary: 'Public ratings list for one approved material' })
  @ApiParam({ name: 'id', type: String })
  listRatings(@Param('id') id: string, @Query() query: MaterialRatingsQueryDto) {
    return this.materialsService.listApprovedMaterialRatings(id, query);
  }

  @Post(':id/ratings')
  @ApiOperation({ summary: 'Create or update one rating for one approved material (login required)' })
  @ApiParam({ name: 'id', type: String })
  rateMaterial(@Param('id') id: string, @Req() req: Request, @Body() dto: CreateRatingDto) {
    return this.materialsService.upsertMaterialRating({ materialId: id, userId: req.user.id, dto });
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download one approved public material (login required; APPROVED + PUBLIC)' })
  @ApiParam({ name: 'id', type: String })
  download(@Param('id') id: string, @Req() req: Request) {
    return this.materialsService.downloadApprovedMaterial(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Upload material file to MinIO and create pending material record' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'file'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        stage: { type: 'string' },
        grade: { type: 'string' },
        subject: { type: 'string' },
        year: { type: 'number' },
        region: { type: 'string' },
        visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          callback(new UnprocessableEntityException('UNSUPPORTED_FILE_TYPE'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async upload(
    @Req() req: Request,
    @Body() dto: CreateMaterialDto,
    @UploadedFile(
      new ParseFilePipeBuilder().build({
        fileIsRequired: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    file: UploadFileInput,
  ): Promise<UploadedMaterial> {
    assertUploadFileSize(file, getMaxUploadSizeMb(this.configService));

    return this.materialsService.createWithFile({
      uploaderId: req.user.id,
      dto,
      file,
    });
  }
}

export { assertUploadFileSize, getMaxUploadSizeMb, MAX_UPLOAD_SIZE_MB_KEY };
