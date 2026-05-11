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
  fileSafetyStatus: 'QUARANTINED' | 'SCANNING' | 'PASSED' | 'FAILED' | 'TIMEOUT' | null;
  uploaderId: string;
  createdAt: Date;
  updatedAt: Date;
};

type DbDownload = {
  id: string;
  userId: string;
  materialId: string;
  downloadedAt: Date;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class PrismaServiceMock {
  private users: DbUser[] = [];
  private materials: DbMaterial[] = [];
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
      data: { email: string; username: string; passwordHash: string; role: UserRole };
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
      return this.users.find((u) =>
        (where.email !== undefined && u.email === where.email) ||
        (where.id !== undefined && u.id === where.id),
      ) ?? null;
    },
  };

  material = {
    findFirst: async ({
      where,
      select,
    }: {
      where: { id: string; status: MaterialStatus; visibility?: 'PUBLIC' | 'PRIVATE' };
      select: Record<string, boolean>;
    }) => {
      const item = this.materials.find(
        (m) => m.id === where.id && m.status === where.status && (!where.visibility || m.visibility === where.visibility),
      );
      if (!item) {
        return null;
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(select)) {
        if (select[key]) {
          out[key] = (item as unknown as Record<string, unknown>)[key];
        }
      }
      return out;
    },
  };

  download = {
    create: async ({
      data,
      select,
    }: {
      data: { userId: string; materialId: string };
      select: { id?: boolean; userId?: boolean; materialId?: boolean; downloadedAt?: boolean };
    }) => {
      const item: DbDownload = {
        id: crypto.randomUUID(),
        userId: data.userId,
        materialId: data.materialId,
        downloadedAt: new Date(),
      };
      this.downloads.push(item);

      return {
        ...(select.id ? { id: item.id } : {}),
        ...(select.userId ? { userId: item.userId } : {}),
        ...(select.materialId ? { materialId: item.materialId } : {}),
        ...(select.downloadedAt ? { downloadedAt: item.downloadedAt } : {}),
      };
    },
  };

  rating = {
    groupBy: async () => [],
    aggregate: async () => ({ _avg: { score: null } }),
  };

  seedMaterials(uploaderId: string): { approvedId: string; pendingId: string; privateApprovedId: string } {
    const approvedId = crypto.randomUUID();
    const pendingId = crypto.randomUUID();
    const privateApprovedId = crypto.randomUUID();
    const now = new Date();

    this.materials.push(
      {
        id: approvedId,
        title: 'Approved Material',
        description: 'approved',
        stage: null,
        grade: null,
        subject: null,
        year: null,
        region: null,
        fileKey: 'approved/file.pdf',
        visibility: 'PUBLIC',
        status: 'APPROVED',
        reviewComment: 'ok',
        fileSafetyStatus: 'PASSED',
        uploaderId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: privateApprovedId,
        title: 'Private Approved Material',
        description: 'private approved',
        stage: null,
        grade: null,
        subject: null,
        year: null,
        region: null,
        fileKey: 'private/approved.pdf',
        visibility: 'PRIVATE',
        status: 'APPROVED',
        reviewComment: 'ok',
        fileSafetyStatus: 'PASSED',
        uploaderId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: pendingId,
        title: 'Pending Material',
        description: 'pending',
        stage: null,
        grade: null,
        subject: null,
        year: null,
        region: null,
        fileKey: 'pending/file.pdf',
        visibility: 'PUBLIC',
        status: 'PENDING',
        reviewComment: null,
        fileSafetyStatus: 'QUARANTINED',
        uploaderId,
        createdAt: now,
        updatedAt: now,
      },
    );

    return { approvedId, pendingId, privateApprovedId };
  }

  debugDownloads(): DbDownload[] {
    return this.downloads;
  }
}

class MinioServiceMock {
  getSignedDownloadUrl(key: string): string {
    return `http://minio.local/study-connect/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=mock`;
  }

