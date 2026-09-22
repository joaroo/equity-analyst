/**
 * Market regime: the market-snapshot skill's signal matrix computed in code, plus
 * an optional second opinion from TypeSafe's Jev model.
 *
 * The rules are the source of truth: deterministic, free, and the same matrix the
 * skill documents. Jev sees the same inputs plus context the rules ignore (200-day
 * trend, RSI, MACD, per-sector returns) and returns a probability for each regime.
 * Where the rules are mechanical, Jev's value is the distribution: a 0.45/0.40/0.15
 * split says the call is fragile even when the rules land cleanly on one label.
 *
 * Jev runs only when TYPESAFE_AI_API_KEY is set. Any Jev failure degrades to the
 * rules result with the reason attached; it never fails the tool.
 */

import { experimental_evaluate } from 'ai';
import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import type { Indicators } from './indicators.ts';

export type Regime = 'RISK-ON' | 'TRANSITIONAL' | 'RISK-OFF';
export type Stance = 'Tightening' | 'Easing' | 'On hold';
type Vote = 'bullish' | 'neutral' | 'bearish';

/** Band around the 50-day MA that counts as neutral, per the skill's matrix. */
const MA_BAND_PCT = 3;
const VIX_CALM = 15;
const VIX_STRESS = 20;
/**
 * Cyclical minus defensive average 5-day return, in percentage points, beyond which
 * one group is "leading". The skill says only "leading / mixed"; 1 pp over a week
 * is roughly the noise floor for broad sector ETFs.
 */
const SECTOR_LEAD_PP = 1;
/** Riksbank ×3, ECB ×2, Fed ×1: the home bank drives most of the portfolio. */
const BANK_WEIGHTS = { riksbank: 3, ecb: 2, fed: 1 } as const;
const MIN_SIGNALS = 5;
const JEV_TIMEOUT_MS = 15_000;

export interface IndexInput {
  name: string;
  symbol: string;
  indicators: Indicators | null;
  error?: string;
}

export interface SectorInput {
  name: string;
  symbol: string;
  group: 'cyclical' | 'defensive' | 'energy';
  return5dPct: number | null;
  error?: string;
}

export interface BankInput {
  stance: Stance | 'unverified';
  rate: string | null;
  lastChange: string | null;
}

export interface RegimeInputs {
  asOf: string;
  home: IndexInput;
  europe: IndexInput;
  global: IndexInput;
  vix: { symbol: string; level: number | null; error?: string };
  sectors: SectorInput[];
  banks: { riksbank: BankInput; ecb: BankInput; fed: BankInput };
}

interface Signal {
  name: string;
  vote: Vote | null; // null = input missing
  detail: string;
}

export interface RulesResult {
  regime: Regime | null; // null when fewer than MIN_SIGNALS signals are available
  bullish: number;
  bearish: number;
  neutral: number;
  signals: Signal[];
  divergence: string | null;
  centralBankNet: Stance;
  sectorSpreadPp: number | null;
}

export interface JevResult {
  status: 'ok' | 'disabled' | 'failed';
  model?: string;
  regime?: Regime;
  probabilities?: Record<Regime, number>;
  latencyMs?: number;
  inputTokens?: number;
  reason?: string;
}

const round = (value: number, places = 2) => Number(value.toFixed(places));

export function pctFrom(base: number | null, value: number): number | null {
  return base === null || base === 0 ? null : round(((value - base) / base) * 100);
}

