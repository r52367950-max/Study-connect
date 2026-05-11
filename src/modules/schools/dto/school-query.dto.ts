import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SchoolQueryDto {
  @ApiPropertyOptional({ example: '北京' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  city?: string;

  @ApiPropertyOptional({ example: '十一', description: 'Match name (substring) or pinyin prefix' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  q?: string;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
