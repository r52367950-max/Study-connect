import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra';
import { LogViewEventDto } from './dto/log-view-event.dto';

@Injectable()
export class ViewEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(userId: string, dto: LogViewEventDto) {
    const material = await this.prisma.material.findFirst({
      where: { id: dto.materialId, status: 'APPROVED', visibility: 'PUBLIC' },
      select: { id: true, kind: true },
    });
    if (!material) return { logged: false };

    await this.prisma.viewEvent.create({
      data: {
        userId,
        materialId: material.id,
        kind: dto.kind ?? material.kind ?? null,
        dwellMs: dto.dwellMs ?? 0,
      },
    });
    return { logged: true };
  }
}