function maVote(index: IndexInput): Signal {
  const name = `${index.name} vs 50-day MA`;
  const ind = index.indicators;
  const dist = ind ? pctFrom(ind.sma50, ind.close) : null;
  if (dist === null) return { name, vote: null, detail: index.error ?? 'not enough bars for SMA50' };
  const vote: Vote = dist > MA_BAND_PCT ? 'bullish' : dist < -MA_BAND_PCT ? 'bearish' : 'neutral';
  return { name, vote, detail: `${dist >= 0 ? '+' : ''}${dist}%` };
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function sectorSpread(sectors: SectorInput[]): number | null {
  const avg = (group: SectorInput['group']) =>
    mean(sectors.filter((s) => s.group === group && s.return5dPct !== null).map((s) => s.return5dPct as number));
  const cyc = avg('cyclical');
  const def = avg('defensive');
  return cyc === null || def === null ? null : round(cyc - def);
}

export function centralBankNet(banks: RegimeInputs['banks']): { net: Stance; score: number } {
  const points = (s: BankInput['stance']) => (s === 'Tightening' ? 1 : s === 'Easing' ? -1 : 0);
  const score =
    points(banks.riksbank.stance) * BANK_WEIGHTS.riksbank +
    points(banks.ecb.stance) * BANK_WEIGHTS.ecb +
    points(banks.fed.stance) * BANK_WEIGHTS.fed;
  return { net: score >= 2 ? 'Tightening' : score <= -2 ? 'Easing' : 'On hold', score };
}

/** The skill's six-signal matrix. Pure: same inputs, same answer. */
export function classifyRules(inputs: RegimeInputs): RulesResult {
  const signals: Signal[] = [maVote(inputs.home), maVote(inputs.europe), maVote(inputs.global)];

  const vix = inputs.vix.level;
  signals.push(
    vix === null
      ? { name: 'VIX', vote: null, detail: inputs.vix.error ?? 'unavailable' }
      : { name: 'VIX', vote: vix < VIX_CALM ? 'bullish' : vix > VIX_STRESS ? 'bearish' : 'neutral', detail: String(round(vix)) },
  );

  const spread = sectorSpread(inputs.sectors);
  signals.push(
    spread === null
      ? { name: 'European sector leadership', vote: null, detail: 'cyclical or defensive returns unavailable' }
      : {
          name: 'European sector leadership',
          vote: spread > SECTOR_LEAD_PP ? 'bullish' : spread < -SECTOR_LEAD_PP ? 'bearish' : 'neutral',
          detail: `cyclicals minus defensives ${spread >= 0 ? '+' : ''}${spread} pp over 5 days`,
        },
  );

  // Unverified banks score 0, as the skill specifies, so this signal is always present.
  const { net, score } = centralBankNet(inputs.banks);
  signals.push({
    name: 'Central banks (weighted net)',
    vote: net === 'Easing' ? 'bullish' : net === 'Tightening' ? 'bearish' : 'neutral',
    detail: `${net} (score ${score >= 0 ? '+' : ''}${score}; Riksbank ${inputs.banks.riksbank.stance}, ECB ${inputs.banks.ecb.stance}, Fed ${inputs.banks.fed.stance})`,
  });

  const count = (v: Vote) => signals.filter((s) => s.vote === v).length;
  const bullish = count('bullish');
  const bearish = count('bearish');
  const neutral = count('neutral');
  const available = bullish + bearish + neutral;

  let regime: Regime | null = null;
  if (available >= MIN_SIGNALS) {
    if (bullish >= 4 && bearish <= 1) regime = 'RISK-ON';
    else if (bearish >= 4 && bullish <= 1) regime = 'RISK-OFF';
    else regime = 'TRANSITIONAL';
  }

  const homeVote = signals[0].vote;
  const globalVote = signals[2].vote;
  const divergence =
    homeVote && globalVote && homeVote !== 'neutral' && globalVote !== 'neutral' && homeVote !== globalVote
      ? `${inputs.home.name} ${homeVote} while ${inputs.global.name} ${globalVote}; the home index decides ties`
      : null;

  return { regime, bullish, bearish, neutral, signals, divergence, centralBankNet: net, sectorSpreadPp: spread };
}

function indexState(index: IndexInput) {
  const ind = index.indicators;
  if (!ind) return { name: index.name, available: false };
  return {
    name: index.name,
    vsSma50Pct: pctFrom(ind.sma50, ind.close),
    vsSma200Pct: pctFrom(ind.sma200, ind.close),
    maOrder: ind.sma50 !== null && ind.sma200 !== null ? (ind.sma50 > ind.sma200 ? 'SMA50 above SMA200' : 'SMA50 below SMA200') : null,
    rsi14: ind.rsi14 === null ? null : round(ind.rsi14, 1),
    macdHistogram: ind.macd ? round(ind.macd.histogram, 3) : null,
    macdCrossover: ind.macd?.crossover ? `${ind.macd.crossover.direction} ${ind.macd.crossover.barsAgo} bar(s) ago` : null,
    fromHigh52wPct: pctFrom(ind.high52w, ind.close),
  };
}

/** Compact, relative, human-readable — the shape jev-trader found works for Jev. */
export function buildJevState(inputs: RegimeInputs) {
  return {
    portfolio: 'Swedish equity portfolio (ISK account), home market Nasdaq Stockholm',
    asOf: inputs.asOf,
    homeIndex: indexState(inputs.home),
    europeIndex: indexState(inputs.europe),
    globalIndex: indexState(inputs.global),
    vix: inputs.vix.level === null ? null : round(inputs.vix.level),
    sectors5dPct: Object.fromEntries(inputs.sectors.map((s) => [`${s.name} (${s.group})`, s.return5dPct])),
    cyclicalMinusDefensivePp: sectorSpread(inputs.sectors),
    centralBanks: {
      riksbank: { stance: inputs.banks.riksbank.stance, rate: inputs.banks.riksbank.rate, lastChange: inputs.banks.riksbank.lastChange },
      ecb: { stance: inputs.banks.ecb.stance, rate: inputs.banks.ecb.rate, lastChange: inputs.banks.ecb.lastChange },
      fed: { stance: inputs.banks.fed.stance, rate: inputs.banks.fed.rate, lastChange: inputs.banks.fed.lastChange },
    },
  };
}

const QUESTIONS = {
  regime: {
    type: 'choice',
    instructions: {
      question: 'Which market regime is a Swedish equity portfolio operating in right now?',
      goal: 'Set position sizing and risk appetite for the coming 1 to 4 weeks. The regime scales how aggressively new positions are opened and whether speculative positions are allowed at all.',
      inputs:
        'Trend is the primary signal: distance from the 50-day and 200-day moving averages for the home (OMX Stockholm 30), European (STOXX 600) and global (S&P 500) indices. The home index matters most because it drives most of the portfolio. VIX is the global stress gauge: below 15 calm, above 20 stressed. Sector returns show whether investors favour cyclicals (risk appetite) or defensives (risk aversion). Central-bank stance: easing supports equities, tightening weighs on them; the Riksbank matters most, then the ECB, then the Fed. RSI and MACD show momentum and whether a trend is stretched or turning.',
      caution: 'When signals conflict or sit near their thresholds, prefer TRANSITIONAL. Missing fields are null; do not infer them.',
    },
    criteria: {
      'RISK-ON': 'Broad uptrend across home, European and global indices, calm volatility, cyclicals leading, supportive central banks. Full position sizes and speculative positions are justified.',
      TRANSITIONAL: 'Mixed or turning signals: indices near their moving averages, disagreeing with each other, or momentum fading. Normal sizing, no speculative positions.',
      'RISK-OFF': 'Broad downtrend, elevated volatility, defensives leading or tightening central banks. Reduce new exposure and favour cash and quality.',
    },
  },
} as const;

export function jevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_AI_API_KEY);
}

