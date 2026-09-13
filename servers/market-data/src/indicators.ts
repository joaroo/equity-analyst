/**
 * Technical indicators computed from daily bars. Pure functions, no I/O, so the
 * numbers an agent quotes are calculated here rather than estimated in-context.
 *
 * Conventions match common charting defaults: simple moving averages, Wilder's
 * smoothing for RSI, and EMA-based MACD seeded with an SMA.
 */

export interface Bar {
  date: string;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
  /** Most recent MACD/signal crossover within the last 5 bars, if any. */
  crossover: { direction: 'bullish' | 'bearish'; barsAgo: number } | null;
}

export interface Indicators {
  asOf: string;
  close: number;
  bars: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: MacdResult | null;
  high52w: number | null;
  low52w: number | null;
  high20d: number | null;
  low20d: number | null;
  /** Latest volume ÷ average volume of the 20 sessions before it. */
  volumeVs20dAvg: number | null;
  /** Total volume on up days ÷ total volume on down days over the last 20 sessions. */
  upDownVolumeRatio20d: number | null;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** EMA series aligned to `values` (entries before the seed are null). */
export function emaSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let ema = seed / period;
  out[period - 1] = ema;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/** RSI with Wilder's smoothing over the full series. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult | null {
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const line: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f !== null && s !== null) line.push(f - s);
  }
  const signal = emaSeries(line, signalPeriod);
  const last = line.length - 1;
  const lastSignal = signal[last];
  if (last < 0 || lastSignal === null || lastSignal === undefined) return null;

  let crossover: MacdResult['crossover'] = null;
  for (let barsAgo = 0; barsAgo < 5; barsAgo++) {
    const i = last - barsAgo;
    const prevSignal = signal[i - 1];
    const curSignal = signal[i];
    if (i < 1 || prevSignal === null || curSignal === null) break;
    const before = line[i - 1] - prevSignal;
    const after = line[i] - curSignal;
    if (before <= 0 && after > 0) {
      crossover = { direction: 'bullish', barsAgo };
      break;
    }
    if (before >= 0 && after < 0) {
      crossover = { direction: 'bearish', barsAgo };
      break;
    }
  }

  return { macd: line[last], signal: lastSignal, histogram: line[last] - lastSignal, crossover };
}

export function computeIndicators(bars: Bar[]): Indicators | null {
  if (bars.length === 0) return null;
  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];

  const window52w = bars.slice(-252);
  const window20d = bars.slice(-20);

  let volumeVs20dAvg: number | null = null;
  const prior = bars.slice(-21, -1).map((b) => b.volume).filter((v): v is number => v !== null && v > 0);
  if (last.volume !== null && prior.length === 20) {
    volumeVs20dAvg = last.volume / (prior.reduce((a, b) => a + b, 0) / prior.length);
  }

  let upDownVolumeRatio20d: number | null = null;
  if (bars.length >= 21) {
    let up = 0;
    let down = 0;
    for (let i = bars.length - 20; i < bars.length; i++) {
      const v = bars[i].volume;
      if (v === null) continue;
      if (bars[i].close > bars[i - 1].close) up += v;
      else if (bars[i].close < bars[i - 1].close) down += v;
    }
    upDownVolumeRatio20d = down > 0 ? up / down : null;
  }

  return {
    asOf: last.date,
    close: last.close,
    bars: bars.length,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    high52w: bars.length >= 252 ? Math.max(...window52w.map((b) => b.high)) : null,
    low52w: bars.length >= 252 ? Math.min(...window52w.map((b) => b.low)) : null,
    high20d: bars.length >= 20 ? Math.max(...window20d.map((b) => b.high)) : null,
    low20d: bars.length >= 20 ? Math.min(...window20d.map((b) => b.low)) : null,
    volumeVs20dAvg,
    upDownVolumeRatio20d,
  };
}
