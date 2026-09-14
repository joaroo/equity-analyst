/**
 * Market data tools: structured quotes, OHLC history, and FX rates from keyless
 * public endpoints, so agents cite real numbers instead of parsing them out of
 * scraped prose.
 *
 * Sources:
 *   - Yahoo Finance chart API (query1.finance.yahoo.com/v8) — quotes + history.
 *     Covers non-US exchanges via suffixes (`VOLV-B.ST` = Stockholm, `.DE` = Xetra,
 *     `.L` = London). Preferred over "generous" free tiers: Twelve Data's free plan
 *     is US-only, Alpha Vantage's is 25 requests/day.
 *   - Frankfurter (api.frankfurter.dev) — ECB reference rates for FX.
 *
 * The Yahoo endpoint is unofficial. It can rate-limit or change shape without
 * notice, so every tool fails loudly with the HTTP status rather than returning a
 * plausible empty result. Fundamentals (P/E, market cap, dividends) are
 * deliberately absent — they live behind Yahoo's `quoteSummary`, which needs a
 * cookie/crumb handshake and is too fragile to present as a reliable tool.
 */

import { performance } from 'node:perf_hooks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { computeIndicators, type Bar } from './indicators.ts';
import { describeChange, ecbRates, fedRates, HOLD_AFTER_DAYS, nextMeeting, riksbankRates, stanceOf } from './centralbanks.ts';
import { z } from 'zod';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const FX_BASE = 'https://api.frankfurter.dev/v1';
const FETCH_TIMEOUT_MS = 15_000;
// Every tool call finishes within this, returning partial results if needed. Must
// stay below the HTTP response deadline in index.ts so the result reaches the client.
export const TOOL_DEADLINE_MS = 45_000;
const MAX_SYMBOLS = 20;
const MAX_INDICATOR_SYMBOLS = 10;
const MAX_HISTORY_ROWS = 400;
const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;

// Shared upstream budget. One tool call can fan out to many fetches, so inbound
// rate limiting alone does not bound what we send to Yahoo — and getting the
// VPS IP blocked there takes the tool down for everyone. A token bucket caps
// volume; a small semaphore caps concurrency (excess calls queue, not fail).
const UPSTREAM_BUCKET_SIZE = 120;
const UPSTREAM_REFILL_PER_MS = 120 / 60_000;
const UPSTREAM_MAX_CONCURRENT = 6;
const UPSTREAM_MAX_QUEUED = 64;

// Yahoo rejects requests without a browser-shaped User-Agent.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; equity-analyst-market-data/1.0)' };

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

export function log(msg: string): void {
  console.error(`[market-data] ${msg}`);
}

function fail(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

let upstreamTokens = UPSTREAM_BUCKET_SIZE;
let upstreamRefilledAt = performance.now();
let upstreamInflight = 0;

interface Waiter {
  resolve: () => void;
  signal: AbortSignal;
  onAbort: () => void;
}
const upstreamQueue: Waiter[] = [];

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('request cancelled');
}

function takeUpstreamToken(): void {
  // Monotonic clock: a wall-clock step backwards must not drain the bucket.
  const now = performance.now();
  upstreamTokens = Math.min(UPSTREAM_BUCKET_SIZE, upstreamTokens + (now - upstreamRefilledAt) * UPSTREAM_REFILL_PER_MS);
  upstreamRefilledAt = now;
  if (upstreamTokens < 1) throw new Error('upstream request budget exhausted, retry in a minute');
  upstreamTokens -= 1;
}

/** Waits for a fetch slot; aborting the signal removes the waiter from the queue. */
function acquireUpstreamSlot(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  if (upstreamInflight < UPSTREAM_MAX_CONCURRENT) {
    upstreamInflight += 1;
    return Promise.resolve();
  }
  if (upstreamQueue.length >= UPSTREAM_MAX_QUEUED) {
    return Promise.reject(new Error('upstream queue full, retry shortly'));
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      resolve,
      signal,
      onAbort: () => {
        const index = upstreamQueue.indexOf(waiter);
        if (index !== -1) upstreamQueue.splice(index, 1);
        reject(abortReason(signal));
      },
    };
    signal.addEventListener('abort', waiter.onAbort, { once: true });
    upstreamQueue.push(waiter);
  });
}

function releaseUpstreamSlot(): void {
  const next = upstreamQueue.shift();
  if (next) {
    // Hand the slot over directly, so inflight stays unchanged.
    next.signal.removeEventListener('abort', next.onAbort);
    next.resolve();
  } else {
    upstreamInflight -= 1;
  }
}

