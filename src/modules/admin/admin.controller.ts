import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { PendingMaterialsQueryDto } from './dto/pending-materials-query.dto';
import { RejectMaterialDto } from './dto/reject-material.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('materials/pending')
  @ApiOperation({ summary: 'List pending materials with pagination' })
  getPending(@Query() query: PendingMaterialsQueryDto) {
    return this.adminService.getPendingMaterials(query.page ?? 1, query.pageSize ?? 10);
  }

  @Post('materials/:id/approve')
  @ApiOperation({ summary: 'Approve one material' })
  @ApiOkResponse({
    schema: {
      example: {
        id: 'uuid',
        status: 'APPROVED',
        reviewComment: 'Approved by <admin-id>',
      },
    },
  })
  approve(@Param('id') id: string, @Req() req: Request) {
    return this.adminService.approveMaterial(id, req.user.id);
  }

  @Post('materials/:id/reject')
  @ApiOperation({ summary: 'Reject one material with reason' })
  reject(@Param('id') id: string, @Body() dto: RejectMaterialDto, @Req() req: Request) {
    return this.adminService.rejectMaterial(id, dto.reason, req.user.id);
  }
}
