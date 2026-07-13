import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';

// Keep in step with materials.service.ts TRGM_MIN_SIMILARITY so suggestions and the
// main /materials?q= search share the same trigram match sensitivity.
const TRGM_MIN_SIMILARITY = 0.001;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(q: string, limit = 10): Promise<Array<{ materialId: string; title: string }>> {
    const query = q.trim();
    if (!query) return [];
    const take = Math.min(Math.max(limit, 1), 20);
    // Use the `%` trigram operator (index-backed by materials_title/description_trgm_idx) in the
    // WHERE clause instead of `similarity(col, q) > 0`, which is a per-row function call that forces
    // a full seq scan over every approved+public row. `similarity()` stays in ORDER BY only, ranking
    // the already-matched rows. SET LOCAL pins the threshold for this transaction so `%` matches the
    // same low-similarity rows the old predicate did, without touching the pooled connection.
    return this.runWithTrgmThreshold(
      this.prisma.$queryRaw<Array<{ materialId: string; title: string }>>(Prisma.sql`
        SELECT m.id AS "materialId", m.title
        FROM materials m
        WHERE m.status = 'APPROVED'
          AND m.visibility = 'PUBLIC'
          AND (m.title % ${query} OR m.description % ${query})
        ORDER BY (similarity(m.title, ${query}) + similarity(COALESCE(m.description, ''), ${query})) DESC, m.created_at DESC
        LIMIT ${take}
      `),
    );
  }

  private runWithTrgmThreshold<T>(query: Prisma.PrismaPromise<T>): Promise<T> {
    return this.prisma
      .$transaction([
        this.prisma.$executeRaw(
          Prisma.sql`SET LOCAL pg_trgm.similarity_threshold = ${Prisma.raw(String(TRGM_MIN_SIMILARITY))}`,
        ),
        query,
      ])
      .then((results) => results[1] as T);
  }
}
