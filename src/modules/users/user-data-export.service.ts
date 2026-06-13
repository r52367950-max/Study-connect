import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra';

@Injectable()
export class UserDataExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildExport(userId: string) {
    const [profile, materials, ratings, favorites, downloads, viewEvents] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { school: true },
      }),
      this.prisma.material.findMany({
        where: { uploaderId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.rating.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { material: { select: { id: true, title: true } } },
      }),
      this.prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { material: { select: { id: true, title: true } } },
      }),
      this.prisma.download.findMany({
        where: { userId },
        orderBy: { downloadedAt: 'desc' },
        include: { material: { select: { id: true, title: true } } },
      }),
      this.prisma.viewEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { material: { select: { id: true, title: true } } },
      }),
    ]);

    if (!profile) throw new NotFoundException('User not found');

    return {
      exportedAt: new Date().toISOString(),
      retention: {
        viewEvents: '180 days, then deleted by npm run cleanup:behavior-data',
        downloads: '365 days, then deleted by npm run cleanup:behavior-data',
        favorites: 'kept until user removes favorite or account is anonymized/deleted',
        ratings: 'score is retained as public platform content; comment is cleared during account anonymization',
        materials: 'public approved uploads are retained as platform public content under an anonymized account',
      },
      profile,
      materials,
      ratings,
      favorites,
      downloads,
      viewEvents,
    };
  }
}
