import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMaterialVersionDto {
  @ApiProperty({ example: 'uploads/new-file.pdf' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  fileKey!: string;

  @ApiPropertyOptional({ example: '删除了被举报内容并补充来源。' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changelog?: string;
}
