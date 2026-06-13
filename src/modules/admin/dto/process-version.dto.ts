import { ApiProperty } from '@nestjs/swagger';
import { MaterialVersionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ProcessVersionDto {
  @ApiProperty({ enum: MaterialVersionStatus, example: MaterialVersionStatus.APPROVED })
  @IsEnum(MaterialVersionStatus)
  status!: MaterialVersionStatus;

  @ApiProperty({ example: '新版本合规。' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  restoreMaterial?: boolean;
}
