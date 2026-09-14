---
name: earnings-preview
description: Pre-earnings analysis for one stock — confirmed report date, consensus estimates, last four quarters of beats and price reactions, options-implied move, bull/base/bear scenarios, and an Enter Before / Wait for Result / Avoid call. Use for /earnings-preview TICKER or when a holding reports within 7 days; not after results are out.
---

# Skill: Earnings Preview

## Trigger Conditions

- Invoked via `/earnings-preview TICKER` for any holding, watchlist, or prospective stock
- Invoked automatically when a stock in the portfolio has earnings within 7 days (binary event flag from technical-analysis skill)
- Requires: ticker symbol + today's date (to calculate days-to-earnings)
- Do NOT invoke post-earnings — use earnings-review skill instead

## Data Source Priority

1. `research` connector (WebSearch, then WebFetch for thin results) — earnings date, consensus estimates, analyst ratings, past report dates and beat/miss, options-implied move
2. `history` connector — actual stock reaction on past earnings days, computed from daily bars
3. `quotes` connector — current price (for converting the implied move into a per-share amount)

Symbols for `quotes` and `history` use exchange suffixes: Stockholm `VOLV-B.ST`, Helsinki `.HE`, Copenhagen `.CO`, Oslo `.OL`, Xetra `.DE`, London `.L`; US tickers take none; indices use a caret (`^GSPC`, `^VIX`, `^OMX`). A 404 usually means the wrong suffix.

All consensus estimates and options pricing must be searched, not assumed — they are search-derived, so cite the source. Never use estimates from training data. Price reactions come from `history`, not from articles.

**Research sources.** WebFetch only pages on the domains in `research_sources.fetch_allowed` (`investor-profile.json`) — each new domain triggers an approval prompt that would stall a scheduled run. Prefer those domains in WebSearch (`allowed_domains`) when they cover the need. If nothing on the list has it, record "not found" rather than fetching another site.

## Workflow Steps

### Step 1 — Earnings Date Confirmation

Search `[TICKER] earnings date next quarter`:
- Confirm exact date and time (before/after market)
- Calculate days away from today
- If already reported this quarter: flag and halt — suggest `/earnings-review` instead

### Step 2 — Consensus Estimates

Search `[TICKER] earnings estimates consensus`:
- EPS estimate (consensus, high, low)
- Revenue estimate (consensus, high, low)
- Key segment or metric estimates (e.g., MAUs for social, RPO for SaaS, same-store sales for retail)
- Year-over-year growth implied by estimates

Search `[TICKER] analyst ratings price targets`:
- Current consensus rating (Buy/Hold/Sell split)
- Average price target + range
- Recent rating changes (last 30 days)

### Step 3 — Historical Earnings Reactions

Search `[TICKER] earnings history results last 4 quarters`:

For each of the last 4 quarters:
- Did they beat or miss EPS? By how much?
- Did they beat or miss revenue? By how much?
- Stock reaction on earnings day (+/- %) — compute from `history` (`range: "1y"` or `"2y"`, `interval: "1d"`): close on the first session after the report vs the prior close
- Guidance: raised / maintained / lowered

Calculate:
- Beat rate: X of last 4 quarters beat EPS
- Average post-earnings move: ±X%
- Pattern: consistent beater? Guidance-dependent? Volatile?

### Step 4 — Options-Implied Move

Search `[TICKER] options implied move earnings`:
- Current options-implied move for earnings event (±%)
- If not directly available: search `[TICKER] straddle price earnings` or `[TICKER] IV earnings`
- Note: this is the market's expectation of magnitude, not direction

### Step 5 — Key Metrics to Watch

Based on sector/business model, identify the 3–5 metrics that will determine the market's reaction:

| Sector | Key Metrics |
|--------|-------------|
| Technology / SaaS | Revenue growth, net new ARR, net retention rate, operating margin |
| Consumer / Retail | Same-store sales, gross margin, inventory levels, guidance |
| Financials | Net interest margin, loan growth, credit quality (NCOs), fee income |
| Healthcare / Biotech | Trial data readout, approval status, sales ramp, pipeline updates |
| Energy | Production volumes, realized prices, capex guidance |
| General | EPS beat, revenue beat, forward guidance, management tone |

### Step 6 — Scenario Framework

Build three scenarios based on Steps 2–4:

**Bull Case** (beats estimates + raises guidance):
- EPS/Revenue: above consensus by X%
- Guidance: raised above current estimates
- Typical reaction: +X% (based on historical pattern)
- What would confirm: [specific metric thresholds]

