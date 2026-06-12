/**
 * perf-bench: end-to-end HTTP latency / throughput / payload-size benchmark.
 *
 * Runs against an ALREADY RUNNING server (start it separately) plus a seeded
 * PostgreSQL database. This is a manual evidence tool for performance work —
 * it is NOT part of the CI gates.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 \
 *   DATABASE_URL=postgresql://postgres@localhost:5432/study_connect?schema=public \
 *   BENCH_LABEL=before BENCH_OUT=artifacts/perf-before.json \
 *   ts-node scripts/perf-bench.ts
 *
 * The server should run with AUTH_OTP_TEST_BYPASS=true (non-production) so the
 * bench can register its probe user, and with RATE_LIMIT_GLOBAL_LIMIT raised so
 * the global limiter does not throttle the loop. Per-route limits are respected
 * by keeping per-endpoint sample counts below their windows.
 */
import { PrismaClient } from '@prisma/client';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const BASE_URL = new URL(process.env.BASE_URL ?? 'http://localhost:3000');
const LABEL = process.env.BENCH_LABEL ?? 'run';
const OUT = process.env.BENCH_OUT ?? '';
const ORIGIN = process.env.BENCH_ORIGIN ?? 'http://localhost:3001';

type Sample = { ms: number; bytes: number; decodedBytes: number; status: number; encoding: string };

type EndpointStats = {
  name: string;
  path: string;
  samples: number;
  concurrency: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  rps: number;
  bodyBytes: number;
  decodedBodyBytes: number;
  contentEncoding: string;
};

class CookieJar {
  private readonly jar = new Map<string, string>();

