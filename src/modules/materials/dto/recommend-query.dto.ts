import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class RecommendQueryDto {
  @ApiPropertyOptional({ example: 6, default: 6 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;

  @ApiPropertyOptional({ example: 'ranker_v1' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,32}$/)
  ranker?: string;
}