// The endpoint is a capability URL, so anyone holding it can trigger Jev calls
// billed to our key. Two bounds keep a leaked URL from becoming a bill: a result
// cache (the regime moves over days, not minutes, so repeat callers get the cached
// answer), and a hard per-day cap on real calls. Both are in memory; a restart
// resets them, which costs at most one extra day's cap.
const JEV_CACHE_MS = intEnv('JEV_CACHE_MINUTES', 60) * 60_000;
const JEV_DAILY_LIMIT = intEnv('JEV_DAILY_LIMIT', 20);
const jevCache = new Map<string, { at: number; result: JevResult }>();
let jevDay = '';
let jevCallsToday = 0;

function intEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Cache key: which instruments were asked about, not their values. */
function cacheKey(inputs: RegimeInputs): string {
  return [inputs.home.symbol, inputs.europe.symbol, inputs.global.symbol, inputs.vix.symbol, ...inputs.sectors.map((s) => s.symbol).sort()].join(',');
}

export async function askJev(inputs: RegimeInputs, signal: AbortSignal): Promise<JevResult> {
  if (!jevEnabled()) return { status: 'disabled', reason: 'TYPESAFE_AI_API_KEY not set' };

  const key = cacheKey(inputs);
  const cached = jevCache.get(key);
  if (cached && Date.now() - cached.at < JEV_CACHE_MS) {
    return { ...cached.result, reason: `cached ${Math.round((Date.now() - cached.at) / 60_000)} min ago` };
  }

  const day = new Date().toISOString().slice(0, 10);
  if (day !== jevDay) {
    jevDay = day;
    jevCallsToday = 0;
  }
  if (jevCallsToday >= JEV_DAILY_LIMIT) {
    return { status: 'failed', reason: `daily Jev limit (${JEV_DAILY_LIMIT}) reached; rules result only until tomorrow (UTC)` };
  }
  // Counted before the call: a failed request may still be billed.
  jevCallsToday += 1;

  const result = await callJev(inputs, signal);
  if (result.status === 'ok') {
    // Bounded by the number of distinct symbol sets callers send; cap it anyway.
    if (jevCache.size >= 16) jevCache.delete(jevCache.keys().next().value as string);
    jevCache.set(key, { at: Date.now(), result });
  }
  return result;
}

