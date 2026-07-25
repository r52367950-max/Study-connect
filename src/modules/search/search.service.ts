import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { runWithTrgmThreshold } from '../../common/pg-trgm';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(q: string, limit = 10): Promise<Array<{ materialId: string; title: string }>> {
    const query = q.trim();
    if (!query) return [];

    const take = Math.min(Math.max(Math.floor(limit) || 1, 1), 20);

    // `title % q` / `description % q` drive a BitmapOr over the two GIN trigram
    // indexes, and only the matched rows are then ranked by exact similarity().
    // The previous predicate — `similarity(title, q) > 0 OR
    // similarity(COALESCE(description, ''), q) > 0` — wrapped the indexed columns
    // in a function call, so neither index applied and every approved material was
    // scanned and scored on each (keystroke-driven) suggest request.
    // `description % q` is NULL (falsy) for NULL descriptions, matching the old
    // COALESCE form, which was always false there.
    //
    // The file-safety predicate matches the material list/detail/download paths:
    // without it, suggestions leaked titles of QUARANTINED/SCANNING/FAILED
    // materials that then 404 when clicked.
    const rows = await runWithTrgmThreshold(
      this.prisma,
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
    );

    return rows;
  }
}
