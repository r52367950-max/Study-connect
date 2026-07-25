/**
 * Shared `where` matcher for the mocked `user.findFirst` in the min-* scripts.
 *
 * AuthService issues two different lookup shapes against the same model:
 *   - register(): `{ OR: [{ email }, { phone }, { username }] }`
 *   - login():    a single `{ email }` or `{ phone }`
 *
 * Prisma supports both, so the mocks have to as well. Previously the mocks only
 * understood the `OR` form, and login() carried a try/catch that re-issued the
 * query wrapped in `OR: [...]` when the first shape threw — production code
 * shaped around a test double, which also swallowed genuine database errors and
 * silently ran a second query. Modelling both shapes here lets the service issue
 * one plain query.
 */
export type MockUserRecord = Record<string, unknown>;

export function matchesUserWhere(user: MockUserRecord, where: unknown): boolean {
  const clause = (where ?? {}) as { OR?: unknown };
  const conditions = Array.isArray(clause.OR) ? clause.OR : [clause];

  return conditions.some((raw) => {
    const condition = (raw ?? {}) as Record<string, unknown>;
    const keys = Object.keys(condition).filter((key) => condition[key] !== undefined);
    if (keys.length === 0) {
      return false;
    }
    // All keys of one condition must match (Prisma ANDs fields within a clause).
    return keys.every((key) => condition[key] === user[key]);
  });
}
