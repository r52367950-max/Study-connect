import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReportMaterialDto {
  @ApiProperty({ example: '侵权或不当内容' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  reason!: string;

  @ApiPropertyOptional({ example: '请说明举报详情。' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/evidence' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidence?: string;
}
