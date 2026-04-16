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
    findUnique: async ({ where }: { where: { email: string } }) => {
      return this.users.find((u) => u.email === where.email) ?? null;
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

  const registerRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'downloader@example.com',
      username: 'downloader',
      password: 'StrongPass123!',
    }),
  });
  const registered = (await registerRes.json()) as { id: string };

  const seeded = prismaMock.seedMaterials(registered.id);

  const guestDownload = await fetch(`${base}/materials/${seeded.approvedId}/download`);
  assert(guestDownload.status === 401, `guest download should be 401, got ${guestDownload.status}`);

  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'downloader@example.com', password: 'StrongPass123!' }),
  });
  const loginBody = (await loginRes.json()) as { accessToken: string };

  const approvedRes = await fetch(`${base}/materials/${seeded.approvedId}/download`, {
    headers: { authorization: `Bearer ${loginBody.accessToken}` },
  });
  assert(approvedRes.status === 200, `approved material download should be 200, got ${approvedRes.status}`);
  const approvedBody = (await approvedRes.json()) as { downloadUrl: string; materialId: string };
  assert(
    approvedBody.downloadUrl.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'),
    'approved material should return signed download URL',
  );
  assert(approvedBody.materialId === seeded.approvedId, 'approved response should keep material id');

  const pendingRes = await fetch(`${base}/materials/${seeded.pendingId}/download`, {
    headers: { authorization: `Bearer ${loginBody.accessToken}` },
  });
  assert(pendingRes.status === 404, `pending material download should be 404, got ${pendingRes.status}`);

  const privateApprovedRes = await fetch(`${base}/materials/${seeded.privateApprovedId}/download`, {
    headers: { authorization: `Bearer ${loginBody.accessToken}` },
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
