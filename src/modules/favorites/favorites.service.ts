import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialStatus, MaterialVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { FavoritesQueryDto } from './dto/favorites-query.dto';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All favorited material ids for the current user, newest first. Backs the
   * star-toggle state and the sidebar count — the paginated list() alone caps
   * at one page, which made stars beyond it render unfavorited (and 409 on
   * click). Bounded to keep the payload sane for pathological accounts.
   */
  async listIds(userId: string) {
    const [rows, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        select: { materialId: true },
      }),
      this.prisma.favorite.count({ where: { userId } }),
    ]);
    return { items: rows.map((row) => row.materialId), total };
  }

  async add(userId: string, materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, status: true, visibility: true },
    });
    if (!material || material.status !== MaterialStatus.APPROVED || material.visibility !== MaterialVisibility.PUBLIC) {
      throw new NotFoundException('Material not available');
    }

    try {
      await this.prisma.favorite.create({
        data: { userId, materialId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Already favorited');
      }
      throw err;
    }
    return { favorited: true };
  }

  async remove(userId: string, materialId: string) {
    const deleted = await this.prisma.favorite.deleteMany({
      where: { userId, materialId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Favorite not found');
    }
    return { favorited: false };
  }

  async list(userId: string, query: FavoritesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // B7 figures (download count / avg score) now come from the denormalized material
    // counters — the previous `_count: { downloads }` select forced Prisma to LEFT JOIN
    // a GROUP BY over the entire downloads table per page, plus a rating.groupBy query.
    const [items, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          material: {
            select: {
              id: true,
              title: true,
              description: true,
              stage: true,
              grade: true,
              subject: true,
              kind: true,
              year: true,
              region: true,
              createdAt: true,
              downloadCount: true,
              ratingSum: true,
              ratingCount: true,
            },
          },
        },
      }),
      this.prisma.favorite.count({ where: { userId } }),
    ]);

    return {
      items: items.map((row) => {
        const { downloadCount, ratingSum, ratingCount, ...materialBase } = row.material;
        const ratings = ratingCount ?? 0;
        return {
          id: row.id,
          favoritedAt: row.createdAt.toISOString(),
          material: {
            ...materialBase,
            avg_score: ratings > 0 ? (ratingSum ?? 0) / ratings : null,
            download_count: downloadCount ?? 0,
          },
        };
      }),
      page,
      pageSize,
      total,
    };
  }
}