/** Reads the body with a byte cap enforced while streaming, not after buffering. */
async function readCapped(res: Response, signal: AbortSignal): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_UPSTREAM_BYTES) {
    await res.body?.cancel();
    throw new Error('upstream response too large');
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPSTREAM_BYTES) {
        await reader.cancel();
        throw new Error('upstream response too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (signal.aborted) throw abortReason(signal);
  return Buffer.concat(chunks).toString('utf8');
}

async function getText(url: string, signal: AbortSignal): Promise<string> {
  // Slot first, token second: a queued call must not spend budget it may never use.
  await acquireUpstreamSlot(signal);
  try {
    if (signal.aborted) throw abortReason(signal);
    takeUpstreamToken();
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      redirect: 'error',
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await readCapped(res, signal);
  } finally {
    releaseUpstreamSlot();
  }
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  return JSON.parse(await getText(url, signal));
}

/** Cancelled when the client disconnects (SDK signal) or the tool deadline passes. */
function toolSignal(extra: { signal: AbortSignal }): AbortSignal {
  return AbortSignal.any([extra.signal, AbortSignal.timeout(TOOL_DEADLINE_MS)]);
}

function errorText(err: unknown): string {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return 'cancelled (deadline exceeded or client disconnected)';
  }
  return err instanceof Error ? err.message : String(err);
}

// Strict allow-lists: inputs end up in upstream URLs and in logs.
const symbolSchema = z
  .string()
  .regex(/^[A-Za-z0-9.^=-]{1,20}$/, 'ticker with optional exchange suffix, e.g. VOLV-B.ST, ^VIX, SEK=X');
const currencySchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'ISO 4217 currency code, e.g. SEK')
  .transform((code) => code.toUpperCase());
const RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'] as const;
const INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk', '1mo'] as const;

interface ChartMeta {
  symbol?: string;
  currency?: string;
  fullExchangeName?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketTime?: number;
  marketState?: string;
}

interface ChartResult {
  meta?: ChartMeta;
  timestamp?: number[];
  indicators?: { quote?: Array<Record<string, Array<number | null>>> };
}

async function fetchChart(symbol: string, range: string, interval: string, signal: AbortSignal): Promise<ChartResult> {
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const body = (await getJson(url, signal)) as {
    chart?: { result?: ChartResult[]; error?: { description?: string } };
  };
  const err = body.chart?.error;
  if (err) throw new Error(err.description || 'unknown symbol');
  const result = body.chart?.result?.[0];
  if (!result?.meta) throw new Error('no data returned');
  return result;
}

function pct(from: number, to: number): string {
  if (!from) return 'n/a';
  return `${(((to - from) / from) * 100).toFixed(2)}%`;
}

/**
 * Yahoo returns full float64 noise (347.20001220703125). Emitting that verbatim
 * wastes tokens and invites quoting a precision nobody measured, so round to a
 * sensible number of places while keeping sub-unit instruments meaningful.
 */
