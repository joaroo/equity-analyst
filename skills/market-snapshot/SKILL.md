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
4. `rates` connector — policy rates, last changes and computed stance for the Riksbank, ECB and Fed from official data feeds, in one call
5. `research` connector (WebSearch/WebFetch) — optional forward guidance only

**Research budget: 2 calls, usually 0.** Rates and stance come from `rates`. Spend research calls only to read the official statement (`official_domain` / `decisions_page` in `investor-profile.json`) of a bank whose rate changed within the last 45 days, to add its forward guidance. A research call is one WebSearch or one WebFetch. Each returns 10–25k characters, so research calls dominate token use. Count them as you go. When the budget is reached, stop researching and list in the output what went without research — never exceed it silently. Structured calls (`quotes`, `indicators`, `history`) are cheap: batch symbols.

## Workflow Steps

### Step 1 — Fetch Market Data

Collect in parallel where possible:

1. Index levels (`quotes`): OMX Stockholm 30 `^OMX`, STOXX Europe 600 `^STOXX`, S&P 500 `^GSPC`, and `^VIX`
2. Trend (`indicators`): price vs 50-day and 200-day MA for `^OMX`, `^STOXX`, `^GSPC`
3. Central banks (`rates`, one call): copy each bank's policy rate, stance, last change and effective date **exactly as the tool returns them** — do not reinterpret the stance or re-derive dates. Optionally add forward guidance from an official statement (research budget above). Never take rates, moves or stance from news. If `rates` fails for a bank, set its stance to `"unverified"` and do not count it.
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
| Central banks — `net` from the weighted score below | Easing | On hold | Tightening |

**Central-bank `net`:** score each bank Tightening = +1, On hold = 0, Easing = −1 (unverified = 0), weight Riksbank ×3, ECB ×2, Fed ×1, and sum. Sum ≥ +2 → Tightening; sum ≤ −2 → Easing; otherwise On hold.

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
    "riksbank": { "stance": "Easing|On hold|Tightening|unverified", "policy_rate": "1.75%", "last_change": "cut 25 bp, effective YYYY-MM-DD", "guidance": null },
    "ecb": { "stance": "Easing|On hold|Tightening|unverified", "policy_rate": "deposit facility 0.00%", "last_change": "hike 25 bp, effective YYYY-MM-DD", "guidance": null },
    "fed": { "stance": "Easing|On hold|Tightening|unverified", "policy_rate": "0.00%–0.00%", "last_change": "...", "guidance": null },
    "net": "Easing|On hold|Tightening",
    "source": "central_bank_rates (Riksbank SWEA, ECB Data Portal, NY Fed)"
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
- Do not exceed 2 research calls
- Do not take central-bank rates, moves or stance from news or search results — use `rates`
- Do not classify regime with fewer than 5 of the 6 signals confirmed
- Do not cache this output across sessions — always fetch fresh

## Verification Checklist

- [ ] `fetched_at` is today's date
- [ ] At least 5 of 6 signals present before classifying regime
- [ ] Home, European and global index trend all taken from `indicators`
- [ ] Central-bank rates, stances and last changes copied from `rates`; `net` computed with the weighted score (Riksbank ×3, ECB ×2, Fed ×1)
- [ ] `sectors_5d_europe` contains at least 2 leading and 2 lagging entries
- [ ] `divergence` filled when home and global indices disagree
- [ ] JSON is valid with no trailing prose
- [ ] VIX signal label matches the level (Greed <15, Neutral 15–20, Caution 20–25, Fear >25)
