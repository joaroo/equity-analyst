# Skill: Earnings Preview

## Trigger Conditions

- Invoked via `/earnings-preview TICKER` for any holding, watchlist, or prospective stock
- Invoked automatically when a stock in the portfolio has earnings within 7 days (binary event flag from technical-analysis skill)
- Requires: ticker symbol + today's date (to calculate days-to-earnings)
- Do NOT invoke post-earnings — use earnings-review skill instead

## Data Source Priority

1. `market-data` connector (see `.mcp.json`)
2. No fallback — all data must be live-searched; never use estimates from training data

All consensus estimates, options pricing, and historical reactions must be searched, not assumed.

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
- Stock reaction on earnings day (+/- %)
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

Show all price targets, stop levels, and position sizes in the stock's native trading currency (USD for NYSE/NASDAQ, GBP for LSE, EUR for Euronext, etc.).

## Output Schema

```markdown
## Earnings Preview: [TICKER] — [Company Name]

**Earnings Date:** [Date] ([X days away], [before/after market])

---

### Consensus Estimates
| Metric | Consensus | High | Low | YoY Growth |
|--------|-----------|------|-----|------------|
| EPS | $X.XX | $X.XX | $X.XX | +X% |
| Revenue | $XB | $XB | $XB | +X% |
| [Key metric] | X | X | X | +X% |

**Analyst Consensus:** X% Buy / X% Hold / X% Sell | Avg Target: $XX

---

### Historical Earnings Reactions (Last 4 Quarters)
| Quarter | EPS Beat | Rev Beat | Stock Reaction | Guidance |
|---------|----------|----------|----------------|----------|
| Q[X] [Year] | +$X.XX | +$XM | +X% | Raised |
| ... | | | | |

**Beat Rate:** X/4 EPS | X/4 Revenue | **Avg Move:** ±X%

---

### Options-Implied Move
**±X%** (= ±$X.XX per share at current price)
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
- Post-beat action: [Add $X at market / Set limit at $X]
- Post-miss action: [Cut / Hold with stop at $X]
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
- [ ] At least 3 of last 4 quarters of historical reactions found
- [ ] Options-implied move searched (not estimated)
- [ ] Key metrics identified based on sector/business model
- [ ] All 3 scenarios have specific numbers (not vague)
- [ ] Positioning recommendation is one of the three defined options
