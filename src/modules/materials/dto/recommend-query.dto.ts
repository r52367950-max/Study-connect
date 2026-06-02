import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** B11: restrict ranker to known values; ranker_v2 is a placeholder (same algorithm as v1) */
export const VALID_RANKERS = ['ranker_v1', 'ranker_v2'] as const;
export type ValidRanker = (typeof VALID_RANKERS)[number];

export class RecommendQueryDto {
  @ApiPropertyOptional({ example: 6, default: 6 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;

  @ApiPropertyOptional({ example: 'ranker_v1', enum: VALID_RANKERS, description: 'ranker_v2 is a placeholder (same algorithm as v1)' })
  @IsOptional()
  @IsIn(VALID_RANKERS)
  ranker?: ValidRanker;
}