function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const places = Math.abs(value) >= 1 ? 2 : 6;
  return String(Number(value.toFixed(places)));
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'market-data', version: '1.0.0' });

  server.registerTool(
    'market_quote',
    {
      description:
        'Get the current price for one or more listed securities from structured market data (not web search). Use this whenever a price, previous close, or day-change is needed — it is authoritative where scraped pages are not. Non-US symbols need their exchange suffix: Stockholm "VOLV-B.ST", Helsinki ".HE", Copenhagen ".CO", Oslo ".OL", Xetra ".DE", London ".L". US symbols need no suffix. Indices use a caret: "^GSPC", "^VIX", "^OMX".',
      inputSchema: {
        symbols: z
          .array(symbolSchema)
          .min(1)
          .max(MAX_SYMBOLS)
          .describe('Ticker symbols including exchange suffix, e.g. ["VOLV-B.ST", "AAPL"]'),
      },
      annotations: READ_ONLY,
    },
    async ({ symbols }, extra) => {
      log(`quote: ${symbols.join(', ')}`);
      const started = Date.now();
      const signal = toolSignal(extra);

      const results = await Promise.all(
        symbols.map(async (symbol): Promise<{ ok: boolean; text: string }> => {
          try {
            // range=1d is deliberate: for longer ranges chartPreviousClose is the
            // close before the window starts, not the prior session's close.
            const { meta } = await fetchChart(symbol, '1d', '1d', signal);
            const m = meta as ChartMeta;
            const price = m.regularMarketPrice;
            const prev = m.chartPreviousClose ?? m.previousClose;
            if (price === undefined) return { ok: false, text: `${symbol}: FAILED — no price available` };
            const change =
              prev !== undefined
                ? ` | prev ${num(prev)} | ${price >= prev ? '+' : ''}${num(price - prev)} (${pct(prev, price)})`
                : '';
            const name = m.longName || m.shortName || '';
            const stamp = m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : 'unknown';
            // marketState is usually absent from the chart endpoint's meta;
            // omit rather than emit a standing "unknown".
            const state = m.marketState ? ` | ${m.marketState}` : '';
            return {
              ok: true,
              text: `${m.symbol ?? symbol}${name ? ` (${name})` : ''}: ${num(price)} ${m.currency ?? ''}${change} | ${m.fullExchangeName ?? 'unknown exchange'}${state} | as of ${stamp}`,
            };
          } catch (err) {
            return { ok: false, text: `${symbol}: FAILED — ${errorText(err)}` };
          }
        }),
      );

      const succeeded = results.filter((r) => r.ok).length;
      log(`quote done: ${succeeded}/${symbols.length} ok | ${((Date.now() - started) / 1000).toFixed(1)}s`);
      const text = results.map((r) => r.text).join('\n');
      // Total failure must surface as an MCP error, not a successful result that
      // happens to contain "FAILED" lines.
      if (succeeded === 0) return fail(text);
      return ok(succeeded < symbols.length ? `${text}\n\n${symbols.length - succeeded} of ${symbols.length} symbols failed.` : text);
    },
  );

  server.registerTool(
    'market_history',
    {
      description: `Get historical OHLCV bars for one security. Use for support/resistance, drawdown, event-day price moves, or period returns instead of guessing from headlines. For moving averages, RSI or MACD use market_indicators, which computes them. Returns at most ${MAX_HISTORY_ROWS} rows (the most recent); widen the interval rather than the range if you hit that.`,
      inputSchema: {
        symbol: symbolSchema.describe('Ticker with exchange suffix, e.g. "VOLV-B.ST"'),
        range: z.enum(RANGES).default('1mo'),
        interval: z.enum(INTERVALS).default('1d').describe('Intraday intervals only work on short ranges'),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol, range, interval }, extra) => {
      log(`history: ${symbol} ${range}/${interval}`);
      try {
        const result = await fetchChart(symbol, range, interval, toolSignal(extra));
        const meta = result.meta as ChartMeta;
        const stamps = result.timestamp ?? [];
        const q = result.indicators?.quote?.[0] ?? {};
        const closes = q.close ?? [];
        const opens = q.open ?? [];
        const highs = q.high ?? [];
        const lows = q.low ?? [];
        const volumes = q.volume ?? [];

        if (stamps.length === 0) return fail(`${symbol}: no bars returned for ${range}/${interval}`);

        // Intraday bars need the time of day, or every row on a day looks identical.
        const intraday = interval.endsWith('m') || interval.endsWith('h');
        const rows: string[] = [];
        const start = Math.max(0, stamps.length - MAX_HISTORY_ROWS);
        for (let i = start; i < stamps.length; i++) {
          if (closes[i] === null || closes[i] === undefined) continue;
          const iso = new Date(stamps[i] * 1000).toISOString();
          const d = intraday ? `${iso.slice(0, 16).replace('T', ' ')}Z` : iso.slice(0, 10);
          rows.push(
            `${d}  O:${num(opens[i])}  H:${num(highs[i])}  L:${num(lows[i])}  C:${num(closes[i])}  V:${volumes[i] ?? '-'}`,
          );
        }

        // Period return covers the rows shown, not bars trimmed off the front.
        const shown = closes.slice(start);
        const first = shown.find((c) => c !== null && c !== undefined);
        const last = [...shown].reverse().find((c) => c !== null && c !== undefined);
        const summary =
          first !== undefined && first !== null && last !== undefined && last !== null
            ? `\nPeriod return: ${pct(first, last)} (${num(first)} → ${num(last)} ${meta.currency ?? ''})`
            : '';

        log(`history done: ${symbol} | ${rows.length} bars`);
        return ok(
          `${meta.symbol ?? symbol} — ${rows.length} bars${stamps.length > MAX_HISTORY_ROWS ? ` (most recent of ${stamps.length})` : ''}, ${range}/${interval}, ${meta.currency ?? ''} on ${meta.fullExchangeName ?? 'unknown exchange'}\n${rows.join('\n')}${summary}`,
        );
      } catch (err) {
        return fail(`market_history failed for ${symbol}: ${errorText(err)}`);
      }
    },
  );

  server.registerTool(
    'market_indicators',
    {
      description: `Compute technical indicators from ~2 years of daily bars for up to ${MAX_INDICATOR_SYMBOLS} securities: SMA 20/50/200 with % distance, moving-average order, RSI(14, Wilder), MACD(12,26,9) with recent crossover, 52-week and 20-day high/low, volume vs 20-day average, and 20-day up/down volume ratio. Use this instead of calculating indicators from market_history bars or searching for them.`,
      inputSchema: {
        symbols: z
          .array(symbolSchema)
          .min(1)
          .max(MAX_INDICATOR_SYMBOLS)
          .describe('Ticker symbols including exchange suffix, e.g. ["VOLV-B.ST", "^GSPC"]'),
      },
      annotations: READ_ONLY,
    },
    async ({ symbols }, extra) => {
      log(`indicators: ${symbols.join(', ')}`);
      const signal = toolSignal(extra);

      const results = await Promise.all(
        symbols.map(async (symbol): Promise<{ ok: boolean; text: string }> => {
          try {
            const result = await fetchChart(symbol, '2y', '1d', signal);
            const meta = result.meta as ChartMeta;
            const stamps = result.timestamp ?? [];
            const q = result.indicators?.quote?.[0] ?? {};
            const bars: Bar[] = [];
            for (let i = 0; i < stamps.length; i++) {
              const close = q.close?.[i];
              const high = q.high?.[i];
              const low = q.low?.[i];
              if (close === null || close === undefined || high === null || high === undefined || low === null || low === undefined) continue;
              bars.push({
                date: new Date(stamps[i] * 1000).toISOString().slice(0, 10),
                high,
                low,
                close,
                volume: q.volume?.[i] ?? null,
              });
            }
            const ind = computeIndicators(bars);
            if (!ind) return { ok: false, text: `${symbol}: FAILED — no daily bars returned` };

            const vsMa = (ma: number | null) => (ma === null ? 'n/a (not enough bars)' : `${num(ma)} (price ${pct(ma, ind.close)})`);
            const order = [
              ['price', ind.close],
              ['SMA20', ind.sma20],
              ['SMA50', ind.sma50],
              ['SMA200', ind.sma200],
            ]
              .filter((e): e is [string, number] => e[1] !== null)
              .sort((a, b) => b[1] - a[1])
              .map((e) => e[0])
              .join(' > ');
            const m = ind.macd;
            const macdText = m
              ? `MACD ${num(m.macd)} | signal ${num(m.signal)} | histogram ${m.histogram >= 0 ? '+' : ''}${num(m.histogram)}${m.crossover ? ` | ${m.crossover.direction} crossover ${m.crossover.barsAgo === 0 ? 'on the last bar' : `${m.crossover.barsAgo} bar(s) ago`}` : ' | no crossover in last 5 bars'}`
              : 'MACD n/a (not enough bars)';
            const range52 =
              ind.high52w !== null && ind.low52w !== null
                ? `52w high ${num(ind.high52w)} (price ${pct(ind.high52w, ind.close)}) / low ${num(ind.low52w)} (price ${pct(ind.low52w, ind.close)})`
                : '52w range n/a (under 252 bars)';
            const range20 = ind.high20d !== null && ind.low20d !== null ? `20d high ${num(ind.high20d)} / low ${num(ind.low20d)}` : '20d range n/a';
            const volume = [
              ind.volumeVs20dAvg !== null ? `last volume ${ind.volumeVs20dAvg.toFixed(2)}x 20d avg` : 'volume vs avg n/a',
              ind.upDownVolumeRatio20d !== null ? `20d up/down volume ${ind.upDownVolumeRatio20d.toFixed(2)}` : 'up/down volume n/a',
            ].join(' | ');

            return {
              ok: true,
              text: [
                `${meta.symbol ?? symbol} — ${meta.currency ?? ''} on ${meta.fullExchangeName ?? 'unknown exchange'}, as of ${ind.asOf} close, ${ind.bars} daily bars`,
                `  Close ${num(ind.close)} | SMA20 ${vsMa(ind.sma20)} | SMA50 ${vsMa(ind.sma50)} | SMA200 ${vsMa(ind.sma200)}`,
                `  Order: ${order}`,
                `  RSI14 ${ind.rsi14 === null ? 'n/a' : ind.rsi14.toFixed(1)} | ${macdText}`,
                `  ${range52} | ${range20}`,
                `  ${volume}`,
              ].join('\n'),
            };
          } catch (err) {
            return { ok: false, text: `${symbol}: FAILED — ${errorText(err)}` };
          }
        }),
      );

      const succeeded = results.filter((r) => r.ok).length;
      log(`indicators done: ${succeeded}/${symbols.length} ok`);
      const text = results.map((r) => r.text).join('\n\n');
      if (succeeded === 0) return fail(text);
      return ok(succeeded < symbols.length ? `${text}\n\n${symbols.length - succeeded} of ${symbols.length} symbols failed.` : text);
    },
  );

  server.registerTool(
    'central_bank_rates',
    {
      description: `Current policy rates, the last rate changes and the next scheduled policy decision date for Sveriges Riksbank, the ECB and the US Federal Reserve, from official data feeds (Riksbank SWEA API, ECB Data Portal, New York Fed) and the banks' official meeting calendars. Also returns a stance computed from the data: a change within ${HOLD_AFTER_DAYS} days sets Tightening or Easing, otherwise On hold. Dates are effective dates, not decision dates. Use this instead of news searches for rate levels, recent moves and stance.`,
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async (_args, extra) => {
      log('central bank rates');
      const signal = toolSignal(extra);
      const fetchText = (url: string) => getText(url, signal);
      const today = new Date();
      const [results, meetings] = await Promise.all([
        Promise.allSettled([riksbankRates(fetchText, today), ecbRates(fetchText), fedRates(fetchText, today)]),
        Promise.allSettled([nextMeeting('riksbank', fetchText, today), nextMeeting('ecb', fetchText, today), nextMeeting('fed', fetchText, today)]),
      ]);
      const names = ['Sveriges Riksbank', 'European Central Bank', 'US Federal Reserve'];
      const meetingText = (i: number): string => {
        const m = meetings[i];
        if (m.status === 'rejected') return `unavailable — calendar page could not be read (${errorText(m.reason)})`;
        if (!m.value) return 'none published yet';
        return `${m.value.date} (${m.value.days === 0 ? 'today' : `in ${m.value.days} days`}) — ${m.value.source}`;
      };

      let succeeded = 0;
      const sections = results.map((r, i) => {
        if (r.status === 'rejected') {
          return `${names[i]}: FAILED — ${errorText(r.reason)}`;
        }
        succeeded += 1;
        const b = r.value;
        const { stance, reason } = stanceOf(b, today);
        return [
          `${b.bank} — ${b.rateLabel} ${b.currentText} (as of ${b.asOf})${b.extra ? `; ${b.extra}` : ''}`,
          `  Stance: ${stance} (${reason})`,
          `  Last change: ${describeChange(b.lastChange, today)}`,
          `  Previous change: ${describeChange(b.previousChange, today)}`,
          `  Next policy decision: ${meetingText(i)}`,
          `  Source: ${b.source}`,
        ].join('\n');
      });

      log(`central bank rates done: ${succeeded}/3 ok`);
      const text = `${sections.join('\n\n')}\n\nStance rule: last change within ${HOLD_AFTER_DAYS} days → Tightening/Easing; otherwise On hold. Forward guidance is not included — read the official statement if needed.`;
      return succeeded === 0 ? fail(text) : ok(text);
    },
  );

  server.registerTool(
    'fx_rate',
    {
      description:
        'Get foreign exchange rates from ECB reference data. Use for any currency conversion — converting a foreign holding into the portfolio currency, or separating FX moves from performance. Pass a historical date for point-in-time conversion against an entry price.',
      inputSchema: {
        base: currencySchema.default('USD').describe('Base currency code, e.g. "USD"'),
        symbols: z.array(currencySchema).min(1).max(30).describe('Target currency codes, e.g. ["SEK", "EUR"]'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
          .optional()
          .describe('Optional YYYY-MM-DD for a historical rate; omit for latest'),
      },
      annotations: READ_ONLY,
    },
    async ({ base, symbols, date }, extra) => {
      const path = date ? `/${encodeURIComponent(date)}` : '/latest';
      log(`fx: ${base} -> ${symbols.join(',')}${date ? ` @ ${date}` : ''}`);
      try {
        const url = `${FX_BASE}${path}?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(symbols.join(','))}`;
        const data = (await getJson(url, toolSignal(extra))) as { date?: string; base?: string; rates?: Record<string, number> };
        const rates = data.rates ?? {};
        if (Object.keys(rates).length === 0) {
          return fail(`No rates returned for ${base} -> ${symbols.join(',')}. Check the currency codes.`);
        }
        const lines = Object.entries(rates).map(([code, rate]) => `1 ${data.base ?? base} = ${rate} ${code}`);
        return ok(`ECB reference rates for ${data.date ?? 'latest'}:\n${lines.join('\n')}`);
      } catch (err) {
        return fail(`fx_rate failed: ${errorText(err)}`);
      }
    },
  );

  return server;
}
