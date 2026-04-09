import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService, PendingMaterialsResult } from './admin.service';
import { ListPendingMaterialsDto } from './dto/list-pending-materials.dto';
import { RejectMaterialDto } from './dto/reject-material.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('materials/pending')
  @ApiOperation({ summary: 'List pending materials with pagination' })
  listPending(@Query() query: ListPendingMaterialsDto): Promise<PendingMaterialsResult> {
    return this.adminService.listPending(query.page, query.limit);
  }

  @Post('materials/:id/approve')
  @ApiOperation({ summary: 'Approve a material' })
  approve(@Param('id') id: string) {
    return this.adminService.approveMaterial(id);
  }

  @Post('materials/:id/reject')
  @ApiOperation({ summary: 'Reject a material with reason' })
  reject(@Param('id') id: string, @Body() dto: RejectMaterialDto) {
    return this.adminService.rejectMaterial(id, dto.reason);
  }
}