async function callJev(inputs: RegimeInputs, signal: AbortSignal): Promise<JevResult> {
  const modelId = process.env.JEV_MODEL_ID || 'jev-latest';
  const started = performance.now();
  try {
    const r = await experimental_evaluate({
      model: typeSafeAi.evaluationModel(modelId),
      state: buildJevState(inputs),
      questions: QUESTIONS,
      maxRetries: 1,
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(JEV_TIMEOUT_MS)]),
    });
    const answer = r.answers.regime;
    const p = answer.probabilities ?? { [answer.choice]: 1 };
    return {
      status: 'ok',
      model: modelId,
      regime: answer.choice as Regime,
      probabilities: { 'RISK-ON': p['RISK-ON'] ?? 0, TRANSITIONAL: p.TRANSITIONAL ?? 0, 'RISK-OFF': p['RISK-OFF'] ?? 0 },
      latencyMs: Math.round(performance.now() - started),
      inputTokens: r.usage?.inputTokens ?? undefined,
    };
  } catch (err) {
    // Full detail goes to the server log only; callers hold nothing but the URL and
    // should not learn anything about our TypeSafe account from error text.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[market-data] jev failed: ${detail}`);
    const kind = /"error_type":"([a-z_]+)"/.exec(detail)?.[1] ?? (err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'request_failed');
    return { status: 'failed', model: modelId, reason: kind };
  }
}

/** Where rules and Jev meet: agreement plus how decisive Jev was. */
export function compare(rules: RulesResult, jev: JevResult) {
  if (jev.status !== 'ok' || !jev.probabilities || !rules.regime) {
    return { agreement: jev.status === 'ok' ? 'rules_insufficient' : 'jev_unavailable', jevTopProbability: null, jevProbabilityOfRulesRegime: null };
  }
  return {
    agreement: jev.regime === rules.regime ? 'agree' : 'disagree',
    jevTopProbability: Math.max(...Object.values(jev.probabilities)),
    jevProbabilityOfRulesRegime: jev.probabilities[rules.regime],
  };
}
