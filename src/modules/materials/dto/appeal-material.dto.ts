import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AppealMaterialDto {
  @ApiProperty({ example: '资料已修正，请重新审核。' })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ example: '补充说明或证明链接' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidence?: string;
}
