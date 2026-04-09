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
      return this.users.find((user) => user.email === where.email) ?? null;
    },
  };

  material = {
    create: async ({
      data,
      select,
    }: {
      data: {
        title: string;
        description?: string;
        stage?: string;
        grade?: string;
        subject?: string;
        year?: number;
        region?: string;
        fileKey: string;
        visibility: 'PUBLIC' | 'PRIVATE';
        status: MaterialStatus;
        reviewComment?: string;
        uploaderId: string;
      };
      select: Record<string, boolean>;
    }) => {
      const now = new Date();
      const material: DbMaterial = {
        id: crypto.randomUUID(),
        title: data.title,
        description: data.description ?? null,
        stage: data.stage ?? null,
        grade: data.grade ?? null,
        subject: data.subject ?? null,
        year: data.year ?? null,
        region: data.region ?? null,
        fileKey: data.fileKey,
        visibility: data.visibility,
        status: data.status,
        reviewComment: data.reviewComment ?? null,
        uploaderId: data.uploaderId,
        createdAt: now,
        updatedAt: now,
      };
      this.materials.push(material);
      return this.pick(material, select);
    },

    findMany: async ({
      where,
      orderBy,
      skip,
      take,
      select,
    }: {
      where: { status: MaterialStatus };
      orderBy: { createdAt: 'desc' | 'asc' };
      skip: number;
      take: number;
      select: Record<string, boolean>;
    }) => {
      const filtered = this.materials.filter((m) => m.status === where.status);
      const ordered = [...filtered].sort((a, b) =>
        orderBy.createdAt === 'desc'
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime(),
      );
      return ordered.slice(skip, skip + take).map((m) => this.pick(m, select));
    },

    count: async ({ where }: { where: { status: MaterialStatus } }) => {
      return this.materials.filter((m) => m.status === where.status).length;
    },

    update: async ({
      where,
      data,
      select,
    }: {
      where: { id: string };
      data: { status: MaterialStatus; reviewComment: string };
      select: Record<string, boolean>;
    }) => {
      const material = this.materials.find((m) => m.id === where.id);
      if (!material) {
        throw new Error('not found');
      }
      material.status = data.status;
      material.reviewComment = data.reviewComment;
      material.updatedAt = new Date();
      return this.pick(material, select);
    },
  };

  setUserRole(email: string, role: UserRole): void {
    const user = this.users.find((u) => u.email === email);
    if (user) {
      user.role = role;
    }
  }

  debugMaterialById(id: string): DbMaterial | null {
    return this.materials.find((m) => m.id === id) ?? null;
  }

  private pick(material: DbMaterial, select: Record<string, boolean>) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      if (select[key]) {
        out[key] = (material as Record<string, unknown>)[key];
      }
    }
    return out;
  }
}

class MinioServiceMock {
  async uploadObject(key: string): Promise<string> {
    return `study-connect/${key}`;
  }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = 'task4-secret';
  process.env.MAX_UPLOAD_SIZE_MB = '50';

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

  // register user + admin
  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', username: 'user1', password: 'StrongPass123!' }),
  });
  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', username: 'admin1', password: 'StrongPass123!' }),
  });

  prismaMock.setUserRole('admin@example.com', 'ADMIN');

  const userLogin = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'StrongPass123!' }),
  });
  const userToken = ((await userLogin.json()) as { accessToken: string }).accessToken;

  const adminLogin = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'StrongPass123!' }),
  });
  const adminToken = ((await adminLogin.json()) as { accessToken: string }).accessToken;

  const forbiddenRes = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
    headers: { authorization: `Bearer ${userToken}` },
  });
  console.log('user pending list status:', forbiddenRes.status);

  async function uploadOne(title: string): Promise<string> {
    const form = new FormData();
    form.set('title', title);
    form.set('description', `${title} description`);
    form.set('visibility', 'PUBLIC');
    form.set('file', new Blob(['data'], { type: 'text/plain' }), `${title}.txt`);

    const res = await fetch(`${base}/materials`, {
      method: 'POST',
      headers: { authorization: `Bearer ${userToken}` },
      body: form,
    });
    const body = (await res.json()) as { id: string };
    return body.id;
  }

  const materialApproveId = await uploadOne('to-approve');
  const materialRejectId = await uploadOne('to-reject');

  const pendingRes = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const pendingText = await pendingRes.text();
  console.log('admin pending list status:', pendingRes.status);
  console.log('admin pending list body:', pendingText);

  const approveRes = await fetch(`${base}/admin/materials/${materialApproveId}/approve`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const approveText = await approveRes.text();
  console.log('approve status:', approveRes.status);
  console.log('approve body:', approveText);

  const rejectRes = await fetch(`${base}/admin/materials/${materialRejectId}/reject`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason: 'Spam content' }),
  });
  const rejectText = await rejectRes.text();
  console.log('reject status:', rejectRes.status);
  console.log('reject body:', rejectText);

  console.log('db approved material:', JSON.stringify(prismaMock.debugMaterialById(materialApproveId)));
  console.log('db rejected material:', JSON.stringify(prismaMock.debugMaterialById(materialRejectId)));

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
