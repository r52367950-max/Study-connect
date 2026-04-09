/// <reference path="../src/types/express.d.ts" />
import { ValidationPipe } from '@nestjs/common';
import { MaterialStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra';

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
  fileKey: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: MaterialStatus;
  reviewComment: string | null;
  uploaderId: string;
  createdAt: Date;
  updatedAt: Date;
};

class PrismaServiceMock {
  private users: DbUser[] = [];
  private materials: DbMaterial[] = [];

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
    count: async ({ where }: { where: { status: MaterialStatus } }) => {
      return this.materials.filter((m) => m.status === where.status).length;
    },
    findMany: async ({
      where,
      skip,
      take,
      select,
    }: {
      where: { status: MaterialStatus };
      orderBy: { createdAt: 'asc' };
      skip: number;
      take: number;
      select: {
        id?: boolean;
        title?: boolean;
        status?: boolean;
        uploaderId?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
        reviewComment?: boolean;
      };
    }) => {
      const filtered = this.materials
        .filter((m) => m.status === where.status)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(skip, skip + take);

      return filtered.map((m) => ({
        ...(select.id ? { id: m.id } : {}),
        ...(select.title ? { title: m.title } : {}),
        ...(select.status ? { status: m.status } : {}),
        ...(select.uploaderId ? { uploaderId: m.uploaderId } : {}),
        ...(select.createdAt ? { createdAt: m.createdAt } : {}),
        ...(select.updatedAt ? { updatedAt: m.updatedAt } : {}),
        ...(select.reviewComment ? { reviewComment: m.reviewComment } : {}),
      }));
    },
    update: async ({
      where,
      data,
      select,
    }: {
      where: { id: string };
      data: { status?: MaterialStatus; reviewComment?: string };
      select: { id?: boolean; status?: boolean; reviewComment?: boolean; updatedAt?: boolean };
    }) => {
      const material = this.materials.find((m) => m.id === where.id);
      if (!material) {
        const err = new Error('not found') as Error & { code?: string };
        err.code = 'P2025';
        throw err;
      }

      if (data.status) {
        material.status = data.status;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'reviewComment')) {
        material.reviewComment = data.reviewComment ?? null;
      }
      material.updatedAt = new Date();

      return {
        ...(select.id ? { id: material.id } : {}),
        ...(select.status ? { status: material.status } : {}),
        ...(select.reviewComment ? { reviewComment: material.reviewComment } : {}),
        ...(select.updatedAt ? { updatedAt: material.updatedAt } : {}),
      };
    },
  };

  $transaction = async <T>(operations: Promise<T>[]): Promise<T[]> => Promise.all(operations);

  debugSetRole(email: string, role: 'USER' | 'ADMIN'): void {
    const user = this.users.find((u) => u.email === email);
    if (user) user.role = role;
  }

  debugGetUserByEmail(email: string): DbUser | null {
    return this.users.find((u) => u.email === email) ?? null;
  }

  debugAddPendingMaterial(uploaderId: string, title: string): string {
    const id = crypto.randomUUID();
    const now = new Date();
    this.materials.push({
      id,
      title,
      description: null,
      fileKey: `demo/${id}.txt`,
      visibility: 'PUBLIC',
      status: MaterialStatus.PENDING,
      reviewComment: null,
      uploaderId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  debugGetMaterial(id: string): DbMaterial | null {
    return this.materials.find((m) => m.id === id) ?? null;
  }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

  const prismaMock = new PrismaServiceMock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? 3000 : address.port;
  const base = `http://127.0.0.1:${port}`;

  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      username: 'normalUser',
      password: 'StrongPass123!',
    }),
  });

  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      username: 'adminUser',
      password: 'StrongPass123!',
    }),
  });

  prismaMock.debugSetRole('admin@example.com', 'ADMIN');

  const userObj = prismaMock.debugGetUserByEmail('user@example.com');
  if (!userObj) throw new Error('user seed failed');

  const materialA = prismaMock.debugAddPendingMaterial(userObj.id, 'Pending A');
  const materialB = prismaMock.debugAddPendingMaterial(userObj.id, 'Pending B');

  const userLoginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'StrongPass123!',
    }),
  });
  const userLoginJson = (await userLoginRes.json()) as { accessToken: string };

  const adminLoginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'StrongPass123!',
    }),
  });
  const adminLoginJson = (await adminLoginRes.json()) as { accessToken: string };

  const userPendingRes = await fetch(`${base}/admin/materials/pending?page=1&limit=1`, {
    headers: { authorization: `Bearer ${userLoginJson.accessToken}` },
  });
  const userPendingBody = await userPendingRes.text();
  console.log('user pending status:', userPendingRes.status, 'body:', userPendingBody);

  const adminPendingRes = await fetch(`${base}/admin/materials/pending?page=1&limit=1`, {
    headers: { authorization: `Bearer ${adminLoginJson.accessToken}` },
  });
  const adminPendingBody = await adminPendingRes.text();
  console.log('admin pending status:', adminPendingRes.status, 'body:', adminPendingBody);

  const approveRes = await fetch(`${base}/admin/materials/${materialA}/approve`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminLoginJson.accessToken}` },
  });
  console.log('approve status:', approveRes.status, 'body:', await approveRes.text());
  console.log('db materialA:', JSON.stringify(prismaMock.debugGetMaterial(materialA)));

  const rejectRes = await fetch(`${base}/admin/materials/${materialB}/reject`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminLoginJson.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason: 'Contains incorrect or harmful content.' }),
  });
  console.log('reject status:', rejectRes.status, 'body:', await rejectRes.text());
  console.log('db materialB:', JSON.stringify(prismaMock.debugGetMaterial(materialB)));

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
