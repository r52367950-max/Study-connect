/**
 * bench-hotpath: micro-benchmarks for the CPU/allocation hot paths touched by the
 * security + performance pass. Manual evidence tool, not part of CI.
 *
 *   ts-node scripts/bench-hotpath.ts
 *
 * Each case re-implements the *previous* code inline (marked OLD) and compares it
 * against the shipped implementation, on the same input, in the same process.
 */
import { createHmac, createHash } from 'node:crypto';
import { assertUploadFileSecurity } from '../src/modules/materials/upload-security.util';
import { buildZip } from './support/build-zip';

const MB = 1024 * 1024;

type Result = { label: string; ms: number; heapMb: number; note?: string };
const results: Result[] = [];

function bench(label: string, iterations: number, fn: () => void, note?: string): Result {
  fn(); // warm
  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  let peak = heapBefore;
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) {
    fn();
    const used = process.memoryUsage().heapUsed;
    if (used > peak) peak = used;
  }
  const ms = Number(process.hrtime.bigint() - start) / 1e6 / iterations;
  const result = { label, ms, heapMb: (peak - heapBefore) / MB, note };
  results.push(result);
  return result;
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

function report(a: Result, b: Result) {
  const speedup = a.ms / b.ms;
  console.log(`  OLD ${a.label.padEnd(34)} ${a.ms.toFixed(3).padStart(9)} ms/op   peak heap +${a.heapMb.toFixed(1)} MB`);
  console.log(`  NEW ${b.label.padEnd(34)} ${b.ms.toFixed(3).padStart(9)} ms/op   peak heap +${b.heapMb.toFixed(1)} MB`);
  console.log(`  -> ${speedup.toFixed(1)}x faster`);
}

// ─── 1. DOCX validation ──────────────────────────────────────────────────────
function oldZipCheck(payload: Buffer): void {
  if (payload.length < 22) throw new Error('INVALID_ZIP_STRUCTURE');
  const hasLocal = payload.includes(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const hasCentral = payload.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const hasEocd = payload.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (!hasLocal || !hasCentral || !hasEocd) throw new Error('INVALID_ZIP_STRUCTURE');
}

function oldDocxCheck(payload: Buffer): void {
  oldZipCheck(payload);
  const zipView = payload.toString('latin1'); // full-size string allocation
  if (!zipView.includes('[Content_Types].xml') || !zipView.includes('word/')) {
    throw new Error('INVALID_DOCX_STRUCTURE');
  }
}

function benchDocx(sizeMb: number) {
  const filler = Buffer.alloc(sizeMb * MB, 0x41);
  const docx = buildZip([
    { name: '[Content_Types].xml', content: '<Types/>' },
    { name: 'word/document.xml', content: '<document/>' },
    { name: 'word/media/blob.bin', content: filler },
  ]);
  const file = {
    originalname: 'big.docx',
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: docx,
    size: docx.length,
  };

  section(`DOCX validation, ${sizeMb}MB archive (${(docx.length / MB).toFixed(1)}MB payload)`);
  const iterations = sizeMb >= 40 ? 5 : 20;
  const oldResult = bench('includes x3 + latin1 string', iterations, () => oldDocxCheck(docx));
  const newResult = bench('EOCD + central directory', iterations, () => assertUploadFileSecurity(file));
  report(oldResult, newResult);
}

// ─── 2. EICAR scan in the file scanner ───────────────────────────────────────
function benchEicar(sizeMb: number) {
  const sig = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const sigBuf = Buffer.from(sig, 'ascii');
  const payload = Buffer.alloc(sizeMb * MB, 0x20);

  section(`EICAR signature scan, ${sizeMb}MB payload`);
  const oldResult = bench('buffer.toString("utf8") + includes', 5, () => {
    payload.toString('utf8').includes(sig);
  });
  const newResult = bench('buffer.includes(Buffer)', 5, () => {
    payload.includes(sigBuf);
  });
  report(oldResult, newResult);
}

// ─── 3. PDF %%EOF trailer search ─────────────────────────────────────────────
function benchPdf(sizeMb: number) {
  const marker = Buffer.from('%%EOF', 'ascii');
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.7\n', 'ascii'),
    Buffer.alloc(sizeMb * MB, 0x41),
    Buffer.from('\n%%EOF', 'ascii'),
  ]);

  section(`PDF %%EOF search, ${sizeMb}MB payload`);
  const oldResult = bench('scan whole buffer', 20, () => {
    pdf.includes(marker);
  });
  const newResult = bench('scan last 4KB only', 20, () => {
    pdf.subarray(Math.max(0, pdf.length - 4096)).includes(marker);
  });
  report(oldResult, newResult);
}

