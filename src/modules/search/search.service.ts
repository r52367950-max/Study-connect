import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { TRGM_MIN_SIMILARITY } from '../materials/materials.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(q: string, limit = 10): Promise<Array<{ materialId: string; title: string }>> {
    const query = q.trim();
    if (!query) return [];
    // Perf: `m.title % q` / `m.description % q` drive a BitmapOr over the two GIN
    // trigram indexes on materials. The previous predicate `similarity(col, q) > 0`
    // (function call on the left side) could not use the indexes, forcing a full
    // table scan on every suggestion request. `%` compares against the
    // pg_trgm.similarity_threshold GUC, so the batch transaction first pins it to
    // TRGM_MIN_SIMILARITY (SET LOCAL — scoped to the transaction, so pooled
    // connections never leak the setting), keeping the original "shares at least
    // one trigram" recall. Ordering still ranks by exact similarity() on the
    // matched rows only. `m.description % q` is NULL (falsy) for NULL
    // descriptions, matching the old similarity(COALESCE(description, ''), q) > 0
    // which was always false there.
    //
    // Safety: only files that passed the async scan (or predate it, i.e. NULL)
    // may surface — the same file_safety_status gate as the materials
    // list/detail/download queries. Without it, titles of QUARANTINED/SCANNING/
    // FAILED/TIMEOUT uploads leak into public suggestions even though their
    // detail pages 404 (docs/error-code-spec.md: never reveal review state).
    const [, rows] = await this.prisma.$transaction([
      this.prisma.$executeRaw(
        Prisma.sql`SET LOCAL pg_trgm.similarity_threshold = ${Prisma.raw(String(TRGM_MIN_SIMILARITY))}`,
      ),
      this.prisma.$queryRaw<Array<{ materialId: string; title: string }>>(Prisma.sql`
        SELECT m.id AS "materialId", m.title
        FROM materials m
        WHERE m.status = 'APPROVED'
          AND m.visibility = 'PUBLIC'
          AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
          AND (m.title % ${query} OR m.description % ${query})
        ORDER BY (similarity(m.title, ${query}) + similarity(COALESCE(m.description, ''), ${query})) DESC, m.created_at DESC
        LIMIT ${Math.min(Math.max(limit, 1), 20)}
      `),
    ]);
    return rows;
  }
}