  absorb(headers: http.IncomingHttpHeaders): void {
    const setCookie = headers['set-cookie'];
    if (!setCookie) return;
    for (const line of setCookie) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) {
        this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }
  }

  header(): string {
    return Array.from(this.jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  get(name: string): string | undefined {
    return this.jar.get(name);
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function requestOnce(opts: {
  agent: http.Agent;
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  jar?: CookieJar;
}): Promise<Sample & { json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const req = http.request(
      {
        agent: opts.agent,
        host: BASE_URL.hostname,
        port: BASE_URL.port,
        method: opts.method ?? 'GET',
        path: opts.path,
        headers: {
          'accept-encoding': 'gzip',
          // The strict CORS delegate rejects requests without an Origin header,
          // so every bench request identifies as the allow-listed frontend origin.
          origin: ORIGIN,
          ...(opts.jar ? { cookie: opts.jar.header() } : {}),
          ...(opts.body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(opts.body) } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - started) / 1e6;
          opts.jar?.absorb(res.headers);
          const raw = Buffer.concat(chunks);
          const encoding = res.headers['content-encoding'] ?? 'identity';
          const decoded = encoding === 'gzip' ? zlib.gunzipSync(raw) : raw;
          resolve({
            ms,
            bytes: raw.length,
            decodedBytes: decoded.length,
            status: res.statusCode ?? 0,
            encoding,
            json: () => JSON.parse(decoded.toString('utf8') || 'null'),
          });
        });
      },
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function runEndpoint(input: {
  name: string;
  path: string;
  warmup: number;
  samples: number;
  concurrency: number;
  headers?: Record<string, string>;
}): Promise<EndpointStats> {
  const agent = new http.Agent({ keepAlive: true, maxSockets: input.concurrency });

  for (let i = 0; i < input.warmup; i += 1) {
    await requestOnce({ agent, path: input.path, headers: input.headers });
  }

  const latencies: number[] = [];
  let errors = 0;
  let bodyBytes = 0;
  let decodedBodyBytes = 0;
  let contentEncoding = 'identity';
  let next = 0;
  const startedAll = process.hrtime.bigint();

  async function worker(): Promise<void> {
    while (next < input.samples) {
      next += 1;
      const sample = await requestOnce({ agent, path: input.path, headers: input.headers });
      if (sample.status >= 400) {
        errors += 1;
        if (errors <= 3) {
          console.error(`  [${input.name}] HTTP ${sample.status} on ${input.path}`);
        }
      }
      latencies.push(sample.ms);
      bodyBytes = sample.bytes;
      decodedBodyBytes = sample.decodedBytes;
      contentEncoding = sample.encoding;
    }
  }

  await Promise.all(Array.from({ length: input.concurrency }, () => worker()));
  const totalSec = Number(process.hrtime.bigint() - startedAll) / 1e9;
  agent.destroy();

  latencies.sort((a, b) => a - b);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  return {
    name: input.name,
    path: input.path,
    samples: latencies.length,
    concurrency: input.concurrency,
    errors,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    mean,
    rps: latencies.length / totalSec,
    bodyBytes,
    decodedBodyBytes,
    contentEncoding,
  };
}

/** Register + fully onboard a probe user wired for the heaviest recommend path (phase-3). */
async function setupProbeUser(prisma: PrismaClient): Promise<CookieJar> {
  const jar = new CookieJar();
  const agent = new http.Agent({ keepAlive: true });
  const suffix = Date.now().toString(36);
  const email = `bench-${suffix}@example.com`;
  const username = `bench${suffix}`;

  const csrf = await requestOnce({ agent, path: '/auth/csrf', jar });
  const csrfToken = (csrf.json() as { csrfToken?: string })?.csrfToken ?? jar.get('csrf-token') ?? '';

  const register = await requestOnce({
    agent,
    method: 'POST',
    path: '/auth/register',
    jar,
    headers: { origin: ORIGIN, 'x-csrf-token': csrfToken },
    body: JSON.stringify({ email, username, password: 'BenchPass123!', otpCode: '000000' }),
  });
  if (register.status !== 200 && register.status !== 201) {
    throw new Error(`probe user registration failed: HTTP ${register.status} ${JSON.stringify(register.json())}`);
  }

  // Promote the probe user to the heaviest recommendation path (phase-3):
  // onboarded profile + dense school + opt-in + >= 20 distinct viewed materials.
  const denseSchool = await prisma.user.groupBy({
    by: ['schoolId'],
    where: { schoolId: { not: null }, onboardedAt: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { schoolId: 'desc' } },
    take: 1,
  });
  const schoolId = denseSchool[0]?.schoolId ?? null;

  await prisma.user.update({
    where: { username },
    data: {
      onboardedAt: new Date(),
      subjects: ['数学', '物理'],
      grades: ['高三'],
      stages: ['高中'],
      city: '北京',
      viewedKinds: ['习题', '真题'],
      collaborativeOptIn: true,
      schoolId,
    },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { username }, select: { id: true } });
  const viewed = await prisma.material.findMany({
    where: { status: 'APPROVED', visibility: 'PUBLIC' },
    select: { id: true, kind: true },
    take: 25,
    orderBy: { createdAt: 'desc' },
  });
  await prisma.viewEvent.createMany({
    data: viewed.map((m) => ({ userId: user.id, materialId: m.id, kind: m.kind, dwellMs: 30_000 })),
  });

  agent.destroy();
  return jar;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const hot = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT m.id FROM materials m
    WHERE m.status = 'APPROVED' AND m.visibility = 'PUBLIC'
      AND (m.file_safety_status = 'PASSED' OR m.file_safety_status IS NULL)
    ORDER BY (SELECT COUNT(*) FROM downloads d WHERE d.material_id = m.id) DESC
    LIMIT 1`;
  const hotId = hot[0]?.id;
  if (!hotId) throw new Error('no approved material found — seed the DB first');

  const jar = await setupProbeUser(prisma);
  const authHeaders = { cookie: jar.header() };

  const suite: Array<Parameters<typeof runEndpoint>[0]> = [
    { name: 'health', path: '/health', warmup: 50, samples: 300, concurrency: 8 },
    { name: 'materials-latest', path: '/materials?page=1&pageSize=10', warmup: 30, samples: 300, concurrency: 8 },
    { name: 'materials-latest-p50', path: '/materials?page=50&pageSize=10', warmup: 10, samples: 100, concurrency: 4 },
    { name: 'materials-downloads-sort', path: '/materials?page=1&pageSize=10&sort=downloads', warmup: 10, samples: 150, concurrency: 4 },
    { name: 'materials-rating-sort', path: '/materials?page=1&pageSize=10&sort=rating', warmup: 10, samples: 150, concurrency: 4 },
    { name: 'materials-keyword', path: `/materials?q=${encodeURIComponent('数学 模拟')}&page=1&pageSize=10`, warmup: 10, samples: 150, concurrency: 4 },
    { name: 'materials-keyword-filtered', path: `/materials?q=${encodeURIComponent('函数与导数')}&subject=${encodeURIComponent('数学')}&pageSize=10`, warmup: 10, samples: 150, concurrency: 4 },
    { name: 'material-detail', path: `/materials/${hotId}`, warmup: 30, samples: 300, concurrency: 8 },
    { name: 'material-ratings', path: `/materials/${hotId}/ratings?page=1&pageSize=10`, warmup: 30, samples: 300, concurrency: 8 },
    { name: 'schools-search', path: `/schools?q=di1&limit=10`, warmup: 5, samples: 50, concurrency: 2 },
    { name: 'recommend-phase3', path: '/materials/recommend?limit=6', warmup: 5, samples: 50, concurrency: 2, headers: authHeaders },
  ];

  const results: EndpointStats[] = [];
  for (const endpoint of suite) {
    process.stdout.write(`running ${endpoint.name} ...\n`);
    results.push(await runEndpoint(endpoint));
  }

  const pad = (v: string, w: number) => v.padEnd(w);
  const num = (v: number) => v.toFixed(1).padStart(8);
  console.info(`\n=== perf-bench [${LABEL}] base=${BASE_URL.href} node=${process.version} ===`);
  console.info(
    pad('endpoint', 28) + 'p50(ms)  p95(ms)  p99(ms) mean(ms)      rps   wire-B  json-B  enc     err',
  );
  for (const r of results) {
    console.info(
      pad(r.name, 28) +
        num(r.p50) +
        ' ' +
        num(r.p95) +
        ' ' +
        num(r.p99) +
        ' ' +
        num(r.mean) +
        ' ' +
        num(r.rps) +
        ' ' +
        String(r.bodyBytes).padStart(8) +
        ' ' +
        String(r.decodedBodyBytes).padStart(7) +
        '  ' +
        pad(r.contentEncoding, 8) +
        String(r.errors).padStart(3),
    );
  }

  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(
      OUT,
      JSON.stringify({ label: LABEL, base: BASE_URL.href, node: process.version, at: new Date().toISOString(), results }, null, 2),
    );
    console.info(`\nwrote ${OUT}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
