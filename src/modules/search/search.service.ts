import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Same trigram strategy as MaterialsService.searchApproved: `col % q` is
   * index-driven (GIN trgm BitmapOr over the title/description indexes) where
   * `similarity(col, q) > 0` forced a per-row similarity() over every approved
   * material. The threshold is pinned with SET LOCAL inside the same
   * transaction so pooled connections never leak it. Also mirrors the
   * list/detail file-safety filter so a suggestion never points at a material
   * that 404s on click.
   */
  async suggest(q: string, limit = 10): Promise<Array<{ materialId: string; title: string }>> {
    const query = q.trim();
    if (!query) return [];
    const take = Math.min(Math.max(limit, 1), 20);
    const results = await this.prisma.$transaction([
      this.prisma.$executeRaw(Prisma.sql`SET LOCAL pg_trgm.similarity_threshold = 0.001`),
      this.prisma.$queryRaw<Array<{ materialId: string; title: string }>>(Prisma.sql`
        SELECT m.id AS "materialId", m.title
        FROM materials m
        WHERE m.status = 'APPROVED'
          AND m.visibility = 'PUBLIC'
          AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
          AND (m.title % ${query} OR m.description % ${query})
        ORDER BY (similarity(m.title, ${query}) + similarity(COALESCE(m.description, ''), ${query})) DESC, m.created_at DESC
        LIMIT ${take}
      `),
    ]);
    return results[1] as Array<{ materialId: string; title: string }>;
  }
}
