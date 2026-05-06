# Skill: Portfolio Management

## Trigger Conditions

- Invoked after both fundamental-analysis and technical-analysis skills have completed
- Requires: fundamental analyst report (with `<analysis-json>` block) + technical analyst report (with `<technical-json>` block)
- Optional: catalyst calendar JSON from catalyst-calendar skill — if present, use it for binary event context instead of searching individually per stock
- If structured JSON blocks are missing, extract scores from free-text reports
- Do NOT invoke without both analyst reports

## Data Source Priority

1. Extract scores from `<analysis-json>` and `<technical-json>` blocks if present
2. Extract binary event data from catalyst calendar JSON if present (skip per-stock earnings searches)
3. If blocks missing: parse free-text reports for scores
4. `market-data` connector (see `.mcp.json`) — for supplemental price lookups only

## Workflow Steps

### Step 1 — Extract Market Regime & Weighting

From fundamental analysis, identify:
- **Market Regime:** RISK-ON / TRANSITIONAL / RISK-OFF
- **Recommended deployment range:** X–Y%

This determines scoring weights:

| Stock Type | Market Regime | Fund Weight | Tech Weight |
|------------|---------------|-------------|-------------|
| Growth | Risk-On | 35% | 65% |
| Growth | Transitional | 45% | 55% |
| Growth | Risk-Off | 60% | 40% |
| Value | Risk-On | 55% | 45% |
| Value | Transitional | 60% | 40% |
| Value | Risk-Off | 70% | 30% |

Growth stocks in bull markets = timing is everything (tech has more say). Value stocks in bear markets = safety is everything (fundamental has more say).

### Step 2 — Calculate Combined Scores

For EACH opportunity (existing holdings + new buys + **watching stocks**):

```
Combined Score = (Fundamental Score × Fund Weight) + (Technical Score × Tech Weight)
```

Round to 1 decimal place.

| Ticker | Type | Fund Score | Tech Score | Fund Weight | Tech Weight | Combined Score |
|--------|------|-----------|-----------|-------------|-------------|----------------|
| TICKER | Growth/Value | X.X/10 | X.X/10 | XX% | XX% | X.X/10 |

### Step 3 — Decision Categories

**✅ STRONG BUY** — Deploy full recommended allocation

Criteria:
- Combined score ≥ 6.0 (Risk-On), ≥6.5 (Transitional), or ≥7.0 (Risk-Off)
- Both analysts support the opportunity
- No major timing issues OR binary event risk is acceptable

---

**🎯 BINARY EVENT SPECIAL CASE** — Earnings/FDA/legal within 3 days

When combined score ≥6.5 AND 🚨🚨🚨 BINARY EVENT flag present:

**IF NO EXISTING POSITION:**
- Option A: Skip this week, revisit post-event (conservative)
- Option B: Enter 25–50% of normal size (accept binary risk)

**IF SMALL POSITION (<2% of portfolio):**
- Calculate actual risk: Position $ × Implied Move %
- If risk <$50 or <0.5% portfolio: HOLD THROUGH
- Do not add before event; set post-event strategy

**IF MEDIUM POSITION (2–5% of portfolio):**
- TRIM to 2% before event (lock some gains, reduce risk)
- Hold remaining through; reassess post-event

**IF LARGE POSITION (>5% of portfolio):**
- TRIM to 2–3% before event (risk management)

Example: Combined score 8.6/10 + earnings today + position $103 = 1% portfolio = $10 actual risk → HOLD through, no new capital before event, deploy $30–40 post-earnings if beats.

---

**⚠️ CONDITIONAL BUY** — Reduce size OR wait for condition

Criteria: Combined score in "maybe" zone (5.5–6.5 depending on regime), OR one analyst enthusiastic and other cautious, OR good opportunity but poor timing.

Options: A) Reduce size 50/50 split. B) Set alert at price level. C) Skip this week, revisit next.

---

**❌ SKIP** — Do not deploy capital

Criteria: Combined score below threshold, both analysts skeptical, or critical risk flags.

---

**🏦 WATCHING STOCK** — Buy / Keep Watching / Stop Watching

Show: watching since date, price at watch start, current price, change since watch start, combined score, action + rationale.

---

**🏦 EXISTING POSITION MANAGEMENT**

Evaluate:
- Days held, entry price, current price, P&L%

**Decision Logic by P&L:**

IF P&L < 0 (losing):
- Combined ≥6.0: Hold with stop (thesis intact)
- Combined <6.0: Consider cutting (thesis deteriorating)

IF P&L 0–10% (small gain/scratch):
- Do NOT recommend "taking profits" — treat like new position
- Hold if score ≥6.0

IF P&L 10–25% (moderate gain):
- Combined ≥7.0: Hold all
- Combined 5–7: Hold all + trailing stop
- Combined <5.0: Trim 25–50%

IF P&L >25% (significant gain):
- Combined ≥7.0: Hold + consider trailing stop
- Combined 5–7: Trim 30–50%
- Combined <5.0: Trim 50–75%

IF Binary Risk (<3 days):
- P&L >20%: Strongly consider trimming 50%+ regardless of score
- P&L <10%: Hold if conviction high, otherwise trim 25%

