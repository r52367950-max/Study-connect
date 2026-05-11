import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MaterialStatus, MaterialVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { FavoritesQueryDto } from './dto/favorites-query.dto';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

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
              status: true,
              visibility: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.favorite.count({ where: { userId } }),
    ]);

    return {
      items: items.map((row) => ({
        id: row.id,
        favoritedAt: row.createdAt.toISOString(),
        material: row.material,
      })),
      page,
      pageSize,
      total,
    };
  }
}