// ─── 4. UTF-8 text validation ────────────────────────────────────────────────
// NOTE: this one is a deliberate trade, not a speedup. Chunked decoding costs a
// little more CPU but never materialises a payload-sized string, which is what
// matters when several large uploads are validated concurrently.
function benchText(sizeMb: number) {
  const payload = Buffer.alloc(sizeMb * MB, 0x61);

  /** Peak heap while the decoded value is still reachable. */
  function liveHeapMb(fn: () => unknown): number {
    if (global.gc) global.gc();
    const before = process.memoryUsage().heapUsed;
    const retained = fn();
    const after = process.memoryUsage().heapUsed;
    void retained; // keep alive across the measurement
    return (after - before) / MB;
  }

  const decodeWhole = () => new TextDecoder('utf-8', { fatal: true }).decode(payload);
  const decodeChunked = () => {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let lastChunk = '';
    for (let offset = 0; offset < payload.length; offset += 65536) {
      lastChunk = decoder.decode(payload.subarray(offset, Math.min(offset + 65536, payload.length)), {
        stream: true,
      });
    }
    decoder.decode();
    return lastChunk;
  };

  section(`UTF-8 text validation, ${sizeMb}MB payload (CPU/memory trade)`);
  const oldResult = bench('one decode of whole payload', 10, () => {
    decodeWhole();
  });
  const newResult = bench('streamed 64KB chunks', 10, () => {
    decodeChunked();
  });
  const oldHeap = liveHeapMb(decodeWhole);
  const newHeap = liveHeapMb(decodeChunked);

  console.log(`  OLD one decode of whole payload    ${oldResult.ms.toFixed(1).padStart(7)} ms/op   live string +${oldHeap.toFixed(1)} MB`);
  console.log(`  NEW streamed 64KB chunks           ${newResult.ms.toFixed(1).padStart(7)} ms/op   live string +${newHeap.toFixed(2)} MB`);
  console.log(
    `  -> CPU ${((newResult.ms / oldResult.ms - 1) * 100).toFixed(0)}% slower, ` +
      `transient allocation ${(oldHeap / Math.max(newHeap, 0.0001)).toFixed(0)}x smaller`,
  );
}

// ─── 5. CSRF origin allow-list parsing (per state-changing request) ──────────
function benchCsrfOrigins() {
  const raw = 'https://a.example.com,https://b.example.com,https://c.example.com,https://d.example.com';

  function parseEveryTime(): boolean {
    const list = raw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
      .map((o) => {
        try {
          return new URL(o).origin;
        } catch {
          return o;
        }
      });
    return list.includes('https://c.example.com');
  }

  let cache: { raw: string; origins: Set<string> } | null = null;
  function parseCached(): boolean {
    if (cache?.raw !== raw) {
      cache = {
        raw,
        origins: new Set(
          raw
            .split(',')
            .map((o) => o.trim())
            .filter((o) => o.length > 0)
            .map((o) => {
              try {
                return new URL(o).origin;
              } catch {
                return o;
              }
            }),
        ),
      };
    }
    return cache.origins.has('https://c.example.com');
  }

  section('CSRF origin allow-list check (per state-changing request)');
  const oldResult = bench('split + URL parse + linear scan', 200_000, () => {
    parseEveryTime();
  });
  const newResult = bench('cached Set lookup', 200_000, () => {
    parseCached();
  });
  report(oldResult, newResult);
}

// ─── 6. SigV4 signing key derivation (per signed request / presigned URL) ────
function benchSigningKey() {
  const secret = 'minio-secret-key-value';
  const region = 'us-east-1';

  function derive(dateStamp: string): Buffer {
    const kDate = createHmac('sha256', `AWS4${secret}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }

  let cache: { dateStamp: string; key: Buffer } | null = null;
  function deriveCached(dateStamp: string): Buffer {
    if (cache?.dateStamp !== dateStamp) cache = { dateStamp, key: derive(dateStamp) };
    return cache.key;
  }

  section('SigV4 signing key (per signed request / presigned URL)');
  const oldResult = bench('4 chained HMACs every call', 200_000, () => {
    derive('20260725');
  });
  const newResult = bench('cached per UTC day', 200_000, () => {
    deriveCached('20260725');
  });
  report(oldResult, newResult);
}

// ─── 7. Redis script transport size ──────────────────────────────────────────
function benchRedisPayload() {
  const counterScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;
  const sha = createHash('sha1').update(counterScript).digest('hex');
  const key = 'study-connect:rate-limit:counter:global-basic:ip:203.0.113.10';

  function encode(args: Array<string | number>): string {
    return `*${args.length}\r\n${args
      .map((a) => {
        const t = String(a);
        return `$${Buffer.byteLength(t)}\r\n${t}\r\n`;
      })
      .join('')}`;
  }

  const evalBytes = Buffer.byteLength(encode(['EVAL', counterScript, 1, key, 60000]));
  const evalshaBytes = Buffer.byteLength(encode(['EVALSHA', sha, 1, key, 60000]));

  section('Redis rate-limit command size (every rate-limited request)');
  console.log(`  OLD EVAL  (ships script body)         ${String(evalBytes).padStart(5)} bytes/request`);
  console.log(`  NEW EVALSHA (ships 40-byte digest)    ${String(evalshaBytes).padStart(5)} bytes/request`);
  console.log(`  -> ${(evalBytes / evalshaBytes).toFixed(1)}x smaller, ${evalBytes - evalshaBytes} bytes saved per request`);
  console.log(`     at 1k req/s that is ${(((evalBytes - evalshaBytes) * 1000 * 86400) / 1e9).toFixed(2)} GB/day less egress to Redis`);
}

function run() {
  console.log(`node ${process.version}  (gc exposed: ${Boolean(global.gc)})`);
  benchDocx(10);
  benchDocx(50);
  benchEicar(50);
  benchPdf(50);
  benchText(50);
  benchCsrfOrigins();
  benchSigningKey();
  benchRedisPayload();
  console.log('\nbench-hotpath done');
}

run();
