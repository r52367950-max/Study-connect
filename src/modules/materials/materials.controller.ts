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
  @ApiOperation({ summary: 'Public material search (APPROVED only)' })
  list(@Query() query: MaterialSearchQueryDto) {
    return this.materialsService.searchApproved(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Public material detail (APPROVED only)' })
  @ApiParam({ name: 'id', type: String })
  detail(@Param('id') id: string) {
    return this.materialsService.getApprovedDetail(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download one approved material (login required)' })
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
      limits: {
        fileSize: 1024 * 1024 * 200,
      },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          callback(new UnprocessableEntityException('Unsupported file type'), false);
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
    const maxSizeMb = Number(this.configService.get<string>('MAX_UPLOAD_SIZE_MB') ?? '50');
    const maxBytes = maxSizeMb * 1024 * 1024;

    if (file.size > maxBytes) {
      throw new UnprocessableEntityException(`File exceeds MAX_UPLOAD_SIZE_MB=${maxSizeMb}`);
    }

    return this.materialsService.createWithFile({
      uploaderId: req.user.id,
      dto,
      file,
    });
  }
}
