import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { OfflineMaterialDto } from './dto/offline-material.dto';
import { PendingMaterialsQueryDto } from './dto/pending-materials-query.dto';
import { ProcessAppealDto } from './dto/process-appeal.dto';
import { ProcessReportDto } from './dto/process-report.dto';
import { ProcessVersionDto } from './dto/process-version.dto';
import { RejectMaterialDto } from './dto/reject-material.dto';
import { AdminService } from './admin.service';

// Admin operations on a missing material/user surface as 404 to match
// docs/error-code-spec.md (Admin Review section).
const adminIdParam = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@RateLimit({
  name: 'admin-strict',
  limit: 30,
  windowMs: 60_000,
})
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
  approve(@Param('id', adminIdParam) id: string, @Req() req: Request) {
    return this.adminService.approveMaterial(id, req.user.id);
  }


  @Post('materials/:id/offline')
  @ApiOperation({ summary: 'Offline one material' })
  offline(@Param('id', adminIdParam) id: string, @Body() dto: OfflineMaterialDto, @Req() req: Request) {
    return this.adminService.offlineMaterial(id, req.user.id, dto.reviewComment);
  }

  @Post('materials/:id/restore')
  @ApiOperation({ summary: 'Restore one material to approved' })
  restore(@Param('id', adminIdParam) id: string, @Body() dto: OfflineMaterialDto, @Req() req: Request) {
    return this.adminService.restoreMaterial(id, req.user.id, dto.reviewComment || 'Restored by admin');
  }

  @Get('materials/:id/moderation')
  @ApiOperation({ summary: 'Get reports, appeals, versions, and audit logs for one material' })
  moderationHistory(@Param('id', adminIdParam) id: string) {
    return this.adminService.getMaterialModerationHistory(id);
  }

  @Get('reports')
  @ApiOperation({ summary: 'List material reports with processing status' })
  getReports(@Query() query: PendingMaterialsQueryDto) {
    return this.adminService.getReports(query.page ?? 1, query.pageSize ?? 10);
  }

  @Post('reports/:id/process')
  @ApiOperation({ summary: 'Process one material report and optionally offline/restore material' })
  processReport(@Param('id', adminIdParam) id: string, @Body() dto: ProcessReportDto, @Req() req: Request) {
    return this.adminService.processReport(id, req.user.id, dto);
  }

  @Post('appeals/:id/process')
  @ApiOperation({ summary: 'Process one material appeal' })
  processAppeal(@Param('id', adminIdParam) id: string, @Body() dto: ProcessAppealDto, @Req() req: Request) {
    return this.adminService.processAppeal(id, req.user.id, dto);
  }

  @Post('versions/:id/process')
  @ApiOperation({ summary: 'Process one material version' })
  processVersion(@Param('id', adminIdParam) id: string, @Body() dto: ProcessVersionDto, @Req() req: Request) {
    return this.adminService.processVersion(id, req.user.id, dto);
  }

  @Post('materials/:id/reject')
  @ApiOperation({ summary: 'Reject one material with reason' })
  reject(@Param('id', adminIdParam) id: string, @Body() dto: RejectMaterialDto, @Req() req: Request) {
    return this.adminService.rejectMaterial(id, dto.reason, req.user.id);
  }

  @Post('users/:id/ban')
  @ApiOperation({ summary: 'Ban one user and invalidate active tokens immediately' })
  banUser(@Param('id', adminIdParam) id: string) {
    return this.adminService.banUser(id);
  }
}
