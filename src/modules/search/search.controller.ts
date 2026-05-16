import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('suggestions')
  @Public()
  @RateLimit({ name: 'search-suggest', limit: 60, windowMs: 60_000 })
  @ApiOperation({ summary: 'Search suggestions backed by pg_trgm similarity' })
  suggest(@Query('q') q = '', @Query('limit') limit = '10') {
    return this.searchService.suggest(q, Number(limit));
  }
}
