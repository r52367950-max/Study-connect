import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileRole } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const STAGES = ['高中', '初中', '初中（五四制）'] as const;
export const GRADES = [
  '高一', '高二', '高三',
  '初一', '初二', '初三',
  '六年级', '七年级', '八年级', '九年级',
] as const;
export const SUBJECTS = [
  '语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治',
] as const;
export const VIEWED_KINDS = ['习题', '讲义', '真题', '模拟'] as const;

export class UpdateProfileDto {
  @ApiPropertyOptional({ enum: ProfileRole })
  @IsOptional()
  @IsEnum(ProfileRole)
  profileRole?: ProfileRole;

  @ApiPropertyOptional({ example: '林老师', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayName?: string;

  @ApiPropertyOptional({ example: 'a7f3b5e8-...' })
  @IsOptional()
  @IsUUID()
  schoolId?: string | null;

  @ApiPropertyOptional({ example: '北京市第十一中学', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  schoolNameFreeText?: string | null;

  @ApiPropertyOptional({ example: '北京', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  city?: string;

  @ApiPropertyOptional({ example: ['高中'], isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  stages?: string[];

  @ApiPropertyOptional({ example: ['高一'], isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  grades?: string[];

  @ApiPropertyOptional({ example: ['数学'], isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  subjects?: string[];

  @ApiPropertyOptional({ example: ['习题', '真题'], isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  viewedKinds?: string[];

  @ApiPropertyOptional({
    description: 'Participate in same-school collaborative recommendations',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  collaborativeOptIn?: boolean;
}
