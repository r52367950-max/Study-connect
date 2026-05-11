/// <reference path="../src/types/express.d.ts" />
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { MinioService, PrismaService } from '../src/infra';

type UserRole = 'USER' | 'ADMIN';
type MaterialStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type DbUser = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
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
  status: MaterialStatus;
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
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
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
      data: { email?: string | null; phone?: string | null; username: string; passwordHash: string; role: UserRole };
      select: { id?: boolean; email?: boolean; username?: boolean; role?: boolean };
    }) => {
      const user: DbUser = {
        id: crypto.randomUUID(),
        email: data.email ?? '',
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
      return this.users.find((u) =>
        (where.email !== undefined && u.email === where.email) ||
        (where.id !== undefined && u.id === where.id),
      ) ?? null;
    },
  };

  material = {
    findFirst: async ({ where, select }: { where: { id: string; status: MaterialStatus }; select: Record<string, unknown> }) => {
      const material = this.materials.find((m) => m.id === where.id && m.status === where.status);
      if (!material) {
        return null;
      }
      return this.mapMaterial(material, select);
    },
  };

  rating = {
    upsert: async ({
      where,
      create,
      update,
      select,
    }: {
      where: { userId_materialId: { userId: string; materialId: string } };
      create: { userId: string; materialId: string; score: number; comment?: string };
      update: { score: number; comment?: string };
      select: Record<string, boolean>;
    }) => {
      const now = new Date();
      const existing = this.ratings.find(
        (item) =>
          item.userId === where.userId_materialId.userId &&
          item.materialId === where.userId_materialId.materialId,
      );

      const rating: DbRating = existing
        ? {
            ...existing,
            score: update.score,
            comment: update.comment ?? null,
            updatedAt: now,
          }
        : {
            id: crypto.randomUUID(),
            userId: create.userId,
            materialId: create.materialId,
            score: create.score,
            comment: create.comment ?? null,
            createdAt: now,
            updatedAt: now,
          };

      if (!existing) {
        this.ratings.push(rating);
      } else {
        const idx = this.ratings.findIndex((item) => item.id === existing.id);
        this.ratings[idx] = rating;
      }

      return this.pick(rating, select);
    },

    findMany: async ({
      where,
      skip,
      take,
      orderBy,
      select,
    }: {
      where: { materialId: string };
      skip: number;
      take: number;
      orderBy: Array<Record<string, 'asc' | 'desc'>>;
      select: Record<string, boolean>;
    }) => {
      const list = this.ratings.filter((item) => item.materialId === where.materialId);
      const first = orderBy[0];
      if (first && first.createdAt === 'desc') {
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return list.slice(skip, skip + take).map((item) => this.pick(item, select));
    },

    count: async ({ where }: { where: { materialId: string } }) => {
      return this.ratings.filter((item) => item.materialId === where.materialId).length;
    },

    aggregate: async ({ where }: { where: { materialId: string } }) => {
      const list = this.ratings.filter((item) => item.materialId === where.materialId);
      const avg = list.length ? list.reduce((sum, current) => sum + current.score, 0) / list.length : null;
      return {
        _avg: { score: avg },
        _count: { score: list.length },
      };
    },

    groupBy: async ({ where }: { where: { materialId: { in: string[] } } }) => {
      return where.materialId.in.map((materialId) => {
        const list = this.ratings.filter((item) => item.materialId === materialId);
        const avg = list.length ? list.reduce((sum, current) => sum + current.score, 0) / list.length : null;
        return {
          materialId,
          _avg: { score: avg },
        };
      });
    },
  };

  download = {
    create: async () => {
      throw new Error('not used in this script');
    },
  };

  seedMaterials(uploaderId: string): { approvedId: string; pendingId: string } {
    const approvedId = crypto.randomUUID();
    const pendingId = crypto.randomUUID();
    const now = new Date();

    this.materials.push(
      {
        id: approvedId,
        title: 'Approved Math Notes',
        description: 'For rating test',
        stage: 'HighSchool',
        grade: 'Grade 11',
        subject: 'Math',
        year: 2025,
        region: 'CN-ZJ',
        fileKey: 'approved.pdf',
        visibility: 'PUBLIC',
        status: 'APPROVED',
        reviewComment: 'approved',
        uploaderId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: pendingId,
        title: 'Pending Physics Notes',
        description: 'Not approved yet',
        stage: 'HighSchool',
        grade: 'Grade 11',
        subject: 'Physics',
        year: 2025,
        region: 'CN-ZJ',
        fileKey: 'pending.pdf',
        visibility: 'PUBLIC',
        status: 'PENDING',
        reviewComment: null,
        uploaderId,
        createdAt: now,
        updatedAt: now,
      },
    );

    this.downloads.push({
      id: crypto.randomUUID(),
      userId: uploaderId,
      materialId: approvedId,
    });

    return { approvedId, pendingId };
  }

  debugRatings(materialId: string): DbRating[] {
    return this.ratings.filter((item) => item.materialId === materialId);
  }

  private pick(source: Record<string, unknown>, select: Record<string, boolean>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      if (select[key]) {
        out[key] = source[key];
      }
    }
    return out;
  }

  private mapMaterial(material: DbMaterial, select: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      if (key === '_count') {
        out._count = {
          downloads: this.downloads.filter((item) => item.materialId === material.id).length,
        };
        continue;
      }
      if (select[key]) {
        out[key] = (material as unknown as Record<string, unknown>)[key];
      }
    }
    return out;
  }
}

