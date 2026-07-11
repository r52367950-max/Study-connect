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
  uploaderId: string;
  createdAt: Date;
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
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      return this.users.find((user) =>
        (where.email !== undefined && user.email === where.email) ||
        (where.id !== undefined && user.id === where.id),
      ) ?? null;
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
        status: 'PENDING' | 'APPROVED' | 'REJECTED';
        uploaderId: string;
      };
      select: {
        id?: boolean;
        title?: boolean;
        description?: boolean;
        stage?: boolean;
        grade?: boolean;
        subject?: boolean;
        year?: boolean;
        region?: boolean;
        fileKey?: boolean;
        visibility?: boolean;
        status?: boolean;
        uploaderId?: boolean;
        createdAt?: boolean;
      };
    }) => {
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
        uploaderId: data.uploaderId,
        createdAt: new Date(),
      };

      this.materials.push(material);

      return {
        ...(select.id ? { id: material.id } : {}),
        ...(select.title ? { title: material.title } : {}),
        ...(select.description ? { description: material.description } : {}),
        ...(select.stage ? { stage: material.stage } : {}),
        ...(select.grade ? { grade: material.grade } : {}),
        ...(select.subject ? { subject: material.subject } : {}),
        ...(select.year ? { year: material.year } : {}),
        ...(select.region ? { region: material.region } : {}),
        ...(select.fileKey ? { fileKey: material.fileKey } : {}),
        ...(select.visibility ? { visibility: material.visibility } : {}),
        ...(select.status ? { status: material.status } : {}),
        ...(select.uploaderId ? { uploaderId: material.uploaderId } : {}),
        ...(select.createdAt ? { createdAt: material.createdAt } : {}),
      };
    },
  };

  debugLatestMaterial(): DbMaterial | null {
    return this.materials.at(-1) ?? null;
  }
}

class MinioServiceMock {
  private readonly objects = new Map<string, Buffer>();

  async uploadObject(key: string, payload: Buffer): Promise<string> {
    this.objects.set(key, payload);
    return `study-connect/${key}`;
  }

  debugObjectCount(): number {
    return this.objects.size;
  }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

  process.env.AUTH_OTP_TEST_BYPASS = process.env.AUTH_OTP_TEST_BYPASS ?? 'true';
  process.env.MAX_UPLOAD_SIZE_MB = process.env.MAX_UPLOAD_SIZE_MB ?? '50';

  const prismaMock = new PrismaServiceMock();
  const minioMock = new MinioServiceMock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(MinioService)
    .useValue(minioMock)
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
      email: 'uploader@example.com',
      username: 'uploader',
      password: 'StrongPass123!',
      otpCode: '000000',
    }),
  });

  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'uploader@example.com',
      password: 'StrongPass123!',
    }),
  });
  const loginJson = (await loginRes.json()) as { accessToken: string };

  const form = new FormData();
  form.set('title', 'Task3 Upload Demo');
  form.set('description', 'demo file upload');
  form.set('visibility', 'PUBLIC');
  form.set('file', new Blob(['hello material'], { type: 'text/plain' }), 'demo.txt');

  const uploadRes = await fetch(`${base}/materials`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${loginJson.accessToken}`,
    },
    body: form,
  });
  const uploadBody = await uploadRes.text();

  console.log('upload status:', uploadRes.status);
  console.log('upload body:', uploadBody);


  const badTypeForm = new FormData();
  badTypeForm.set('title', 'Bad Type');
  badTypeForm.set('file', new Blob(['MZ'], { type: 'application/octet-stream' }), 'bad.exe');

  const badTypeRes = await fetch(`${base}/materials`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${loginJson.accessToken}`,
    },
    body: badTypeForm,
  });
  console.log('bad type status:', badTypeRes.status);

  process.env.MAX_UPLOAD_SIZE_MB = '1';
  const tooLargeForm = new FormData();
  tooLargeForm.set('title', 'Too Large');
  tooLargeForm.set(
    'file',
    new Blob([Buffer.alloc(2 * 1024 * 1024, 'a')], { type: 'text/plain' }),
    'large.txt',
  );

  const tooLargeRes = await fetch(`${base}/materials`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${loginJson.accessToken}`,
    },
    body: tooLargeForm,
  });
  const tooLargeBody = await tooLargeRes.text();
  console.log('too large status:', tooLargeRes.status);
  console.log('too large body:', tooLargeBody);

  const latest = prismaMock.debugLatestMaterial();
  console.log('db latest material:', JSON.stringify(latest));
  console.log('minio object count:', minioMock.debugObjectCount());

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  // Force-exit: a failure skips app.close(), and the still-listening HTTP server
  // would keep the process (and min-all / CI) hanging instead of failing fast.
  process.exit(1);
});
