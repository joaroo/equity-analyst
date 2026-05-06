# Skill: Market Snapshot

## Trigger Conditions

- Invoked at the start of any analysis pipeline (Phase 0 of `/analyze`)
- Invoked standalone via `/snapshot` command
- Do NOT invoke after fundamental analysis has already run in the same session — use the cached context block instead

## Data Source Priority

1. `market-data` connector (`mcp__gemini__gemini_generate` with `search: true`, model `gemini-3-flash-preview`)
2. No fallback — market snapshot requires live search data

Combine into **2–3 Gemini calls maximum** to avoid redundancy.

## Workflow Steps

### Step 1 — Fetch Market Data (2–3 calls)

Collect in parallel where possible:

1. S&P 500 current level, 50-day MA, 200-day MA
2. VIX current level
3. Federal Reserve latest FOMC decision and rate stance
4. Sector ETF performance past 5 days: Technology, Financials, Energy, Healthcare, Utilities, Consumer Staples

### Step 2 — Regime Classification

Apply the signal matrix:

| Signal | Risk-On | Transitional | Risk-Off |
|--------|---------|--------------|----------|
| S&P vs 50MA | Above >3% | Within ±3% | Below >3% |
| VIX | <15 | 15–20 | >20 |
| Sector leadership | Growth leading | Mixed | Defensive leading |
| Fed | Cutting | Pausing | Hiking |

Classify **RISK-ON** if 3+ signals align bullishly, **RISK-OFF** if 3+ align bearishly, **TRANSITIONAL** otherwise.

### Step 3 — Emit Output

Return only the JSON schema below. No preamble, no prose.

## Output Schema

```json
{
  "fetched_at": "YYYY-MM-DD",
  "regime": "RISK-ON",
  "sp500": {
    "level": 0,
    "vs_50ma_pct": 0.0,
    "vs_200ma_pct": 0.0
  },
  "vix": {
    "level": 0.0,
    "signal": "Greed"
  },
  "fed": {
    "stance": "Neutral",
    "last_decision": "..."
  },
  "sectors_5d": {
    "leading": ["Technology +X%", "Financials +X%"],
    "lagging": ["Utilities -X%", "Healthcare -X%"]
  },
  "implications": "2-sentence investment implication summary"
}
```

## Anti-Patterns

- Do not emit prose — JSON output only
- Do not make more than 3 Gemini calls (combine queries)
- Do not classify regime with fewer than 3 signals confirmed
- Do not cache this output across sessions — always fetch fresh

## Verification Checklist

- [ ] `fetched_at` is today's date
- [ ] All 4 signals present before classifying regime
- [ ] `sectors_5d` contains at least 2 leading and 2 lagging entries
- [ ] JSON is valid with no trailing prose
- [ ] VIX signal label matches the level (Greed <15, Neutral 15–20, Caution 20–25, Fear >25)
