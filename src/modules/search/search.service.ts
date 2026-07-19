import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra';
import { runWithTrgmThreshold } from '../../common/trgm.util';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(q: string, limit = 10): Promise<Array<{ materialId: string; title: string }>> {
    const query = q.trim();
    if (!query) return [];
    // `title % q` / `description % q` drive a BitmapOr over the two GIN trigram
    // indexes (see trgm.util.ts); the previous `similarity(col, q) > 0` predicate
    // could not use them and seq-scanned every approved material per keystroke.
    // The file-safety predicate mirrors the materials list/detail invariant so a
    // quarantined/failed upload's title never surfaces as a suggestion.
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
        LIMIT ${Math.min(Math.max(limit, 1), 20)}
      `),
    );
    return rows;
  }
}
