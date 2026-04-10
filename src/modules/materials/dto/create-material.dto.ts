import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaterialVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, Max, MinLength } from 'class-validator';

export class CreateMaterialDto {
  @ApiProperty({ example: 'Linear Algebra Notes' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ example: 'Week 1-4 summary.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'HighSchool' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  stage?: string;

  @ApiPropertyOptional({ example: 'Grade 10' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string;

  @ApiPropertyOptional({ example: 'Math' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subject?: string;

  @ApiPropertyOptional({ example: 2024 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ example: 'CN-ZJ' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  region?: string;

  @ApiPropertyOptional({ enum: MaterialVisibility, default: MaterialVisibility.PUBLIC })
  @IsOptional()
  @IsEnum(MaterialVisibility)
  visibility?: MaterialVisibility;
}