**Base Case** (inline with estimates):
- EPS/Revenue: at or within 1–2% of consensus
- Guidance: maintained
- Typical reaction: ±X% (may trade on tone)
- What would confirm: [specific metric thresholds]

**Bear Case** (misses or guidance cut):
- EPS/Revenue: below consensus by X%
- Guidance: lowered or withdrawn
- Typical reaction: -X% (based on historical pattern)
- What would confirm: [specific triggers]

### Step 7 — Positioning Recommendation

Based on all evidence, recommend one of:

**ENTER BEFORE** — only if:
- Strong beat history (3+ of 4 last quarters)
- Options-implied move is small relative to upside potential
- Technical setup is strong (use context from technical-analysis if available)
- Conviction is high based on proprietary research edge

**WAIT FOR RESULT** (default) — if:
- Mixed history or first report under new management
- Large implied move relative to position size
- Technical setup is choppy or overbought

**AVOID ENTIRELY** — if:
- Binary outcome is unclear (e.g., FDA ruling, investigation outcome)
- Options-implied move is very large (>15%)
- Thesis depends entirely on guidance rather than business results

## Currency Rules

Show price targets and stop levels in the stock's native trading currency.

`[CCY]` in templates means the instrument's native trading currency (SEK for Nasdaq Stockholm, NOK Oslo, DKK Copenhagen, EUR Helsinki/Xetra/Euronext, GBP/GBp London, USD US exchanges). Position sizes and allocations are in the base currency from `investor-profile.json` (SEK by default), converted with `fx`.

Nordic companies often report in a different currency from their listing (e.g. EUR or USD reporting for Stockholm-listed shares): state the reporting currency of estimates and actuals separately from the share price currency.

## Output Schema

```markdown
## Earnings Preview: [TICKER] — [Company Name]

**Earnings Date:** [Date] ([X days away], [before/after market])

---

### Consensus Estimates
| Metric | Consensus | High | Low | YoY Growth |
|--------|-----------|------|-----|------------|
| EPS | X.XX [CCY] | X.XX [CCY] | X.XX [CCY] | +X% |
| Revenue | XB [CCY] | XB [CCY] | XB [CCY] | +X% |
| [Key metric] | X | X | X | +X% |

**Analyst Consensus:** X% Buy / X% Hold / X% Sell | Avg Target: XX [CCY]

---

### Historical Earnings Reactions (Last 4 Quarters)
| Quarter | EPS Beat | Rev Beat | Stock Reaction | Guidance |
|---------|----------|----------|----------------|----------|
| Q[X] [Year] | +X.XX [CCY] | +XM [CCY] | +X% | Raised |
| ... | | | | |

**Beat Rate:** X/4 EPS | X/4 Revenue | **Avg Move:** ±X%

---

### Options-Implied Move
**±X%** (= ±X.XX [CCY] per share at current price from `quotes`)
Interpretation: [Market expects X volatility; historical average is Y]

---

### Key Metrics to Watch
1. [Metric]: Consensus X — Bull >X / Bear <X
2. [Metric]: Consensus X — Bull >X / Bear <X
3. [Metric]: Consensus X — Bull >X / Bear <X

---

### Scenarios
**Bull Case (+X%):** [Beats + raises — specific numbers]
**Base Case (±X%):** [Inline — specific numbers]
**Bear Case (-X%):** [Misses / cuts guidance — specific numbers]

---

### Positioning Recommendation
**[ENTER BEFORE / WAIT FOR RESULT / AVOID]**

Rationale: [2–3 sentences on why, referencing history + implied move + setup]

If holding existing position:
- Pre-earnings action: [Hold / Trim X% / Exit]
- Post-beat action: [Add X SEK at market / Set limit at X [CCY]]
- Post-miss action: [Cut / Hold with stop at X [CCY]]
```

## Anti-Patterns

- Never use training-data estimates — always search for current consensus
- Never recommend ENTER BEFORE without checking historical beat rate
- Never ignore the options-implied move — it defines the risk magnitude
- Do not conflate stock reaction with business result (a beat can still drop if guidance is cut)
- Do not apply this skill to stocks that have already reported — use earnings-review skill

## Verification Checklist

- [ ] Earnings date confirmed with specific date and time (not approximate)
- [ ] Consensus estimates from live search (not assumed)
- [ ] At least 3 of last 4 quarters of historical reactions found (price moves computed from `history`)
- [ ] Options-implied move searched (not estimated)
- [ ] Key metrics identified based on sector/business model
- [ ] All 3 scenarios have specific numbers (not vague)
- [ ] Positioning recommendation is one of the three defined options
