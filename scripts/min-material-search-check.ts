/// <reference path="../src/types/express.d.ts" />
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { MinioService, PrismaService } from '../src/infra';

type DbUser = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: 'USER' | 'ADMIN';
};

type DbMaterial = {
  id: string;
  title: string;
  description: string | null;
  stage: string | null;
  grade: string | null;
  subject: string | null;
  year: number | null;
  region: string | null;
  fileKey: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewComment: string | null;
  uploaderId: string;
  createdAt: Date;
  updatedAt: Date;
};

type DbRating = {
  id: string;
  userId: string;
  materialId: string;
  score: number;
};

type DbDownload = {
  id: string;
  userId: string;
  materialId: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class PrismaServiceMock {
  private users: DbUser[] = [];
  private materials: DbMaterial[] = [];
  private ratings: DbRating[] = [];
  private downloads: DbDownload[] = [];

  user = {
    findFirst: async ({ where }: { where: { OR: Array<{ email?: string; username?: string }> } }) => {
      return (
        this.users.find((user) =>
          where.OR.some((cond) => cond.email === user.email || cond.username === user.username),
        ) ?? null
      );
    },
    create: async ({
      data,
      select,
    }: {
      data: { email: string; username: string; passwordHash: string; role: 'USER' | 'ADMIN' };
      select: { id?: boolean; email?: boolean; username?: boolean; role?: boolean };
    }) => {
      const user: DbUser = {
        id: crypto.randomUUID(),
        email: data.email,
        username: data.username,
        passwordHash: data.passwordHash,
        role: data.role,
      };
      this.users.push(user);
      return {
        ...(select.id ? { id: user.id } : {}),
        ...(select.email ? { email: user.email } : {}),
        ...(select.username ? { username: user.username } : {}),
        ...(select.role ? { role: user.role } : {}),
      };
    },
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      return this.users.find((user) =>
        (where.email !== undefined && user.email === where.email) ||
        (where.id !== undefined && user.id === where.id),
      ) ?? null;
    },
  };

  material = {
    create: async ({ data }: { data: Omit<DbMaterial, 'id' | 'createdAt' | 'updatedAt'> }) => {
      const now = new Date();
      const material: DbMaterial = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      this.materials.push(material);
      return material;
    },

    findMany: async ({
      where,
      skip,
      take,
      orderBy,
      select,
    }: {
      where: Record<string, unknown>;
      skip?: number;
      take?: number;
      orderBy?: Array<Record<string, unknown>>;
      select: Record<string, unknown>;
    }) => {
      let filtered = this.materials.filter((material) => material.status === where.status);
      if (where.visibility) {
        filtered = filtered.filter((material) => material.visibility === where.visibility);
      }

      if (where.stage && typeof where.stage === 'object') {
        filtered = filtered.filter((m) => this.matchEqualsInsensitive(m.stage, where.stage as Record<string, string>));
      }
      if (where.grade && typeof where.grade === 'object') {
        filtered = filtered.filter((m) => this.matchEqualsInsensitive(m.grade, where.grade as Record<string, string>));
      }
      if (where.subject && typeof where.subject === 'object') {
        filtered = filtered.filter((m) => this.matchEqualsInsensitive(m.subject, where.subject as Record<string, string>));
      }
      if (where.region && typeof where.region === 'object') {
        filtered = filtered.filter((m) => this.matchEqualsInsensitive(m.region, where.region as Record<string, string>));
      }
      if (typeof where.year === 'number') {
        filtered = filtered.filter((m) => m.year === where.year);
      }
      if (where.OR && Array.isArray(where.OR)) {
        const keywordRules = where.OR as Array<Record<string, unknown>>;
        filtered = filtered.filter((m) =>
          keywordRules.some((rule) => {
            const titleRule = rule.title as { contains?: string } | undefined;
            const descRule = rule.description as { contains?: string } | undefined;
            const target = (titleRule?.contains ?? descRule?.contains ?? '').toLowerCase();
            return m.title.toLowerCase().includes(target) || (m.description ?? '').toLowerCase().includes(target);
          }),
        );
      }

      const ordered = [...filtered];
      const firstOrder = orderBy?.[0] ?? {};
      if ('createdAt' in firstOrder) {
        ordered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else if ('downloads' in firstOrder || 'downloadCount' in firstOrder) {
        ordered.sort((a, b) => this.countDownloads(b.id) - this.countDownloads(a.id));
      } else if ('ratings' in firstOrder) {
        ordered.sort((a, b) => this.countRatings(b.id) - this.countRatings(a.id));
      }

      const safeSkip = skip ?? 0;
      const safeTake = take ?? Number.MAX_SAFE_INTEGER;

      return ordered.slice(safeSkip, safeSkip + safeTake).map((material) => {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (key === '_count') {
            out._count = {
              downloads: this.countDownloads(material.id),
            };
            continue;
          }
          if (this.applyCounterField(out, key, material.id)) {
            continue;
          }
          if (select[key]) {
            out[key] = (material as unknown as Record<string, unknown>)[key];
          }
        }
        return out;
      });
    },

    count: async ({ where }: { where: Record<string, unknown> }) => {
      const list = await this.material.findMany({ where, skip: 0, take: Number.MAX_SAFE_INTEGER, orderBy: [], select: { id: true } });
      return list.length;
    },

    findFirst: async ({
      where,
      select,
    }: {
      where: { id: string; status: string; visibility?: 'PUBLIC' | 'PRIVATE' };
      select: Record<string, unknown>;
    }) => {
      const material = this.materials.find(
        (m) => m.id === where.id && m.status === where.status && (!where.visibility || m.visibility === where.visibility),
      );
      if (!material) {
        return null;
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(select)) {
        if (key === '_count') {
          out._count = { downloads: this.countDownloads(material.id) };
          continue;
        }
        if (this.applyCounterField(out, key, material.id)) {
          continue;
        }
        if (select[key]) {
          out[key] = (material as unknown as Record<string, unknown>)[key];
        }
      }
      return out;
    },
  };

  /** Denormalized counter columns, derived from the in-memory downloads/ratings arrays. */
  private applyCounterField(out: Record<string, unknown>, key: string, materialId: string): boolean {
    if (key === 'downloadCount') {
      out.downloadCount = this.countDownloads(materialId);
      return true;
    }
    if (key === 'ratingSum') {
      out.ratingSum = this.ratings
        .filter((r) => r.materialId === materialId)
        .reduce((sum, r) => sum + r.score, 0);
      return true;
    }
    if (key === 'ratingCount') {
      out.ratingCount = this.countRatings(materialId);
      return true;
    }
    return false;
  }

  rating = {
    groupBy: async ({ where }: { where: { materialId: { in: string[] } } }) => {
      return where.materialId.in.map((materialId) => {
        const materialRatings = this.ratings.filter((r) => r.materialId === materialId);
        const avg = materialRatings.length
          ? materialRatings.reduce((sum, current) => sum + current.score, 0) / materialRatings.length
          : null;
        return {
          materialId,
          _avg: { score: avg },
          _count: { score: materialRatings.length },
        };
      });
    },
    aggregate: async ({ where }: { where: { materialId: string } }) => {
      const materialRatings = this.ratings.filter((r) => r.materialId === where.materialId);
      const avg = materialRatings.length
        ? materialRatings.reduce((sum, current) => sum + current.score, 0) / materialRatings.length
        : null;
      return {
        _avg: {
          score: avg,
        },
        _count: {
          score: materialRatings.length,
        },
      };
    },
  };

  // The trigram branches run their raw query inside a batch transaction that first
  // pins pg_trgm.similarity_threshold via $executeRaw (see runWithTrgmThreshold).
  $executeRaw = async (): Promise<number> => 0;

  $transaction = async (operations: unknown): Promise<unknown> => {
    if (Array.isArray(operations)) {
      return Promise.all(operations);
    }
    return (operations as (tx: this) => Promise<unknown>)(this);
  };

  // B1/C1-C3: the RATING sort branch uses $queryRaw(...) raw-SQL aggregation (the keyword
  // branch already did). Both now contain similarity() (C2 added the keyword filter to the
  // rating branch), so discriminate on the SELECT shape, not on "similarity":
  //   - RATING aggregation query → selects avg_score → return sorted rating rows.
  //   - C3 out-of-range count fallback → "AS total" → return [{ total }].
  //   - keyword search query → neither → logged-not-asserted, return [].
  $queryRaw = async (sql: { strings?: string[]; sql?: string }): Promise<unknown[]> => {
    const text = sql?.strings ? sql.strings.join(' ') : String(sql?.sql ?? '');
    const approvedPublic = this.materials.filter(
      (m) => m.status === 'APPROVED' && m.visibility === 'PUBLIC',
    );
    if (!text.includes('avg_score')) {
      // C3 count fallback selects "COUNT(*)::bigint AS total"; keyword search selects neither.
      if (text.includes('AS total')) {
        return [{ total: BigInt(approvedPublic.length) }];
      }
      return [];
    }
    const filtered = approvedPublic;
    const rows = filtered.map((m) => {
      const materialRatings = this.ratings.filter((r) => r.materialId === m.id);
      const avg = materialRatings.length
        ? materialRatings.reduce((sum, r) => sum + r.score, 0) / materialRatings.length
        : null;
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        stage: m.stage,
        grade: m.grade,
        subject: m.subject,
        kind: (m as unknown as { kind?: string | null }).kind ?? null,
        year: m.year,
        region: m.region,
        visibility: m.visibility,
        createdAt: m.createdAt,
        avg_score: avg,
        rating_count: BigInt(materialRatings.length),
        download_count: BigInt(this.countDownloads(m.id)),
      };
    });
    rows.sort((a, b) => {
      const av = a.avg_score ?? -Infinity;
      const bv = b.avg_score ?? -Infinity;
      if (bv !== av) return bv - av;
      const rc = Number(b.rating_count) - Number(a.rating_count);
      if (rc !== 0) return rc;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const total = rows.length;
    return rows.map((r) => ({ ...r, total_count: BigInt(total) }));
  };

  seed(): {
    approvedId: string;
    pendingId: string;
    approvedPrivateId: string;
    highAvgLowCountId: string;
    lowAvgHighCountId: string;
  } {
    const uploaderId = crypto.randomUUID();
    this.users.push({
      id: uploaderId,
      email: 'seed@example.com',
      username: 'seed',
      passwordHash: 'x',
      role: 'USER',
    });

    const approvedId = crypto.randomUUID();
    const pendingId = crypto.randomUUID();
    const approvedPrivateId = crypto.randomUUID();
    const highAvgLowCountId = crypto.randomUUID();
    const lowAvgHighCountId = crypto.randomUUID();

    this.materials.push(
      {
        id: approvedId,
        title: 'Math calculus summary',
        description: 'keyword-linear-algebra',
        stage: 'HighSchool',
        grade: 'Grade 10',
        subject: 'Math',
        year: 2024,
        region: 'CN-ZJ',
        fileKey: 'approved.txt',
        visibility: 'PUBLIC',
        status: 'APPROVED',
        reviewComment: 'approved',
        uploaderId,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: approvedPrivateId,
        title: 'Math private approved',
        description: 'keyword-linear-algebra-private',
        stage: 'HighSchool',
        grade: 'Grade 10',
        subject: 'Math',
        year: 2024,
        region: 'CN-ZJ',
        fileKey: 'approved-private.txt',
        visibility: 'PRIVATE',
        status: 'APPROVED',
        reviewComment: 'approved',
        uploaderId,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        id: pendingId,
        title: 'Math pending draft',
        description: 'keyword-linear-algebra',
        stage: 'HighSchool',
        grade: 'Grade 10',
        subject: 'Math',
        year: 2024,
        region: 'CN-ZJ',
        fileKey: 'pending.txt',
        visibility: 'PUBLIC',
        status: 'PENDING',
        reviewComment: null,
        uploaderId,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: highAvgLowCountId,
        title: 'High score few reviews',
        description: 'rating-sort-high-avg',
        stage: 'HighSchool',
        grade: 'Grade 10',
        subject: 'Math',
        year: 2024,
        region: 'CN-ZJ',
        fileKey: 'high-avg.txt',
        visibility: 'PUBLIC',
        status: 'APPROVED',
        reviewComment: 'approved',
        uploaderId,
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
        updatedAt: new Date('2026-01-04T00:00:00.000Z'),
      },
      {
        id: lowAvgHighCountId,
        title: 'Low score many reviews',
        description: 'rating-sort-low-avg',
        stage: 'HighSchool',
        grade: 'Grade 10',
        subject: 'Math',
        year: 2024,
        region: 'CN-ZJ',
        fileKey: 'low-avg.txt',
        visibility: 'PUBLIC',
        status: 'APPROVED',
        reviewComment: 'approved',
        uploaderId,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-05T00:00:00.000Z'),
      },
    );

    this.ratings.push(
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId, score: 4 },
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId, score: 5 },
      { id: crypto.randomUUID(), userId: uploaderId, materialId: highAvgLowCountId, score: 5 },
      { id: crypto.randomUUID(), userId: crypto.randomUUID(), materialId: highAvgLowCountId, score: 5 },
      { id: crypto.randomUUID(), userId: uploaderId, materialId: lowAvgHighCountId, score: 1 },
      { id: crypto.randomUUID(), userId: crypto.randomUUID(), materialId: lowAvgHighCountId, score: 1 },
      { id: crypto.randomUUID(), userId: crypto.randomUUID(), materialId: lowAvgHighCountId, score: 2 },
      { id: crypto.randomUUID(), userId: crypto.randomUUID(), materialId: lowAvgHighCountId, score: 2 },
      { id: crypto.randomUUID(), userId: crypto.randomUUID(), materialId: lowAvgHighCountId, score: 2 },
    );
    this.downloads.push(
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId },
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId },
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId },
    );

    return { approvedId, pendingId, approvedPrivateId, highAvgLowCountId, lowAvgHighCountId };
  }

  private countDownloads(materialId: string): number {
    return this.downloads.filter((item) => item.materialId === materialId).length;
  }

  private countRatings(materialId: string): number {
    return this.ratings.filter((item) => item.materialId === materialId).length;
  }

  private matchEqualsInsensitive(value: string | null, rule: Record<string, string>): boolean {
    return (value ?? '').toLowerCase() === (rule.equals ?? '').toLowerCase();
  }
}

