import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  @Get('ping')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin-only check endpoint' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  ping(): { ok: boolean } {
    return { ok: true };
  }
}
