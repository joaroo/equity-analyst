/**
 * Remote (Streamable HTTP) entry point for the market-data MCP server.
 *
 * Access control is a secret URL: the MCP endpoint lives at `/<MCP_PATH_SECRET>/mcp`
 * and every other path returns 404, so the server is unreachable without the
 * full URL. Claude custom connectors only support no-auth or OAuth, and the data
 * here is public, so a capability URL is the proportionate control. The secret
 * comes from the environment and must never be committed or logged.
 *
 * The server shares a memory-constrained VPS with production services, so every
 * request is bounded: POST only, capped body, no JSON-RPC batches, a cap on
 * concurrent requests, a global rate limit, and an absolute response deadline.
 * Every rejection closes the connection so a client cannot hold sockets open by
 * trickling a body. Per-IP limits are useless because
 * all Claude traffic arrives from Anthropic's shared egress ranges. Upstream
 * (Yahoo/ECB) volume has its own budget in tools.ts, since one tool call can fan
 * out to many fetches.
 */

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, log, TOOL_DEADLINE_MS } from './tools.ts';

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`${name} must be an integer between ${min} and ${max}`);
    process.exit(1);
  }
  return value;
}

const PORT = intFromEnv('PORT', 3000, 1, 65535);
const RATE_LIMIT_PER_MINUTE = intFromEnv('RATE_LIMIT_PER_MINUTE', 120, 1, 10_000);
const MAX_CONCURRENT_REQUESTS = intFromEnv('MAX_CONCURRENT_REQUESTS', 16, 1, 1000);
const MAX_BODY_BYTES = 256 * 1024;
// Node's own requestTimeout is only checked every 30s, so a trickled body could hold
// a concurrency slot for about a minute. MCP request bodies are tiny.
const BODY_READ_TIMEOUT_MS = 10_000;
// Wall-clock cap on a whole MCP request. Tools stop at TOOL_DEADLINE_MS and return
// partial results; this is the backstop if something still hangs.
const RESPONSE_DEADLINE_MS = TOOL_DEADLINE_MS + 10_000;
const SHUTDOWN_GRACE_MS = 8_000;

const SECRET = process.env.MCP_PATH_SECRET ?? '';
if (!/^[A-Za-z0-9_-]{32,}$/.test(SECRET)) {
  console.error('MCP_PATH_SECRET must be at least 32 URL-safe characters (generate with: openssl rand -base64 32 | tr "+/" "-_" | tr -d "=")');
  process.exit(1);
}

const secretDigest = createHash('sha256').update(SECRET).digest();

function isAuthorizedPath(pathname: string): boolean {
  const match = /^\/([^/]+)\/mcp\/?$/.exec(pathname);
  if (!match) return false;
  const candidate = createHash('sha256').update(match[1]).digest();
  return timingSafeEqual(candidate, secretDigest);
}

// Fixed-window counter: simple and good enough for a single-instance server.
// Monotonic clock, so a wall-clock step backwards cannot freeze the window.
let windowStart = performance.now();
let windowCount = 0;

function allowRequest(): boolean {
  const now = performance.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount <= RATE_LIMIT_PER_MINUTE;
}

let inflight = 0;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'text/plain', ...headers }).end(body);
}

/** Respond and drop the connection, without waiting for any unread request body. */
function reject(req: IncomingMessage, res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  if (res.headersSent) {
    req.destroy();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'text/plain', Connection: 'close', ...headers });
  res.end(body, () => req.destroy());
}

/** Read the body ourselves so the size cap holds even when Content-Length lies or is absent. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new HttpError(413, 'Payload too large');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    req.destroy();
  }, BODY_READ_TIMEOUT_MS);
  try {
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Payload too large');
      chunks.push(chunk as Buffer);
    }
  } catch (err) {
    if (timedOut) throw new HttpError(408, 'Request body timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) throw new HttpError(408, 'Request body timeout');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  // A batch is one HTTP request but can carry any number of tool calls.
  if (Array.isArray(body)) throw new HttpError(400, 'JSON-RPC batches are not supported');

  // Stateless mode: a fresh server + transport per request, no session tracking.
  const server = createServer();
  // Plain JSON responses: tool calls are unary, and SSE would add keepalive writes
  // and proxy-buffering concerns for no benefit.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  transport.onerror = (err) => log(`transport: ${err.message}`);
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

const httpServer = createHttpServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  if (pathname === '/healthz') {
    if (req.method === 'GET' || req.method === 'HEAD') send(res, 200, 'ok');
    else reject(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  // Never log the path: it contains the secret.
  if (!isAuthorizedPath(pathname)) {
    reject(req, res, 404, 'Not found');
    return;
  }

  // Stateless mode has nothing to stream on GET. Clients treat 405 as "no stream offered".
  if (req.method !== 'POST') {
    reject(req, res, 405, 'Method not allowed', { Allow: 'POST' });
    return;
  }

  if (!allowRequest()) {
    log('rate limit exceeded');
    reject(req, res, 429, 'Too many requests', { 'Retry-After': '60' });
    return;
  }

  if (inflight >= MAX_CONCURRENT_REQUESTS) {
    log('concurrency limit exceeded');
    reject(req, res, 503, 'Server busy', { 'Retry-After': '5' });
    return;
  }

  inflight += 1;
  // Absolute deadline, unlike res.setTimeout, which only measures socket idleness.
  // Destroying the response closes the transport, which aborts in-flight tool work.
  const deadline = setTimeout(() => {
    log('response deadline exceeded');
    res.destroy();
  }, RESPONSE_DEADLINE_MS);
  res.on('close', () => {
    inflight -= 1;
    clearTimeout(deadline);
  });

  handleMcp(req, res).catch((err: unknown) => {
    if (err instanceof HttpError) {
      reject(req, res, err.status, err.message);
      return;
    }
    log(`request failed: ${err instanceof Error ? err.message : String(err)}`);
    reject(req, res, 500, 'Internal server error');
  });
});

// Keep idle sockets open longer than the reverse proxy does (Traefik: 90s), or the
// proxy may reuse a socket Node just closed and return a 502. headersTimeout must
// exceed keepAliveTimeout.
httpServer.keepAliveTimeout = 95_000;
httpServer.headersTimeout = 96_000;
httpServer.requestTimeout = 30_000;

httpServer.listen(PORT, () => {
  log(`listening on :${PORT} (rate limit ${RATE_LIMIT_PER_MINUTE}/min, max ${MAX_CONCURRENT_REQUESTS} concurrent)`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
    httpServer.closeIdleConnections();
    // Exit before Docker's 10s SIGKILL even if a slow upstream call is still running.
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
  });
}
