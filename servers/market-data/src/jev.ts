/**
 * Shared plumbing for TypeSafe Jev calls: the enable check, model id, per-day call
 * caps, and pulling TypeSafe's per-question confidence out of provider metadata.
 *
 * The market-data endpoint is a capability URL, so anyone holding it can trigger
 * Jev calls billed to our key. Every caller therefore counts calls against a hard
 * per-day cap before calling. Caps are in memory; a restart resets them, which
 * costs at most one extra day's cap.
 */

export function jevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_AI_API_KEY);
}

export function jevModelId(): string {
  return process.env.JEV_MODEL_ID || 'jev-latest';
}

export function intEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Counts real calls per UTC day. `take()` is called before the request: a failed request may still be billed. */
export class DailyCap {
  private day = '';
  private used = 0;
  readonly limit: number;
  constructor(limit: number) {
    this.limit = limit;
  }

  take(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
    if (this.used >= this.limit) return false;
    this.used += 1;
    return true;
  }
}

/**
 * TypeSafe confidence is a separate statistic from the answer's probabilities,
 * reported for choice and score answers under `providerMetadata.typesafe.confidence`.
 * Absent or malformed metadata yields an empty record, never an error.
 */
export function confidenceOf(providerMetadata: unknown): Record<string, number> {
  const raw = (providerMetadata as { typesafe?: { confidence?: unknown } } | undefined)?.typesafe?.confidence;
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number'));
}

/**
 * Full detail goes to the server log only; callers hold nothing but the URL and
 * should not learn anything about our TypeSafe account from error text.
 */
export function jevFailureKind(err: unknown, context: string): string {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[market-data] jev failed (${context}): ${detail}`);
  return /"error_type":"([a-z_]+)"/.exec(detail)?.[1] ?? (err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'request_failed');
}
