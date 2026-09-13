---
name: catalyst-calendar
description: Four-week forward scan of holdings and watchlist for binary and directional events — earnings, regulatory decisions, product events, central-bank meetings and major macro releases — ranked HIGH/MEDIUM/LOW with high-risk windows flagged. Use in /analyze Phase 0, for /catalyst-calendar, or when asked what events are coming up.
---

# Skill: Catalyst Calendar

## Trigger Conditions

- Invoked via `/catalyst-calendar` command with portfolio JSON (holdings + watchlist)
- Invoked as Phase 0C of `/analyze` pipeline, running in parallel with market-snapshot
- Covers the next **4 weeks** from today's date
- Do NOT re-invoke if a fresh calendar was already generated in the same session (use cached output)

## Data Source Priority

1. `research` connector (WebSearch, then WebFetch on the best URL) — every event date
2. No fallback — all event dates must be confirmed via live search

One ticker per search. `research` ranks pages by how well they match a single subject, so a multi-ticker query ("interim report dates for VOLV-B ERIC-B INVE-B SAND") returns a roundup article that matches all four weakly instead of the four filings that each confirm a date. Describe the page you want ("Volvo Q3 2026 interim report publication date"), not keywords.

## Workflow Steps

### Step 1 — Per-Ticker Event Search

For each ticker in holdings + watchlist, search:
- `[TICKER] earnings date next quarter` — confirm exact date if within 4 weeks
- For biotech/pharma: `[TICKER] FDA approval date PDUFA catalyst`
- For consumer/tech: `[TICKER] product launch event conference`

One query per ticker. Searches are unmetered, so the cost of an extra call is context, not billing — and a confirmed date is worth more than a saved call.

### Step 2 — Macro Calendar

Search for the next 4 weeks of macro events affecting the portfolio, home market first (central banks and releases from `investor-profile.json`, one subject per query):
- `Riksbank monetary policy decision dates` — critical for Swedish banks, real estate and SEK
- `Swedish CPI CPIF release date Statistics Sweden` — drives Riksbank expectations
- `ECB monetary policy meeting dates` — euro-area rates and EUR-denominated holdings
- `euro area HICP flash estimate release date`
- `FOMC meeting dates` — global risk sentiment and USD holdings
- `US CPI release date` and `US jobs report release date` — global macro volatility
- `Nasdaq Stockholm reporting season dates` and, if the portfolio holds US stocks, `US earnings season peak dates`

Include central-bank meetings and major data releases only if they fall within the 4-week window.

### Step 3 — Aggregate and Sort

Compile all confirmed events into a single list sorted by date (earliest first).

For each event, assign a risk tier:

**HIGH risk:**
- Earnings (interim report / kvartalsrapport) for any holding/watchlist stock (binary outcome)
- Regulatory decision for a holding — e.g. FDA PDUFA or EMA opinion for a biotech/medtech holding (binary outcome)
- Major product launch that is thesis-critical

**MEDIUM risk:**
- Riksbank, ECB or FOMC decision (direction-setting for rate-sensitive positions; Riksbank first for Swedish holdings)
- Swedish CPI, euro-area HICP, US CPI or US jobs release
- Capital markets day for a holding
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
      "ticker": "VOLV-B.ST",
      "event_type": "earnings",
      "risk_tier": "HIGH",
      "notes": "Q3 2026 interim report, before market open. Implied move ±5%."
    },
    {
      "date": "YYYY-MM-DD",
      "ticker": "MACRO",
      "event_type": "central_bank",
      "risk_tier": "MEDIUM",
      "notes": "Riksbank policy decision. Rate-sensitive holdings: Swedish banks and real estate."
    }
  ],
  "high_risk_windows": [
    {
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "affected_tickers": ["VOLV-B.ST", "ERIC-B.ST"],
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
| [Date] | VOLV-B.ST | Q3 2026 Interim Report (pre-market) | 🔴 HIGH |
| [Date] | MACRO | Riksbank Policy Decision | 🟡 MEDIUM |
| [Date] | ERIC-B.ST | Q3 2026 Interim Report (pre-market) | 🔴 HIGH |

### High-Risk Window
🚨 [Date range]: [Tickers] reporting within [X] days — avoid new large entries

### Portfolio Guidance
[2 sentences on how to position given upcoming event density]
```

## Anti-Patterns

- Do not include events beyond 4 weeks (noise without actionability)
- Do not mark all events HIGH — risk tier must reflect actual binary outcome potential
- Do not generate the calendar without confirmed dates — if a date cannot be found, note "date unconfirmed" rather than estimating
- Do not omit Riksbank, ECB or FOMC meetings when the portfolio contains rate-sensitive positions in those currencies
- Do not put multiple tickers in one `research` query — one focused query per ticker

## Verification Checklist

- [ ] Every HIGH-risk event has a confirmed date from live search
- [ ] Macro events (Riksbank, ECB, FOMC; Swedish, euro-area and US inflation) checked for the 4-week window
- [ ] Risk tiers reflect actual binary outcome potential (not all events are HIGH)
- [ ] High-risk windows identified when 2+ HIGH events within 5 days
- [ ] JSON is valid with no trailing prose
- [ ] Text summary table matches the JSON events list
- [ ] Recommendation is 2 sentences max and portfolio-level (not stock-specific)
