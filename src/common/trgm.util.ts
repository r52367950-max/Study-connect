import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra';

/**
 * Trigram threshold backing keyword search's `%` operator. A predicate like
 * `similarity(col, q) > 0` cannot use the GIN trigram indexes (function call on
 * the left side), forcing a per-row similarity() over every approved material.
 * `col % q` is index-driven but compares against the pg_trgm.similarity_threshold
 * GUC, so each query SETs it LOCAL-ly to a value small enough to keep the
 * original "shares at least one trigram" recall (min positive similarity ≈
 * 1/union-trigrams; 0.001 covers texts up to ~1000 trigrams). Applied via
 * SET LOCAL inside the same transaction as the query so pooled connections
 * never leak the setting.
 */
export const TRGM_MIN_SIMILARITY = 0.001;

/**
 * Runs a raw trigram query in a batch transaction that first pins
 * pg_trgm.similarity_threshold (SET LOCAL — scoped to the transaction, so the
 * pooled connection is left untouched). See TRGM_MIN_SIMILARITY.
 */
export function runWithTrgmThreshold<T>(
  prisma: PrismaService,
  query: Prisma.PrismaPromise<T>,
): Promise<T> {
  return prisma
    .$transaction([
      prisma.$executeRaw(
        Prisma.sql`SET LOCAL pg_trgm.similarity_threshold = ${Prisma.raw(String(TRGM_MIN_SIMILARITY))}`,
      ),
      query,
    ])
    .then((results) => results[1] as T);
}
