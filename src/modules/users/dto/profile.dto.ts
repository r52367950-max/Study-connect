import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileRole } from '@prisma/client';

export class SchoolSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  city!: string;
}

export class ProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty()
  username!: string;

  @ApiPropertyOptional({ enum: ProfileRole, nullable: true })
  profileRole!: ProfileRole | null;

  @ApiPropertyOptional({ nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: SchoolSummaryDto, nullable: true })
  school!: SchoolSummaryDto | null;

  @ApiPropertyOptional({ nullable: true })
  schoolNameFreeText!: string | null;

  @ApiPropertyOptional({ nullable: true })
  city!: string | null;

  @ApiProperty({ type: [String] })
  stages!: string[];

  @ApiProperty({ type: [String] })
  grades!: string[];

  @ApiProperty({ type: [String] })
  subjects!: string[];

  @ApiProperty({ type: [String] })
  viewedKinds!: string[];

  @ApiProperty()
  collaborativeOptIn!: boolean;

  @ApiPropertyOptional({ nullable: true })
  onboardedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  gradesUpdatedAt!: string | null;
}
