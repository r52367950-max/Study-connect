import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { SchoolQueryDto } from './dto/school-query.dto';
import { SchoolsService } from './schools.service';

@ApiTags('schools')
@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Public()
  @Get()
  @RateLimit({ name: 'schools-search', limit: 60, windowMs: 60_000 })
  @ApiOperation({ summary: 'Autocomplete-friendly school search (by city, name, or pinyin)' })
  list(@Query() query: SchoolQueryDto) {
    return this.schoolsService.search(query);
  }
}
