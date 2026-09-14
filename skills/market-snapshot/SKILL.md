---
name: market-snapshot
description: Fetch current market conditions and classify the regime as RISK-ON, TRANSITIONAL or RISK-OFF from home-market, European and global index trend, volatility, European sector leadership and central-bank stance; returns compact JSON only. Use at the start of /analyze, for /snapshot, or when asked about the current market regime.
---

# Skill: Market Snapshot

## Trigger Conditions

- Invoked at the start of any analysis pipeline (Phase 0 of `/analyze`)
- Invoked standalone via `/snapshot` command
- Do NOT invoke after fundamental analysis has already run in the same session — use the cached context block instead

## Investor Context

Read `investor-profile.json` first. It defines the home market, the regional and global indices, the sector proxies, and the central banks. The steps below name the default (Swedish) symbols; if the profile differs, use the profile's.

## Data Source Priority

1. `quotes` connector — index and volatility levels in one call: home index (`^OMX`), regional index (`^STOXX`), global index (`^GSPC`), `^VIX`
2. `indicators` connector — 50/200-day moving-average distance for the home, regional and global indices in one call
3. `history` connector — 5-day returns for the European sector proxies (`range: "5d"`, `interval: "1d"`)
4. `research` connector (WebSearch/WebFetch) — central-bank stance only

**Research budget: 8 calls** — per central bank, one WebSearch restricted to its official domain plus one WebFetch of the official decision statement (three banks by default), plus up to 2 extra fetches in total for the decisions-page fallback. A research call is one WebSearch or one WebFetch. Each returns 10–25k characters, so research calls dominate token use. Count them as you go. When the budget is reached, stop researching and list in the output what went without research — never exceed it silently. Structured calls (`quotes`, `indicators`, `history`) are cheap: batch symbols.

## Workflow Steps

### Step 1 — Fetch Market Data

Collect in parallel where possible:

1. Index levels (`quotes`): OMX Stockholm 30 `^OMX`, STOXX Europe 600 `^STOXX`, S&P 500 `^GSPC`, and `^VIX`
2. Trend (`indicators`): price vs 50-day and 200-day MA for `^OMX`, `^STOXX`, `^GSPC`
3. Central banks (`research`), **official sources only** — domains and decision pages are in `investor-profile.json` (`riksbank.se`, `ecb.europa.eu`, `federalreserve.gov`):
   - WebSearch with `allowed_domains` set to the bank's official domain: `[bank] monetary policy decision [month year]`
   - WebFetch the most recent decision statement or press release it returns. If the search does not return an actual statement, fetch the bank's `decisions_page` from `investor-profile.json` and then the newest decision document it links (the Riksbank publishes decisions as PDFs, newest first — see `decisions_note`). Never report a listing or index page as the `source`
   - Take the rate level, the direction of the last change, the decision date and the forward guidance **from that statement only**. Do not use news articles, previews or market-pricing commentary for the stance; you may mention market expectations separately, labelled as such.
   - If the official statement cannot be retrieved, set that bank's stance to `"unverified"` and do not count it as a signal
4. European sector leadership (`history`, 5-day return) for the profile's sector proxies:
   - Cyclical: Technology `EXV3.DE`, Industrial Goods & Services `EXH4.DE`, Banks `EXV1.DE`, Basic Resources `EXV6.DE`
   - Defensive: Health Care `EXV4.DE`, Utilities `EXH9.DE`, Food & Beverage `EXH3.DE`
   - Energy: Oil & Gas `EXH1.DE` (report it, but it counts as neither cyclical nor defensive)

### Step 2 — Regime Classification

Apply the signal matrix:

| Signal | Risk-On | Transitional | Risk-Off |
|--------|---------|--------------|----------|
| Home index (OMXS30) vs 50MA | Above >3% | Within ±3% | Below >3% |
| Europe (STOXX 600) vs 50MA | Above >3% | Within ±3% | Below >3% |
| Global (S&P 500) vs 50MA | Above >3% | Within ±3% | Below >3% |
| VIX | <15 | 15–20 | >20 |
| European sector leadership | Cyclicals leading | Mixed | Defensives leading |
| Central banks (weighted: Riksbank > ECB > Fed) | Net easing | On hold or mixed | Net tightening |

Classify **RISK-ON** if 4+ of the 6 signals are bullish and at most 1 is bearish; **RISK-OFF** if 4+ are bearish and at most 1 is bullish; **TRANSITIONAL** otherwise.

When the home index and the global index point in opposite directions, set `divergence` to describe it. The home index decides ties, because it drives most of the portfolio.

### Step 3 — Emit Output

Return only the JSON schema below. No preamble, no prose. Report index levels exactly as returned by `quotes` (two decimals), not rounded.

## Output Schema

```json
{
  "fetched_at": "YYYY-MM-DD",
  "regime": "RISK-ON",
  "home_index": {
    "name": "OMX Stockholm 30",
    "level": 0.0,
    "vs_50ma_pct": 0.0,
    "vs_200ma_pct": 0.0
  },
  "europe_index": {
    "name": "STOXX Europe 600",
    "level": 0,
    "vs_50ma_pct": 0.0,
    "vs_200ma_pct": 0.0
  },
  "global_index": {
    "name": "S&P 500",
    "level": 0,
    "vs_50ma_pct": 0.0,
    "vs_200ma_pct": 0.0
  },
  "vix": {
    "level": 0.0,
    "signal": "Greed"
  },
  "central_banks": {
    "riksbank": { "stance": "Easing|On hold|Tightening|unverified", "decision_date": "YYYY-MM-DD", "last_decision": "...", "source": "official URL" },
    "ecb": { "stance": "Easing|On hold|Tightening|unverified", "decision_date": "YYYY-MM-DD", "last_decision": "...", "source": "official URL" },
    "fed": { "stance": "Easing|On hold|Tightening|unverified", "decision_date": "YYYY-MM-DD", "last_decision": "...", "source": "official URL" },
    "net": "Easing|On hold|Tightening"
  },
  "sectors_5d_europe": {
    "leading": ["Technology +X%", "Banks +X%"],
    "lagging": ["Utilities -X%", "Health Care -X%"]
  },
  "divergence": null,
  "implications": "2-sentence investment implication summary for a Swedish portfolio"
}
```

## Anti-Patterns

- Do not emit prose — JSON output only
- Do not take index levels, moving averages, VIX or sector returns from search results — use `quotes`/`indicators`/`history`
- Do not classify the regime from US signals alone — the home and European signals are required
- Do not exceed 8 research calls
- Do not take a central bank's decision from news, previews or aggregator sites — only from its official statement
- Do not classify regime with fewer than 5 of the 6 signals confirmed
- Do not cache this output across sessions — always fetch fresh

## Verification Checklist

- [ ] `fetched_at` is today's date
- [ ] At least 5 of 6 signals present before classifying regime
- [ ] Home, European and global index trend all taken from `indicators`
- [ ] Each central-bank stance comes from an official statement, with `decision_date` and `source` filled (or `unverified`); `net` reflects the Riksbank > ECB > Fed weighting
- [ ] `sectors_5d_europe` contains at least 2 leading and 2 lagging entries
- [ ] `divergence` filled when home and global indices disagree
- [ ] JSON is valid with no trailing prose
- [ ] VIX signal label matches the level (Greed <15, Neutral 15–20, Caution 20–25, Fear >25)
