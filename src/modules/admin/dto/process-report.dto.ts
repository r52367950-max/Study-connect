import { ApiProperty } from '@nestjs/swagger';
import { MaterialReportStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ProcessReportDto {
  @ApiProperty({ enum: MaterialReportStatus, example: MaterialReportStatus.RESOLVED })
  @IsEnum(MaterialReportStatus)
  status!: MaterialReportStatus;

  @ApiProperty({ example: '举报属实，已下线资料。' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  offlineMaterial?: boolean;

  @IsOptional()
  restoreMaterial?: boolean;
}
