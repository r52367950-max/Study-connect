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
    findUnique: async ({ where }: { where: { email: string } }) => {
      return this.users.find((user) => user.email === where.email) ?? null;
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
      skip: number;
      take: number;
      orderBy: Array<Record<string, unknown>>;
      select: Record<string, unknown>;
    }) => {
      let filtered = this.materials.filter((material) => material.status === where.status);

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
      const firstOrder = orderBy[0] ?? {};
      if ('createdAt' in firstOrder) {
        ordered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else if ('downloads' in firstOrder) {
        ordered.sort((a, b) => this.countDownloads(b.id) - this.countDownloads(a.id));
      } else if ('ratings' in firstOrder) {
        ordered.sort((a, b) => this.countRatings(b.id) - this.countRatings(a.id));
      }

      return ordered.slice(skip, skip + take).map((material) => {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (key === '_count') {
            out._count = {
              downloads: this.countDownloads(material.id),
            };
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

    findFirst: async ({ where, select }: { where: { id: string; status: string }; select: Record<string, unknown> }) => {
      const material = this.materials.find((m) => m.id === where.id && m.status === where.status);
      if (!material) {
        return null;
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(select)) {
        if (key === '_count') {
          out._count = { downloads: this.countDownloads(material.id) };
          continue;
        }
        if (select[key]) {
          out[key] = (material as unknown as Record<string, unknown>)[key];
        }
      }
      return out;
    },
  };

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

  seed(): { approvedId: string; pendingId: string } {
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
    );

    this.ratings.push(
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId, score: 4 },
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId, score: 5 },
    );
    this.downloads.push(
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId },
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId },
      { id: crypto.randomUUID(), userId: uploaderId, materialId: approvedId },
    );

    return { approvedId, pendingId };
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
  console.log('pending in list:', pendingVisible);

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
