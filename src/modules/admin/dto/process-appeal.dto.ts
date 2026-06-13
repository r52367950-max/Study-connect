import { ApiProperty } from '@nestjs/swagger';
import { MaterialAppealStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ProcessAppealDto {
  @ApiProperty({ enum: MaterialAppealStatus, example: MaterialAppealStatus.APPROVED })
  @IsEnum(MaterialAppealStatus)
  status!: MaterialAppealStatus;

  @ApiProperty({ example: '申诉通过，恢复上线。' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  restoreMaterial?: boolean;
}
