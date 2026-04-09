import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaterialVisibility } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  @ApiPropertyOptional({ enum: MaterialVisibility, default: MaterialVisibility.PUBLIC })
  @IsOptional()
  @IsEnum(MaterialVisibility)
  visibility?: MaterialVisibility;
}
