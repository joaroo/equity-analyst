/**
 * Per-stock Jev judgments: for each security, a compact relative state built from
 * computed indicators, and four typed questions — 20-day direction with fixed
 * return bands, trend strength, overextension, and (when the caller supplies an
 * event date) event risk.
 *
 * These are shadow judgments. The pipeline logs them with the reference close and
 * scores them against realized returns later; no analyst, council or rule reads
 * them yet. Thresholds for acting on them belong in code, once calibrated.
 *
 * One Jev call per stock, since each stock is its own state. Calls are capped per
 * UTC day (JEV_STOCK_DAILY_LIMIT, separate from the regime cap) and cached per
 * symbol per day. Any failure degrades that stock only; it never fails the tool.
 */

import { experimental_evaluate } from 'ai';
import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import type { Indicators } from './indicators.ts';
import { confidenceOf, DailyCap, intEnv, jevEnabled, jevFailureKind, jevModelId } from './jev.ts';
import { pctFrom, round, type JevAnswer } from './regime.ts';

/** Direction bands over the horizon, in percent. Shared with the calibration scorer. */
export const DIRECTION_BAND_PCT = 2;
export const HORIZON_TRADING_DAYS = 20;
/** An event this many days away or fewer counts as inside the horizon for event_risk. */
const EVENT_WINDOW_DAYS = 28;
const JEV_TIMEOUT_MS = 8_000;
const PARALLEL = 5;
const JEV_STOCK_DAILY_LIMIT = intEnv('JEV_STOCK_DAILY_LIMIT', 60);

export interface StockInput {
  symbol: string;
  name: string | null;
  currency: string | null;
  indicators: Indicators | null;
  /** Close-to-close return over the last 20 sessions, percent. */
  return20dPct: number | null;
  /** Calendar days to the next known binary event (report, decision), if the caller knows it. */
  daysToEvent?: number;
  error?: string;
}

export interface StockJudgment {
  symbol: string;
  status: 'ok' | 'disabled' | 'failed';
  reason?: string;
  model?: string;
  ref_close: number | null;
  as_of: string | null;
  answers?: Record<string, JevAnswer>;
  confidence?: Record<string, number>;
  latency_ms?: number;
  state: ReturnType<typeof buildStockState> | null;
}

/** Compact, relative, human-readable — the same shape as the regime state. */
export function buildStockState(stock: StockInput, home: { name: string; return20dPct: number | null }) {
  const ind = stock.indicators;
  if (!ind) return null;
  return {
    security: stock.name ?? stock.symbol,
    currency: stock.currency,
    asOf: ind.asOf,
    vsSma20Pct: pctFrom(ind.sma20, ind.close),
    vsSma50Pct: pctFrom(ind.sma50, ind.close),
    vsSma200Pct: pctFrom(ind.sma200, ind.close),
    maOrder:
      ind.sma50 !== null && ind.sma200 !== null ? (ind.sma50 > ind.sma200 ? 'SMA50 above SMA200' : 'SMA50 below SMA200') : null,
    rsi14: ind.rsi14 === null ? null : round(ind.rsi14, 1),
    // As a share of price, so it compares across securities.
    macdHistogramPctOfPrice: ind.macd ? round((ind.macd.histogram / ind.close) * 100, 3) : null,
    macdCrossover: ind.macd?.crossover ? `${ind.macd.crossover.direction} ${ind.macd.crossover.barsAgo} bar(s) ago` : null,
    fromHigh52wPct: pctFrom(ind.high52w, ind.close),
    fromLow52wPct: pctFrom(ind.low52w, ind.close),
    volumeVs20dAvg: ind.volumeVs20dAvg === null ? null : round(ind.volumeVs20dAvg),
    upDownVolumeRatio20d: ind.upDownVolumeRatio20d === null ? null : round(ind.upDownVolumeRatio20d),
    return20dPct: stock.return20dPct,
    homeIndex: home.name,
    homeIndexReturn20dPct: home.return20dPct,
    relativeReturn20dPp:
      stock.return20dPct !== null && home.return20dPct !== null ? round(stock.return20dPct - home.return20dPct) : null,
    daysToNextEvent: stock.daysToEvent ?? null,
  };
}

