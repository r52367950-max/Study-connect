import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra';
import { LogViewEventDto } from './dto/log-view-event.dto';

// B6: debounce window — skip duplicate (userId, materialId) view events within this period
const VIEW_EVENT_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class ViewEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(userId: string, dto: LogViewEventDto) {
    const material = await this.prisma.material.findFirst({
      where: { id: dto.materialId, status: 'APPROVED', visibility: 'PUBLIC' },
      select: { id: true, kind: true },
    });
    if (!material) return { logged: false };

    // B12: always use material.kind, never trust client-supplied dto.kind
    const kind = material.kind ?? null;

    // B6: service-layer debounce — skip if a recent event for (userId, materialId) already exists
    const debounceWindowStart = new Date(Date.now() - VIEW_EVENT_DEBOUNCE_MS);
    const recentEvent = await this.prisma.viewEvent.findFirst({
      where: {
        userId,
        materialId: material.id,
        createdAt: { gte: debounceWindowStart },
      },
      select: { id: true, dwellMs: true },
    });

    if (recentEvent) {
      // Update dwellMs on the existing event instead of creating a duplicate
      if (dto.dwellMs && dto.dwellMs > (recentEvent.dwellMs ?? 0)) {
        await this.prisma.viewEvent.update({
          where: { id: recentEvent.id },
          data: { dwellMs: dto.dwellMs },
        });
      }
      return { logged: false };
    }

    await this.prisma.viewEvent.create({
      data: {
        userId,
        materialId: material.id,
        kind,
        dwellMs: dto.dwellMs ?? 0,
      },
    });
    return { logged: true };
  }
}
