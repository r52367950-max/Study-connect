import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(q: string, limit = 10): Promise<Array<{ materialId: string; title: string }>> {
    const query = q.trim();
    if (!query) return [];
    const rows = await this.prisma.$queryRaw<Array<{ materialId: string; title: string }>>(Prisma.sql`
      SELECT m.id AS "materialId", m.title
      FROM materials m
      WHERE m.status = 'APPROVED'
        AND m.visibility = 'PUBLIC'
        AND (similarity(m.title, ${query}) > 0 OR similarity(COALESCE(m.description, ''), ${query}) > 0)
      ORDER BY (similarity(m.title, ${query}) + similarity(COALESCE(m.description, ''), ${query})) DESC, m.created_at DESC
      LIMIT ${Math.min(Math.max(limit, 1), 20)}
    `);
    return rows;
  }
}
