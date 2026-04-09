import {
  HttpStatus,
  UnprocessableEntityException,
  Body,
  Controller,
  ParseFilePipeBuilder,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CreateMaterialDto } from './dto/create-material.dto';
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
