import { Prisma } from '@prisma/client';

/**
 * Trigram threshold backing keyword search's `%` operator.
 *
 * The predicate `similarity(col, q) > 0` cannot use the GIN trigram indexes — the
 * indexed column sits inside a function call — so it degrades to a per-row
 * similarity() over every candidate material. `col % q` is index-driven, but it
 * compares against the `pg_trgm.similarity_threshold` GUC rather than a literal,
 * so each query pins that GUC low enough to keep the original "shares at least one
 * trigram" recall (min positive similarity is roughly 1/union-trigrams; 0.001
 * covers texts up to ~1000 trigrams).
 */
export const TRGM_MIN_SIMILARITY = 0.001;

/** Minimal surface of PrismaService needed here; keeps the mocks in scripts/ simple. */
type TrgmCapableClient = {
  $executeRaw(query: Prisma.Sql): Prisma.PrismaPromise<number>;
  $transaction(operations: Prisma.PrismaPromise<unknown>[]): Promise<unknown[]>;
};

/**
 * Run a raw trigram query with `pg_trgm.similarity_threshold` pinned.
 *
 * `SET LOCAL` is scoped to the surrounding transaction, so the setting is rolled
 * back with it and a pooled connection is never left mutated for the next caller.
 */
export function runWithTrgmThreshold<T>(
  prisma: TrgmCapableClient,
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