class MinioServiceMock {
  async uploadObject(): Promise<string> {
    return 'noop';
  }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'task5-secret';

  const prismaMock = new PrismaServiceMock();
  const seeded = prismaMock.seed();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(MinioService)
    .useValue(new MinioServiceMock())
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? 3000 : address.port;
  const base = `http://127.0.0.1:${port}`;

  const listRes = await fetch(`${base}/materials?page=1&pageSize=10`);
  const listBody = await listRes.text();
  console.log('guest list status:', listRes.status);
  console.log('guest list body:', listBody);

  const filterRes = await fetch(`${base}/materials?q=linear&subject=Math&page=1&pageSize=10`);
  const filterBody = await filterRes.text();
  console.log('keyword+subject status:', filterRes.status);
  console.log('keyword+subject body:', filterBody);

  const detailRes = await fetch(`${base}/materials/${seeded.approvedId}`);
  const detailBody = await detailRes.text();
  console.log('guest detail status:', detailRes.status);
  console.log('guest detail body:', detailBody);

  const pendingVisible = listBody.includes(seeded.pendingId);
  const privateApprovedVisible = listBody.includes(seeded.approvedPrivateId);
  const privateDetailRes = await fetch(`${base}/materials/${seeded.approvedPrivateId}`);
  const privateDetailBody = await privateDetailRes.text();
  console.log('pending in list:', pendingVisible);
  console.log('private approved in list:', privateApprovedVisible);
  console.log('private approved detail status:', privateDetailRes.status);
  console.log('private approved detail body:', privateDetailBody);

  const sortByRatingRes = await fetch(`${base}/materials?sort=rating&page=1&pageSize=10`);
  const sortByRatingBody = await sortByRatingRes.json();
  const ids = (sortByRatingBody.items as Array<{ id: string }>).map((item) => item.id);
  const highIndex = ids.indexOf(seeded.highAvgLowCountId);
  const lowIndex = ids.indexOf(seeded.lowAvgHighCountId);
  assert(highIndex >= 0, 'high-avg material should appear in rating sort result');
  assert(lowIndex >= 0, 'low-avg material should appear in rating sort result');
  assert(
    highIndex < lowIndex,
    'rating sort should rank higher average score before lower average score even if lower average has more ratings',
  );
  console.log('rating sort status:', sortByRatingRes.status);
  console.log('rating sort ids:', ids.join(','));

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  // Force-exit: a failed run may still hold the Nest HTTP server open,
  // which would hang the runner/CI instead of failing fast.
  process.exit(1);
});
