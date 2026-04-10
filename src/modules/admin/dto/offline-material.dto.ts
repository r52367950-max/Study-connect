import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class OfflineMaterialDto {
  @ApiPropertyOptional({
    description: 'Optional offline reason/comment',
    maxLength: 500,
    example: 'Taken down due to outdated content',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewComment?: string;
}
