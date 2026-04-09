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
  fileKey: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type DbDownload = {
  id: string;
  userId: string;
  materialId: string;
  createdAt: Date;
};

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
    findFirst: async ({ where, select }: { where: { id: string; status: 'APPROVED' }; select: { id: boolean; fileKey: boolean } }) => {
      const material = this.materials.find((item) => item.id === where.id && item.status === where.status);
      if (!material) {
        return null;
      }
      return {
        ...(select.id ? { id: material.id } : {}),
        ...(select.fileKey ? { fileKey: material.fileKey } : {}),
      };
    },
  };

  download = {
    create: async ({ data }: { data: { userId: string; materialId: string } }) => {
      const row: DbDownload = {
        id: crypto.randomUUID(),
        userId: data.userId,
        materialId: data.materialId,
        createdAt: new Date(),
      };
      this.downloads.push(row);
      return row;
    },
  };

  seedMaterials() {
    const approvedId = crypto.randomUUID();
    const pendingId = crypto.randomUUID();

    this.materials.push(
      { id: approvedId, fileKey: 'materials/approved.pdf', status: 'APPROVED' },
      { id: pendingId, fileKey: 'materials/pending.pdf', status: 'PENDING' },
    );

    return { approvedId, pendingId };
  }

  snapshotDownloads() {
    return this.downloads;
  }
}

class MinioServiceMock {
  getObjectUrl(key: string): string {
    return `http://minio.local/study-connect/${key}`;
  }

  async uploadObject(): Promise<string> {
    return 'noop';
  }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'task6-secret';

  const prismaMock = new PrismaServiceMock();
  const ids = prismaMock.seedMaterials();

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

  const guestRes = await fetch(`${base}/materials/${ids.approvedId}/download`);
  const guestBody = await guestRes.text();
  console.log('guest download status:', guestRes.status);
  console.log('guest download body:', guestBody);

  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'downloader@example.com',
      username: 'downloader',
      password: 'StrongPass123!',
    }),
  });

  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'downloader@example.com',
      password: 'StrongPass123!',
    }),
  });
  const loginBody = (await loginRes.json()) as { accessToken: string };

  const approvedRes = await fetch(`${base}/materials/${ids.approvedId}/download`, {
    headers: { authorization: `Bearer ${loginBody.accessToken}` },
  });
  const approvedBody = await approvedRes.text();
  console.log('approved download status:', approvedRes.status);
  console.log('approved download body:', approvedBody);

  const rejectedRes = await fetch(`${base}/materials/${ids.pendingId}/download`, {
    headers: { authorization: `Bearer ${loginBody.accessToken}` },
  });
  const rejectedBody = await rejectedRes.text();
  console.log('pending download status:', rejectedRes.status);
  console.log('pending download body:', rejectedBody);

  console.log('downloads snapshot:', JSON.stringify(prismaMock.snapshotDownloads()));

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
