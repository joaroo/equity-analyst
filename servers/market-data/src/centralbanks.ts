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

// ---------------------------------------------------------------------------
// Meeting calendars — parsed from the official calendar pages. These are HTML,
// not APIs, so each parser is narrow and fails loudly; results are cached.

const FED_CALENDAR_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const ECB_CALENDAR_URL = 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html';
const RIKSBANK_CALENDAR_URL = (year: number) => `https://www.riksbank.se/en-gb/press-and-published/calendar/calendar-${year}/`;

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function monthNumber(name: string): number {
  const m = MONTHS[name.trim().slice(0, 3).toLowerCase()];
  if (!m) throw new Error(`unknown month "${name}"`);
  return m;
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/&#\d+;/g, ' ');
}

function textLines(html: string): string[] {
  return decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ''))
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** FOMC: "September" + "15-16*" → decision on the last day; "April/May" + "30-1" spans months. */
export function parseFedCalendar(html: string): string[] {
  const dates: string[] = [];
  const sections = html.split(/<h4><a[^>]*>(\d{4}) FOMC Meetings<\/a><\/h4>/);
  for (let i = 1; i < sections.length; i += 2) {
    const year = Number(sections[i]);
    const body = sections[i + 1];
    const rows = Array.from(body.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g));
    for (const [, monthText, dayText] of rows) {
      const months = monthText.split('/');
      const days = decodeEntities(dayText).replace(/[^\d-]/g, '').split('-').filter(Boolean);
      if (days.length === 0) continue;
      const lastMonth = monthNumber(months[months.length - 1]);
      dates.push(ymd(year, lastMonth, Number(days[days.length - 1])));
    }
  }
  if (dates.length === 0) throw new Error('no FOMC meetings found on calendar page');
  return dates.sort();
}

/** ECB: monetary policy meetings; the decision is announced on the final (or only) day. */
export function parseEcbCalendar(html: string): string[] {
  const dates: string[] = [];
  for (const m of Array.from(html.matchAll(/<dt[^>]*>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g))) {
    const text = textLines(m[4]).join(' ');
    if (!/monetary policy meeting/i.test(text) || /non-monetary/i.test(text) || /Day 1/i.test(text)) continue;
    dates.push(`${m[3]}-${m[2]}-${m[1]}`);
  }
  if (dates.length === 0) throw new Error('no ECB monetary policy meetings found on calendar page');
  // Some two-day meetings are listed without a "Day 1" label: keep only the last day.
  const sorted = [...new Set(dates)].sort();
  return sorted.filter((d, i) => i === sorted.length - 1 || daysBetween(d, sorted[i + 1]) > 1);
}

/** Riksbank: "24" / "Sept 2026" / "Publication of monetary policy decision…". */
export function parseRiksbankCalendar(html: string): string[] {
  const lines = textLines(html);
  const dates = new Set<string>();
  for (let i = 2; i < lines.length; i++) {
    if (!/^Publication of monetary policy decision/i.test(lines[i])) continue;
    const day = /^(\d{1,2})$/.exec(lines[i - 2]);
    const monthYear = /^([A-Za-z]+)\.? (\d{4})$/.exec(lines[i - 1]);
    if (!day || !monthYear) continue;
    dates.add(ymd(Number(monthYear[2]), monthNumber(monthYear[1]), Number(day[1])));
  }
  if (dates.size === 0) throw new Error('no Riksbank monetary policy decisions found on calendar page');
  return [...dates].sort();
}

const CALENDAR_TTL_MS = 12 * 60 * 60 * 1000;
const calendarCache = new Map<string, { at: number; dates: string[] }>();

async function cached(key: string, load: () => Promise<string[]>): Promise<string[]> {
  const hit = calendarCache.get(key);
  if (hit && Date.now() - hit.at < CALENDAR_TTL_MS) return hit.dates;
  const dates = await load();
  calendarCache.set(key, { at: Date.now(), dates });
  return dates;
}

export async function nextMeeting(bank: 'riksbank' | 'ecb' | 'fed', fetchText: Fetcher, today: Date): Promise<{ date: string; days: number; source: string } | null> {
  const todayIso = isoDate(today);
  let dates: string[];
  let source: string;
  if (bank === 'fed') {
    dates = await cached('fed', async () => parseFedCalendar(await fetchText(FED_CALENDAR_URL)));
    source = FED_CALENDAR_URL;
  } else if (bank === 'ecb') {
    dates = await cached('ecb', async () => parseEcbCalendar(await fetchText(ECB_CALENDAR_URL)));
    source = ECB_CALENDAR_URL;
  } else {
    const year = today.getUTCFullYear();
    dates = await cached(`riksbank-${year}`, async () => parseRiksbankCalendar(await fetchText(RIKSBANK_CALENDAR_URL(year))));
    source = RIKSBANK_CALENDAR_URL(year);
    if (!dates.some((d) => d >= todayIso)) {
      dates = await cached(`riksbank-${year + 1}`, async () => parseRiksbankCalendar(await fetchText(RIKSBANK_CALENDAR_URL(year + 1))));
      source = RIKSBANK_CALENDAR_URL(year + 1);
    }
  }
  const next = dates.find((d) => d >= todayIso);
  return next ? { date: next, days: daysBetween(todayIso, next), source } : null;
}
