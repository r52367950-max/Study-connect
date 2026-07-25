/**
 * Covers the Redis-backed rate-limit store, which had no test despite being the
 * store the application is required to use in production.
 *
 * Asserts:
 *  1. the hot path uses EVALSHA (not a full EVAL carrying the script body);
 *  2. a NOSCRIPT reply transparently falls back to EVAL and then resumes EVALSHA;
 *  3. an error reply (`-ERR ...`) rejects the in-flight command instead of
 *     escaping a 'data' handler as an uncaught exception and killing the process;
 *  4. a peer that closes mid-command rejects the pending promise instead of
 *     hanging the caller forever.
 */
import { createServer, Server, Socket } from 'node:net';
import { __rateLimitTesting } from '../src/common/rate-limit.service';

type FakeRedis = {
  server: Server;
  url: string;
  commands: string[][];
  close: () => Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** Decode as many complete RESP arrays of bulk strings as `buffer` holds. */
function decodeCommands(buffer: Buffer): { commands: string[][]; rest: Buffer } {
  const commands: string[][] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const start = offset;
    if (String.fromCharCode(buffer[offset]) !== '*') return { commands, rest: buffer.subarray(start) };
    const headerEnd = buffer.indexOf('\r\n', offset);
    if (headerEnd < 0) return { commands, rest: buffer.subarray(start) };

    const argc = Number(buffer.toString('utf8', offset + 1, headerEnd));
    let cursor = headerEnd + 2;
    const args: string[] = [];
    let incomplete = false;

    for (let i = 0; i < argc; i += 1) {
      if (cursor >= buffer.length || String.fromCharCode(buffer[cursor]) !== '$') { incomplete = true; break; }
      const lenEnd = buffer.indexOf('\r\n', cursor);
      if (lenEnd < 0) { incomplete = true; break; }
      const len = Number(buffer.toString('utf8', cursor + 1, lenEnd));
      const valueStart = lenEnd + 2;
      if (buffer.length < valueStart + len + 2) { incomplete = true; break; }
      args.push(buffer.toString('utf8', valueStart, valueStart + len));
      cursor = valueStart + len + 2;
    }

    if (incomplete) return { commands, rest: buffer.subarray(start) };
    commands.push(args);
    offset = cursor;
  }

  return { commands, rest: buffer.subarray(offset) };
}

async function startFakeRedis(
  respond: (command: string[], socket: Socket, callCount: number) => void,
): Promise<FakeRedis> {
  const commands: string[][] = [];
  const sockets = new Set<Socket>();

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    let pending: Buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const decoded = decodeCommands(pending);
      pending = decoded.rest;
      for (const command of decoded.commands) {
        commands.push(command);
        respond(command, socket, commands.length);
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'string' || address === null ? 0 : address.port;

  return {
    server,
    url: `redis://127.0.0.1:${port}`,
    commands,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const consumeInput = (key: string) => ({
  ruleName: 'global-basic',
  key,
  limit: 5,
  windowMs: 60_000,
  route: '/materials',
  method: 'GET',
  ip: '203.0.113.10',
});

async function assertEvalShaWithNoscriptFallback(): Promise<void> {
  const fake = await startFakeRedis((command, socket, callCount) => {
    const verb = command[0]?.toUpperCase();
    if (verb === 'EVALSHA' && callCount === 1) {
      socket.write('-NOSCRIPT No matching script. Please use EVAL.\r\n');
      return;
    }
    if (verb === 'EVALSHA' || verb === 'EVAL') {
      socket.write('*2\r\n:1\r\n:60000\r\n');
      return;
    }
    socket.write('+OK\r\n');
  });

  const store = new __rateLimitTesting.RedisRateLimitStore(fake.url, 'test:');
  try {
    const first = await store.checkAndConsume(consumeInput('ip:1.1.1.1'));
    assert(first.allowed, 'first consume should be allowed');

    const second = await store.checkAndConsume(consumeInput('ip:1.1.1.1'));
    assert(second.allowed, 'second consume should be allowed');

    const verbs = fake.commands.map((command) => command[0]?.toUpperCase());
    assert(verbs[0] === 'EVALSHA', `hot path should use EVALSHA, got ${verbs[0]}`);
    assert(verbs[1] === 'EVAL', `NOSCRIPT should fall back to EVAL, got ${verbs[1]}`);
    assert(verbs[2] === 'EVALSHA', `later calls should resume EVALSHA, got ${verbs[2]}`);

    // The fallback must send the script body; the digest path must not.
    assert(fake.commands[1][1].includes('redis.call'), 'EVAL fallback should carry the script body');
    assert(!fake.commands[2][1].includes('redis.call'), 'EVALSHA should send only a digest');

    console.log('redis store EVALSHA/NOSCRIPT check passed: EVALSHA -> EVAL -> EVALSHA');
  } finally {
    await store.onModuleDestroy();
    await fake.close();
  }
}

async function assertErrorReplyDoesNotCrashProcess(): Promise<void> {
  const fake = await startFakeRedis((command, socket) => {
    const verb = command[0]?.toUpperCase();
    if (verb === 'EVALSHA' || verb === 'EVAL') {
      // Any server-side error reply. Before the fix this threw out of the client's
      // 'data' handler as an uncaught exception and terminated the process.
      socket.write('-ERR OOM command not allowed when used memory > maxmemory.\r\n');
      return;
    }
    socket.write('+OK\r\n');
  });

  const store = new __rateLimitTesting.RedisRateLimitStore(fake.url, 'test:');
  try {
    let rejected = false;
    try {
      await store.checkAndConsume(consumeInput('ip:2.2.2.2'));
    } catch (error) {
      rejected = true;
      assert(
        error instanceof Error && /OOM|Redis error/.test(error.message),
        `expected the Redis error to surface, got ${String(error)}`,
      );
    }
    assert(rejected, 'an error reply should reject the command');

    // Still alive and usable: the client dropped the desynchronised stream and
    // reconnects on the next command.
    let secondRejected = false;
    try {
      await store.checkAndConsume(consumeInput('ip:2.2.2.2'));
    } catch {
      secondRejected = true;
    }
    assert(secondRejected, 'subsequent commands should still reject, not hang');

    console.log('redis store error-reply check passed: rejected without crashing the process');
  } finally {
    await store.onModuleDestroy();
    await fake.close();
  }
}

async function assertClosedConnectionRejectsPending(): Promise<void> {
  const fake = await startFakeRedis((command, socket) => {
    const verb = command[0]?.toUpperCase();
    if (verb === 'EVALSHA' || verb === 'EVAL') {
      // Vanish mid-command, as a failover or an idle-timeout reaper would.
      socket.destroy();
      return;
    }
    socket.write('+OK\r\n');
  });

  const store = new __rateLimitTesting.RedisRateLimitStore(fake.url, 'test:');
  try {
    const outcome = await Promise.race([
      store.checkAndConsume(consumeInput('ip:3.3.3.3')).then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('hung'), 3_000)),
    ]);

    assert(
      outcome === 'rejected',
      `a closed connection should reject the pending command, got "${outcome}"`,
    );
    console.log('redis store connection-close check passed: pending command rejected, not hung');
  } finally {
    await store.onModuleDestroy();
    await fake.close();
  }
}

async function run(): Promise<void> {
  await assertEvalShaWithNoscriptFallback();
  await assertErrorReplyDoesNotCrashProcess();
  await assertClosedConnectionRejectsPending();
  console.log('min-rate-limit-redis-store-check passed');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