class MinioServiceMock {
  async uploadObject(): Promise<string> {
    return 'noop';
  }

  getObjectUrl(key: string): string {
    return `http://minio.local/study-connect/${key}`;
  }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'task7-secret';
  process.env.AUTH_OTP_TEST_BYPASS = process.env.AUTH_OTP_TEST_BYPASS ?? 'true';
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://frontend.local:3000';

  const prismaMock = new PrismaServiceMock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(MinioService)
    .useValue(new MinioServiceMock())
    .compile();

  const app = moduleRef.createNestApplication();
  app.enableCors({
    origin: ['http://frontend.local:3000'],
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    optionsSuccessStatus: 204,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? 3000 : address.port;
  const base = `http://127.0.0.1:${port}`;
  const allowedOrigin = 'http://frontend.local:3000';

  async function issueCsrf(): Promise<{ token: string; cookie: string }> {
    const res = await fetch(`${base}/auth/csrf`, { headers: { origin: allowedOrigin } });
    const json = (await res.json()) as { csrfToken: string };
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    return { token: json.csrfToken, cookie };
  }

  const registerCsrf = await issueCsrf();
  const registerRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: registerCsrf.cookie,
      'x-csrf-token': registerCsrf.token,
    },
    body: JSON.stringify({
      email: 'rating-user@example.com',
      username: 'rating_user',
      password: 'StrongPass123!',
      otpCode: '000000',
    }),
  });
  const registerBody = (await registerRes.json()) as { user: { id: string } };

  const seeded = prismaMock.seedMaterials(registerBody.user.id);

  const loginCsrf = await issueCsrf();
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: loginCsrf.cookie,
      'x-csrf-token': loginCsrf.token,
    },
    body: JSON.stringify({
      email: 'rating-user@example.com',
      password: 'StrongPass123!',
    }),
  });
  const loginBody = (await loginRes.json()) as { accessToken: string };

  const ratingCsrf = await issueCsrf();
  const firstRatingRes = await fetch(`${base}/materials/${seeded.approvedId}/ratings`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${loginBody.accessToken}`,
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: ratingCsrf.cookie,
      'x-csrf-token': ratingCsrf.token,
    },
    body: JSON.stringify({
      score: 4,
      content: 'First review',
    }),
  });
  const firstRatingBody = await firstRatingRes.text();
  console.log('first rating status:', firstRatingRes.status);
  console.log('first rating body:', firstRatingBody);
  assert(firstRatingRes.status === 201, 'first rating should succeed');
  const firstRatingJson = JSON.parse(firstRatingBody) as { content?: string | null };
  assert(firstRatingJson.content === 'First review', 'first rating response should include content');

  const rating2Csrf = await issueCsrf();
  const secondRatingRes = await fetch(`${base}/materials/${seeded.approvedId}/ratings`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${loginBody.accessToken}`,
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: rating2Csrf.cookie,
      'x-csrf-token': rating2Csrf.token,
    },
    body: JSON.stringify({
      score: 5,
      content: 'Updated review',
    }),
  });
  const secondRatingBody = await secondRatingRes.text();
  console.log('second rating status:', secondRatingRes.status);
  console.log('second rating body:', secondRatingBody);
  assert(secondRatingRes.status === 201, 'second rating update should succeed');
  const secondRatingJson = JSON.parse(secondRatingBody) as { content?: string | null };
  assert(secondRatingJson.content === 'Updated review', 'updated rating response should include latest content');

  const pendingCsrf = await issueCsrf();
  const pendingRatingRes = await fetch(`${base}/materials/${seeded.pendingId}/ratings`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${loginBody.accessToken}`,
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: pendingCsrf.cookie,
      'x-csrf-token': pendingCsrf.token,
    },
    body: JSON.stringify({
      score: 3,
      content: 'Should fail',
    }),
  });
  console.log('pending rating status:', pendingRatingRes.status);
  console.log('pending rating body:', await pendingRatingRes.text());

  const ratingsListRes = await fetch(`${base}/materials/${seeded.approvedId}/ratings?page=1&pageSize=10`);
  const ratingsListBody = await ratingsListRes.text();
  console.log('ratings list status:', ratingsListRes.status);
  console.log('ratings list body:', ratingsListBody);
  assert(ratingsListRes.status === 200, 'ratings list should succeed');
  const ratingsListJson = JSON.parse(ratingsListBody) as {
    items: Array<{ content?: string | null }>;
  };
  assert(ratingsListJson.items[0]?.content === 'Updated review', 'ratings list should expose content field');

  const detailRes = await fetch(`${base}/materials/${seeded.approvedId}`);
  console.log('detail status:', detailRes.status);
  console.log('detail body:', await detailRes.text());

  const dbRatings = prismaMock.debugRatings(seeded.approvedId);
  console.log('db ratings snapshot:', JSON.stringify(dbRatings));
  assert(dbRatings[0]?.comment === 'Updated review', 'db rating comment column should persist dto.content value');

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
