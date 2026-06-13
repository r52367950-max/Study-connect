import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
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
import { RateLimit } from '../../common/rate-limit.decorator';
import { PrismaService } from '../../infra';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { MaterialRatingsQueryDto } from './dto/material-ratings-query.dto';
import { MaterialSearchQueryDto } from './dto/material-search-query.dto';
import { RecommendQueryDto } from './dto/recommend-query.dto';
import { UploadFileInput } from './file-upload.type';
import { MaterialsService, UploadedMaterial } from './materials.service';
import { RecommendationsService } from './recommendations.service';
import {
  ALLOWED_MIME_TYPES,
  assertUploadFileSecurity,
  assertUploadFileSize,
  getMaxUploadSizeMb,
  MAX_UPLOAD_SIZE_MB_KEY,
} from './upload-security.util';

// Unknown ids on this controller should look like the material doesn't exist,
// not like a bad request — see docs/error-code-spec.md (Materials section).
const materialIdParam = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('materials')
@ApiBearerAuth()
@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly recommendationsService: RecommendationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Public material search (APPROVED + PUBLIC only)' })
  list(@Query() query: MaterialSearchQueryDto) {
    return this.materialsService.searchApproved(query);
  }

  @Get('recommend')
  @RateLimit({ name: 'materials-recommend', limit: 60, windowMs: 60_000 })
  @ApiOperation({ summary: 'Personalized recommendation list based on profile + history' })
  async recommend(@Req() req: Request, @Query() query: RecommendQueryDto) {
    const profile = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        subjects: true,
        grades: true,
        stages: true,
        city: true,
        viewedKinds: true,
        schoolId: true,
        collaborativeOptIn: true,
        onboardedAt: true,
      },
    });
    if (!profile) {
      return { items: [], phase: null };
    }
    const items = await this.recommendationsService.recommend(
      {
        id: profile.id,
        subjects: profile.subjects,
        grades: profile.grades,
        stages: profile.stages,
        city: profile.city,
        viewedKinds: profile.viewedKinds,
        schoolId: profile.schoolId,
        collaborativeOptIn: profile.collaborativeOptIn,
        onboardedAt: profile.onboardedAt,
      },
      { limit: query.limit, ranker: query.ranker, includeDebugSignals: req.user.role === UserRole.ADMIN || query.debug === true },
    );
    return { items, phase: items[0]?.phase ?? null };
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Public material detail (APPROVED + PUBLIC only)' })
  @ApiParam({ name: 'id', type: String })
  detail(@Param('id', materialIdParam) id: string) {
    return this.materialsService.getApprovedDetail(id);
  }

  @Get(':id/ratings')
  @Public()
  @ApiOperation({ summary: 'Public ratings list for one approved material' })
  @ApiParam({ name: 'id', type: String })
  listRatings(@Param('id', materialIdParam) id: string, @Query() query: MaterialRatingsQueryDto) {
    return this.materialsService.listApprovedMaterialRatings(id, query);
  }

  @Post(':id/ratings')
  @RateLimit({
    name: 'materials-rating-write',
    limit: 20,
    windowMs: 60_000,
  })
  @ApiOperation({ summary: 'Create or update one rating for one approved material (login required)' })
  @ApiParam({ name: 'id', type: String })
  rateMaterial(@Param('id', materialIdParam) id: string, @Req() req: Request, @Body() dto: CreateRatingDto) {
    return this.materialsService.upsertMaterialRating({ materialId: id, userId: req.user.id, dto });
  }

  @Get(':id/download')
  @RateLimit({
    name: 'materials-download',
    limit: 90,
    windowMs: 60_000,
  })
  @ApiOperation({ summary: 'Download one approved public material (login required; APPROVED + PUBLIC)' })
  @ApiParam({ name: 'id', type: String })
  download(@Param('id', materialIdParam) id: string, @Req() req: Request) {
    return this.materialsService.downloadApprovedMaterial(id, req.user.id);
  }

  @Post()
  @RateLimit({
    name: 'materials-upload',
    limit: 10,
    windowMs: 60_000,
  })
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
      limits: {
        fileSize: getMaxUploadSizeMb(process.env[MAX_UPLOAD_SIZE_MB_KEY]) * 1024 * 1024,
      },
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
    const maxUploadSizeMb = getMaxUploadSizeMb(process.env[MAX_UPLOAD_SIZE_MB_KEY]);

    try {
      assertUploadFileSize(file, maxUploadSizeMb);
      assertUploadFileSecurity(file);

      return this.materialsService.createWithFile({
        uploaderId: req.user.id,
        dto,
        file,
      });
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new UnprocessableEntityException('File exceeds size limit');
      }
      throw error;
    }
  }
}

export { assertUploadFileSize, getMaxUploadSizeMb, MAX_UPLOAD_SIZE_MB_KEY };
