import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MaterialKind } from '@prisma/client';

export class LogViewEventDto {
  @ApiProperty({ example: 'a7f3b5e8-...' })
  @IsUUID()
  materialId!: string;

  @ApiPropertyOptional({ enum: MaterialKind })
  @IsOptional()
  @IsEnum(MaterialKind)
  kind?: MaterialKind;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 0 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(60 * 60 * 1000)
  dwellMs?: number;
}