**Stop-Loss Assignment:**
- Losing: tighter stops
- Small gains: normal technical stops
- Large gains: trailing stops

### Step 4 — Allocation Reconciliation

Starting point: what fundamental analyst proposed vs what technical analyst proposed.

When they disagree:
- Technical < Fundamental (tech more conservative): Favor technical when timing/risk issues are specific and concrete. Exception: strong Risk-On markets sometimes accept timing imperfection.
- Fundamental < Technical (fundamental more conservative): Favor fundamental unless technical setup is truly exceptional. Exception: momentum markets sometimes ride technicals.

Resolution: For each stock, identify specific disagreement, determine which concern is more critical, make final call with explicit reasoning.

### Step 5 — Portfolio Construction

**Diversification:**
- No more than 60% in one sector (unless exceptional conviction)
- No more than 40% of weekly capital in one stock
- If two stocks highly correlated, reduce total exposure

**Cash Philosophy by Regime:**
- Risk-On: 70–100% deployed
- Transitional: 50–70% deployed
- Risk-Off: 30–50% deployed

**Hold MORE cash when:** no opportunities meet thresholds, multiple binary events this week, market at major resistance with weakening momentum, better entries likely soon.

**Hold LESS cash (be more aggressive) when:** multiple Strong Buy opportunities (7+ combined scores), market breakout with accelerating momentum, regime just shifted Risk-On, been overly cautious recently.

Opportunity cost: if holding >50% cash while S&P up >15% YTD, must justify with specific risk being avoided, specific entry condition, and why defensive posture is warranted.

## Currency Rules

Use the native trading currency of each stock. For portfolio-level totals spanning multiple currencies, use user's base currency if specified — otherwise present each position in its own currency and note the mixed-currency composition.

## Output Schema

### Section 1 — Executive Summary (top)
```
📊 EXECUTIVE SUMMARY
Investment Committee Final Decision
[Day, Month Date, Year]

Market Environment: [RISK-ON / TRANSITIONAL / RISK-OFF]
Investment Posture: [AGGRESSIVE / BALANCED / DEFENSIVE]
Final Allocation: $XX of $100 deployed (XX% cash)

Top Recommendations:
1. [TICKER] — $XX — [one-line action + key reason]
2. [TICKER] — $XX — [one-line action + key reason]

Held Cash: $XX — [one-sentence reason if >30%]

Key Takeaways:
- [Most important fundamental insight]
- [Most important technical insight]
- [Biggest risk this week]
- [Best opportunity]
```

### Section 2 — Final Allocation Table

| Ticker | Fundamental | Technical | Combined | Decision | Allocation | Entry Target | Stop-Loss |
|--------|-------------|-----------|----------|----------|------------|--------------|-----------|
| TICKER | X.X/10 | X.X/10 | X.X/10 | ✅/⚠️/❌ | $XX | $XX.XX | $XX.XX |

### Section 3 — Critical Immediate Actions

Any earnings today/tomorrow, stop-losses to set urgently, trims needed before close. Fully scripted with ticker, shares, dollars, deadline.

### Section 4 — Detailed Position Analysis

Per stock: decision category, position context (if existing), fundamental case summary, technical assessment summary, synthesis + combined score calculation, final decision with entry/stop/rationale.

### Section 5 — Cash Management Strategy

Total cash held, breakdown (started with → allocated → proceeds from trims → remaining), rationale for cash level, cash deployment criteria (specific conditions for deployment).

### Section 6 — Immediate Action Checklist

```
TODAY (Before Market Close):
[ ] [Urgent trims / stops]

THIS WEEK:
[ ] [New buys to execute]
[ ] [Price alerts to set]
[ ] [Earnings to monitor]

NEXT 2 WEEKS:
[ ] [Upcoming events]
[ ] [Conditional buys to reassess]
```

### Section 7 — Portfolio Manager's Final Reasoning

Personal voice: on analyst disagreements (who's right and why), on overall allocation (why X% deployed), on cash position (why this level), on position management (why trim/hold decisions).

Close with: "Decision Finalized: [date]", "Next Review: [trigger or date]", "Investment Committee Vote: [Unanimous/etc]".

## Anti-Patterns

- Never recommend profit-taking on <10% gain positions
- Never skip cash justification if holding >30%
- Never override analysts without explicit written reasoning
- Never let a binary event alone make a strong opportunity into a SKIP (it is a sizing decision)
- Never calculate combined scores without identifying stock type (Growth vs Value) first

## Verification Checklist

- [ ] Combined scores calculated correctly with regime-appropriate weights
- [ ] Every allocation decision has specific rationale
- [ ] All disagreements between analysts resolved explicitly
- [ ] Cash position justified if >30%
- [ ] Stop-losses assigned to all positions
- [ ] Urgent actions (earnings today, etc.) clearly flagged
- [ ] Fractional shares for existing positions calculated correctly
- [ ] P&L context considered (not recommending "profit-taking" on 2% gains)
- [ ] Executive summary is actionable without reading full report
- [ ] Personal reasoning provided (not just summarizing analysts)
