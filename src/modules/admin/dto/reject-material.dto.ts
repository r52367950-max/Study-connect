import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectMaterialDto {
  @ApiProperty({ example: 'Contains copyrighted content.' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
