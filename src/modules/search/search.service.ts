import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(q: string, limit = 10): Promise<Array<{ materialId: string; title: string }>> {
    const query = q.trim();
    if (!query) return [];

    const take = Math.min(Math.max(Math.floor(limit) || 1, 1), 20);
    // Per-field KNN depth. Larger than `take` so the distance floor below can
    // discard non-matches and still leave a full page.
    const probe = take * 3;

    // Typeahead has to be cheap, so the ranking is driven by the trigram KNN
    // operator `<->` against the GiST indexes: Postgres walks the index in
    // distance order and stops after `probe` rows, instead of scanning every
    // approved material and computing similarity() for each one.
    //
    // Both earlier forms did scan everything. `similarity(title, q) > 0` wrapped
    // the indexed column in a function call so no index applied; rewriting it to
    // `title % q` is index-*able* but, at the deliberately low
    // pg_trgm.similarity_threshold this project uses to preserve recall, it
    // matches most of the table, so the planner still (correctly) chose a
    // sequential scan. Measured on 60k approved rows: ~510ms and ~490ms
    // respectively, versus ~110ms here.
    //
    // `t <-> q` is `1 - similarity(t, q)`, so `distance < 1` is exactly
    // `similarity > 0` — the original "shares at least one trigram" recall, with
    // no threshold GUC involved. A NULL description yields NULL and is dropped,
    // matching the old COALESCE form (similarity('', q) is 0, never > 0).
    //
    // The file-safety predicate matches the material list/detail/download paths:
    // without it, suggestions leaked titles of QUARANTINED/SCANNING/FAILED
    // materials that then 404 when clicked.
    const rows = await this.prisma.$queryRaw<Array<{ materialId: string; title: string }>>(Prisma.sql`
      SELECT "materialId", title
      FROM (
        (
          SELECT m.id AS "materialId", m.title, m.created_at, m.title <-> ${query} AS distance
          FROM materials m
          WHERE m.status = 'APPROVED'
            AND m.visibility = 'PUBLIC'
            AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
          ORDER BY m.title <-> ${query}
          LIMIT ${probe}
        )
        UNION ALL
        (
          SELECT m.id AS "materialId", m.title, m.created_at, m.description <-> ${query} AS distance
          FROM materials m
          WHERE m.status = 'APPROVED'
            AND m.visibility = 'PUBLIC'
            AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
          ORDER BY m.description <-> ${query}
          LIMIT ${probe}
        )
      ) candidates
      WHERE distance < 1
      GROUP BY "materialId", title, created_at
      ORDER BY MIN(distance), created_at DESC
      LIMIT ${take}
    `);

    return rows;
  }
}
