import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { SchoolQueryDto } from './dto/school-query.dto';

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SchoolQueryDto) {
    const limit = query.limit ?? 10;
    const where: Prisma.SchoolWhereInput = {};
    if (query.city) where.city = query.city;

    if (query.q) {
      const q = query.q.trim();
      const lowered = q.toLowerCase();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { pinyin: { startsWith: lowered } },
      ];
    }

    const items = await this.prisma.school.findMany({
      where,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      take: limit,
      select: { id: true, name: true, city: true },
    });

    return { items };
  }
}
