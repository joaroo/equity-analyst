/**
 * Policy rates from official central-bank data feeds, so a regime signal never
 * depends on which news article a search happened to return.
 *
 * Sources (no API keys):
 *   - Sveriges Riksbank SWEA API — policy rate series SECBREPOEFF (daily)
 *   - ECB Data Portal — key ECB rates, one observation per change (effective date)
 *   - Federal Reserve Bank of New York Markets API — EFFR with target range (daily)
 *
 * Dates are the dates a rate took effect, not decision dates: the Riksbank and
 * the ECB apply decisions several days later, the Fed the next business day.
 */

export type Fetcher = (url: string) => Promise<string>;

export interface RateChange {
  effectiveDate: string;
  from: number;
  to: number;
}

export interface BankRates {
  bank: string;
  rateLabel: string;
  current: number;
  currentText: string;
  asOf: string;
  lastChange: RateChange | null;
  previousChange: RateChange | null;
  extra?: string;
  source: string;
}

/** A change within this many days sets the stance; older than that is "On hold". */
export const HOLD_AFTER_DAYS = 120;

const RIKSBANK_URL = 'https://api.riksbank.se/swea/v1/Observations/SECBREPOEFF';
const ECB_URL = 'https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR';
const NYFED_URL = 'https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

function pct(value: number): string {
  return `${Number(value.toFixed(3))}%`;
}

/** Walks a date-sorted series and returns its changes, newest last. */
export function findChanges(series: Array<{ date: string; value: number }>): RateChange[] {
  const changes: RateChange[] = [];
  for (let i = 1; i < series.length; i++) {
    if (series[i].value !== series[i - 1].value) {
      changes.push({ effectiveDate: series[i].date, from: series[i - 1].value, to: series[i].value });
    }
  }
  return changes;
}

export async function riksbankRates(fetchText: Fetcher, today: Date): Promise<BankRates> {
  const from = isoDate(new Date(today.getTime() - 800 * 86_400_000));
  const body = JSON.parse(await fetchText(`${RIKSBANK_URL}/${from}/${isoDate(today)}`)) as Array<{ date: string; value: number }>;
  const series = body.filter((o) => typeof o.value === 'number').sort((a, b) => a.date.localeCompare(b.date));
  if (series.length === 0) throw new Error('Riksbank API returned no observations');
  const changes = findChanges(series);
  const last = series[series.length - 1];
  return {
    bank: 'Sveriges Riksbank',
    rateLabel: 'policy rate',
    current: last.value,
    currentText: pct(last.value),
    asOf: last.date,
    lastChange: changes.at(-1) ?? null,
    previousChange: changes.at(-2) ?? null,
    source: 'Riksbank SWEA API (SECBREPOEFF)',
  };
}

async function ecbSeries(fetchText: Fetcher, key: string): Promise<Array<{ date: string; value: number }>> {
  const csv = await fetchText(`${ECB_URL}.${key}.LEV?lastNObservations=4&format=csvdata`);
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const cols = header.split(',');
  const dateIdx = cols.indexOf('TIME_PERIOD');
  const valueIdx = cols.indexOf('OBS_VALUE');
  if (dateIdx < 0 || valueIdx < 0) throw new Error('ECB Data Portal response had an unexpected shape');
  return rows
    .map((row) => row.split(','))
    .map((c) => ({ date: c[dateIdx], value: Number(c[valueIdx]) }))
    .filter((o) => o.date && Number.isFinite(o.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function ecbRates(fetchText: Fetcher): Promise<BankRates> {
  const [dfr, mro, mlf] = await Promise.all([
    ecbSeries(fetchText, 'DFR'),
    ecbSeries(fetchText, 'MRR_FR'),
    ecbSeries(fetchText, 'MLFR'),
  ]);
  if (dfr.length === 0) throw new Error('ECB Data Portal returned no deposit facility rate');
  // Each observation in these series is a change, so consecutive points are the moves.
  const changes = findChanges(dfr);
  const last = dfr[dfr.length - 1];
  const extra = [mro.at(-1) && `main refinancing ${pct(mro.at(-1)!.value)}`, mlf.at(-1) && `marginal lending ${pct(mlf.at(-1)!.value)}`]
    .filter(Boolean)
    .join(', ');
  return {
    bank: 'European Central Bank',
    rateLabel: 'deposit facility rate',
    current: last.value,
    currentText: pct(last.value),
    asOf: last.date,
    lastChange: changes.at(-1) ?? null,
    previousChange: changes.at(-2) ?? null,
    extra: extra || undefined,
    source: 'ECB Data Portal (FM.B.U2.EUR.4F.KR.DFR/MRR_FR/MLFR)',
  };
}

export async function fedRates(fetchText: Fetcher, today: Date): Promise<BankRates> {
  const start = isoDate(new Date(today.getTime() - 800 * 86_400_000));
  const body = JSON.parse(await fetchText(`${NYFED_URL}?startDate=${start}&endDate=${isoDate(today)}`)) as {
    refRates?: Array<{ effectiveDate: string; percentRate?: number; targetRateFrom?: number; targetRateTo?: number }>;
  };
  const obs = (body.refRates ?? [])
    .filter((o) => typeof o.targetRateFrom === 'number' && typeof o.targetRateTo === 'number')
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  if (obs.length === 0) throw new Error('NY Fed API returned no target range');
  // Track the upper bound of the target range; the range always moves as a pair.
  const changes = findChanges(obs.map((o) => ({ date: o.effectiveDate, value: o.targetRateTo! })));
  const last = obs[obs.length - 1];
  return {
    bank: 'US Federal Reserve',
    rateLabel: 'federal funds target range (upper bound)',
    current: last.targetRateTo!,
    currentText: `${pct(last.targetRateFrom!)}–${pct(last.targetRateTo!)}`,
    asOf: last.effectiveDate,
    lastChange: changes.at(-1) ?? null,
    previousChange: changes.at(-2) ?? null,
    extra: typeof last.percentRate === 'number' ? `effective fed funds rate ${pct(last.percentRate)}` : undefined,
    source: 'Federal Reserve Bank of New York Markets API (EFFR)',
  };
}

export function stanceOf(rates: BankRates, today: Date): { stance: 'Tightening' | 'Easing' | 'On hold'; reason: string } {
  const change = rates.lastChange;
  if (!change) return { stance: 'On hold', reason: 'no change in the data window (~2 years)' };
  const days = daysBetween(change.effectiveDate, isoDate(today));
  const direction = change.to > change.from ? 'hike' : 'cut';
  if (days <= HOLD_AFTER_DAYS) {
    return {
      stance: direction === 'hike' ? 'Tightening' : 'Easing',
      reason: days < 0 ? `${direction} decided, takes effect in ${-days} day(s)` : `${direction} ${days} day(s) ago`,
    };
  }
  return { stance: 'On hold', reason: `no change for ${days} days; last move a ${direction}` };
}

export function describeChange(change: RateChange | null, today: Date): string {
  if (!change) return 'none in the data window';
  const bp = Math.round((change.to - change.from) * 100);
  const days = daysBetween(change.effectiveDate, isoDate(today));
  const when = days < 0 ? `takes effect ${change.effectiveDate} (in ${-days} days)` : `effective ${change.effectiveDate} (${days} days ago)`;
  return `${bp > 0 ? 'hike' : 'cut'} ${Math.abs(bp)} bp from ${pct(change.from)} to ${pct(change.to)}, ${when}`;
}