const BASE_QUESTIONS = {
  direction_20d: {
    type: 'choice',
    instructions: {
      question: `Where will this security's close be ${HORIZON_TRADING_DAYS} trading days from now, relative to today's close?`,
      inputs: 'Trend (distance from the 20/50/200-day moving averages, moving-average order), momentum (RSI, MACD), position in the 52-week range, volume behaviour, and 20-day performance relative to the home index.',
      caution: 'Most 20-day moves in large caps are small; choose flat unless the evidence points clearly one way. Missing fields are null; do not infer them.',
    },
    criteria: {
      up: `More than ${DIRECTION_BAND_PCT}% above today's close.`,
      flat: `Within ${DIRECTION_BAND_PCT}% of today's close, either way.`,
      down: `More than ${DIRECTION_BAND_PCT}% below today's close.`,
    },
  },
  trend: {
    type: 'score',
    instructions: {
      question: "How strong is this security's current price trend?",
      inputs: 'Distance from and order of the 20/50/200-day moving averages, MACD, RSI and relative performance versus the home index.',
      caution: 'Missing fields are null; do not infer them.',
    },
    criteria: [
      'Strong downtrend: below all moving averages, averages stacked downward, momentum negative',
      'Weak or rolling over: below the 50-day average or losing momentum',
      'Sideways: near its averages, no clear direction',
      'Uptrend: above the 50- and 200-day averages, momentum positive',
      'Strong uptrend: above all averages, averages stacked upward, outperforming the home index',
    ],
  },
  overextended: {
    type: 'boolean',
    instructions: {
      question: 'Is the price overextended — stretched far enough from its trend that a pullback is more likely than continuation?',
      inputs: 'RSI above 70, distance well above the 20- and 50-day averages, price at or near the 52-week high after a sharp run, fading volume on the advance.',
      caution: 'A strong trend alone is not overextension. Missing fields are null; do not infer them.',
    },
  },
} as const;

const WITH_EVENT = {
  ...BASE_QUESTIONS,
  event_risk: {
    type: 'boolean',
    instructions: {
      question: `Does the next scheduled event (days away given as daysToNextEvent) pose a material risk of a move beyond ${DIRECTION_BAND_PCT * 2}% against a new position?`,
      inputs: `daysToNextEvent (calendar days; within ${EVENT_WINDOW_DAYS} days is inside the horizon), how stretched the price is into the event, and recent volatility.`,
      caution: 'An event far outside the horizon is not a risk for this question.',
    },
  },
} as const;

const cap = new DailyCap(JEV_STOCK_DAILY_LIMIT);
const cache = new Map<string, StockJudgment>();

function cacheKey(stock: StockInput): string {
  return `${stock.symbol}|${new Date().toISOString().slice(0, 10)}|${stock.daysToEvent ?? ''}`;
}

async function judgeOne(stock: StockInput, home: { name: string; return20dPct: number | null }, signal: AbortSignal): Promise<StockJudgment> {
  const state = buildStockState(stock, home);
  const close = stock.indicators?.close;
  const base = { symbol: stock.symbol, ref_close: close === undefined ? null : round(close, close >= 1 ? 4 : 6), as_of: stock.indicators?.asOf ?? null, state };
  if (!state) return { ...base, status: 'failed', reason: stock.error ?? 'no daily bars' };
  if (!jevEnabled()) return { ...base, status: 'disabled', reason: 'TYPESAFE_AI_API_KEY not set' };

  const key = cacheKey(stock);
  const hit = cache.get(key);
  if (hit) return { ...hit, reason: 'cached today' };
  if (signal.aborted) return { ...base, status: 'failed', reason: 'deadline' };
  if (!cap.take()) return { ...base, status: 'failed', reason: `daily stock Jev limit (${JEV_STOCK_DAILY_LIMIT}) reached` };

  const modelId = jevModelId();
  const started = performance.now();
  try {
    const r = await experimental_evaluate({
      model: typeSafeAi.evaluationModel(modelId),
      state,
      questions: stock.daysToEvent === undefined ? BASE_QUESTIONS : WITH_EVENT,
      maxRetries: 1,
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(JEV_TIMEOUT_MS)]),
    });
    const result: StockJudgment = {
      ...base,
      status: 'ok',
      model: r.response?.modelId ?? modelId,
      answers: r.answers as Record<string, JevAnswer>,
      confidence: confidenceOf(r.providerMetadata),
      latency_ms: Math.round(performance.now() - started),
    };
    if (cache.size >= 200) cache.delete(cache.keys().next().value as string);
    cache.set(key, result);
    return result;
  } catch (err) {
    return { ...base, status: 'failed', model: modelId, reason: jevFailureKind(err, stock.symbol) };
  }
}

/** Judges every stock, at most PARALLEL Jev calls at a time; order of the result matches the input. */
export async function judgeStocks(stocks: StockInput[], home: { name: string; return20dPct: number | null }, signal: AbortSignal): Promise<StockJudgment[]> {
  const results: StockJudgment[] = new Array(stocks.length);
  let next = 0;
  const worker = async () => {
    while (next < stocks.length) {
      const i = next++;
      results[i] = await judgeOne(stocks[i], home, signal);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, stocks.length) }, worker));
  return results;
}