  async uploadObject(): Promise<string> {
    return 'noop';
  }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'task6-secret';

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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? 3000 : address.port;
  const base = `http://127.0.0.1:${port}`;
  const allowedOrigin = 'http://frontend.local:3000';

  function getCookiePair(setCookieHeader: string): string {
    return setCookieHeader.split(';')[0] ?? '';
  }

  function getSetCookieHeaders(response: Response): string[] {
    const withGetSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
    if (typeof withGetSetCookie.getSetCookie === 'function') {
      return withGetSetCookie.getSetCookie();
    }

    const raw = response.headers.get('set-cookie');
    return raw ? [raw] : [];
  }

  function findCookiePair(response: Response, cookieName: string): string {
    const targetPrefix = `${cookieName}=`;
    const matched = getSetCookieHeaders(response)
      .map((cookieLine) => getCookiePair(cookieLine))
      .find((cookiePair) => cookiePair.startsWith(targetPrefix));

    return matched ?? '';
  }

  async function issueCsrfCookie(existingCookies = ''): Promise<{ token: string; cookiePair: string }> {
    const csrfRes = await fetch(`${base}/auth/csrf`, {
      headers: {
        origin: allowedOrigin,
        ...(existingCookies ? { cookie: existingCookies } : {}),
      },
    });
    const csrfBody = (await csrfRes.json()) as { csrfToken: string };
    return {
      token: csrfBody.csrfToken,
      cookiePair: findCookiePair(csrfRes, 'csrf-token'),
    };
  }

  const registerCsrf = await issueCsrfCookie();
  const registerRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: registerCsrf.cookiePair,
      'x-csrf-token': registerCsrf.token,
    },
    body: JSON.stringify({
      email: 'downloader@example.com',
      username: 'downloader',
      password: 'StrongPass123!',
      otpCode: '000000',
    }),
  });
  const registered = (await registerRes.json()) as { user: { id: string } };

  const seeded = prismaMock.seedMaterials(registered.user.id);

  const guestDownload = await fetch(`${base}/materials/${seeded.approvedId}/download`);
  assert(guestDownload.status === 401, `guest download should be 401, got ${guestDownload.status}`);

  const loginCsrf = await issueCsrfCookie();
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: loginCsrf.cookiePair,
      'x-csrf-token': loginCsrf.token,
    },
    body: JSON.stringify({ email: 'downloader@example.com', password: 'StrongPass123!' }),
  });
  const authCookie = findCookiePair(loginRes, 'auth-token');
  assert(loginRes.status === 200, `login should be 200, got ${loginRes.status}`);
  assert(authCookie.length > 0, 'login should set auth-token cookie');

  const approvedRes = await fetch(`${base}/materials/${seeded.approvedId}/download`, {
    headers: { cookie: authCookie },
  });
  assert(approvedRes.status === 200, `approved material download should be 200, got ${approvedRes.status}`);
  const approvedBody = (await approvedRes.json()) as { downloadUrl: string; materialId: string };
  assert(
    approvedBody.downloadUrl.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'),
    'approved material should return signed download URL',
  );
  assert(approvedBody.materialId === seeded.approvedId, 'approved response should keep material id');

  const pendingRes = await fetch(`${base}/materials/${seeded.pendingId}/download`, {
    headers: { cookie: authCookie },
  });
  assert(pendingRes.status === 404, `pending material download should be 404, got ${pendingRes.status}`);

  const privateApprovedRes = await fetch(`${base}/materials/${seeded.privateApprovedId}/download`, {
    headers: { cookie: authCookie },
  });
  assert(
    privateApprovedRes.status === 404,
    `private approved material download should be 404, got ${privateApprovedRes.status}`,
  );

  const downloads = prismaMock.debugDownloads();
  assert(downloads.length === 1, `downloads should only contain one successful record, got ${downloads.length}`);
  assert(
    downloads[0]?.materialId === seeded.approvedId,
    'download record should be created only for approved public material',
  );

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
