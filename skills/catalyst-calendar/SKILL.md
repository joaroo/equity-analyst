# Skill: Catalyst Calendar

## Trigger Conditions

- Invoked via `/catalyst-calendar` command with portfolio JSON (holdings + watchlist)
- Invoked as Phase 0C of `/analyze` pipeline, running in parallel with market-snapshot
- Covers the next **4 weeks** from today's date
- Do NOT re-invoke if a fresh calendar was already generated in the same session (use cached output)

## Data Source Priority

1. `market-data` connector (see `.mcp.json`)
2. No fallback — all event dates must be confirmed via live search

Batch searches efficiently: search multiple tickers in a single Gemini call where possible (e.g., "earnings dates for AAPL MSFT NVDA AMZN next 4 weeks").

## Workflow Steps

### Step 1 — Per-Ticker Event Search

For each ticker in holdings + watchlist, search:
- `[TICKER] earnings date next quarter` — confirm exact date if within 4 weeks
- For biotech/pharma: `[TICKER] FDA approval date PDUFA catalyst`
- For consumer/tech: `[TICKER] product launch event conference`

Batch where possible: combine 3–5 tickers per Gemini call to minimize API usage.

### Step 2 — Macro Calendar

Search for the next 4 weeks of macro events affecting the portfolio:
- `FOMC meeting dates next month` — critical for rate-sensitive holdings (financials, utilities, REITs)
- `CPI inflation report date next` — macro volatility trigger
- `jobs report NFP date next` — macro sentiment
- `earnings season peak dates` — when the bulk of S&P 500 companies report

Include FOMC and major data releases only if they fall within the 4-week window.

### Step 3 — Aggregate and Sort

Compile all confirmed events into a single list sorted by date (earliest first).

For each event, assign a risk tier:

**HIGH risk:**
- Earnings for any holding/watchlist stock (binary outcome)
- FDA PDUFA date for biotech holding (binary outcome)
- Major product launch that is thesis-critical

**MEDIUM risk:**
- FOMC meeting (direction-setting for rate-sensitive positions)
- CPI/NFP data release
- Investor day or analyst day for a holding
- Earnings for a major sector peer (directional read-through)

**LOW risk:**
- Industry conferences (sentiment, not decision-making)
- Earnings for tangentially related companies
- Scheduled management presentations

### Step 4 — High-Risk Window Identification

Identify the densest concentration of HIGH-risk events:
- If 2+ HIGH-risk events fall within the same 5-day window: flag as "high-risk window"
- Recommend: reduce new position sizing during high-risk windows

### Step 5 — Emit Output

Return the structured JSON schema below plus a brief text summary. The JSON is consumed by downstream agents (portfolio-manager in `/analyze`). The text summary is human-readable.

## Output Schema

### JSON block (for pipeline consumption)

```json
{
  "generated_at": "YYYY-MM-DD",
  "horizon_days": 28,
  "events": [
    {
      "date": "YYYY-MM-DD",
      "ticker": "AAPL",
      "event_type": "earnings",
      "risk_tier": "HIGH",
      "notes": "Q1 FY2026 earnings, after market close. Implied move ±5%."
    },
    {
      "date": "YYYY-MM-DD",
      "ticker": "MACRO",
      "event_type": "fomc",
      "risk_tier": "MEDIUM",
      "notes": "FOMC rate decision. Rate-sensitive positions: XLF, VNQ."
    }
  ],
  "high_risk_windows": [
    {
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "affected_tickers": ["AAPL", "MSFT"],
      "note": "2 HIGH-risk earnings in 3 days — avoid new large entries"
    }
  ],
  "recommendation": "2-sentence portfolio-level action guidance based on the event density"
}
```

### Text summary (human-readable, follows JSON)

```markdown
## Catalyst Calendar — Next 4 Weeks

**Generated:** [Date]

### Upcoming Events

| Date | Ticker | Event | Risk |
|------|--------|-------|------|
| [Date] | AAPL | Q1 FY2026 Earnings (AMC) | 🔴 HIGH |
| [Date] | MACRO | FOMC Rate Decision | 🟡 MEDIUM |
| [Date] | MSFT | Q3 FY2026 Earnings (AMC) | 🔴 HIGH |

### High-Risk Window
🚨 [Date range]: [Tickers] reporting within [X] days — avoid new large entries

### Portfolio Guidance
[2 sentences on how to position given upcoming event density]
```

## Anti-Patterns

- Do not include events beyond 4 weeks (noise without actionability)
- Do not mark all events HIGH — risk tier must reflect actual binary outcome potential
- Do not generate the calendar without confirmed dates — if a date cannot be found, note "date unconfirmed" rather than estimating
- Do not omit FOMC meetings when portfolio contains rate-sensitive positions
- Batch Gemini calls (3–5 tickers per call) — do not make one call per ticker

## Verification Checklist

- [ ] Every HIGH-risk event has a confirmed date from live search
- [ ] Macro events (FOMC, CPI) checked for the 4-week window
- [ ] Risk tiers reflect actual binary outcome potential (not all events are HIGH)
- [ ] High-risk windows identified when 2+ HIGH events within 5 days
- [ ] JSON is valid with no trailing prose
- [ ] Text summary table matches the JSON events list
- [ ] Recommendation is 2 sentences max and portfolio-level (not stock-specific)
