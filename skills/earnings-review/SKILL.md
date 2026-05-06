# Skill: Earnings Review

## Trigger Conditions

- Invoked via `/earnings-review TICKER` after a company has reported earnings
- Invoked when a binary event flag from the previous week's analysis has now resolved
- Requires: ticker symbol. The skill searches for the most recently reported results.
- Do NOT invoke before earnings have been reported — use earnings-preview skill instead
- Do NOT invoke more than 2 weeks after the report (data freshness degrades)

## Data Source Priority

1. `market-data` connector (see `.mcp.json`)
2. No fallback — all actuals, guidance, and analyst reactions must be live-searched

## Workflow Steps

### Step 1 — Confirm Report and Pull Actuals

Search `[TICKER] earnings results [most recent quarter]`:
- Confirm report date and fiscal quarter
- EPS actual vs. consensus estimate → beat/miss by $X.XX (X%)
- Revenue actual vs. consensus estimate → beat/miss by $XM (X%)
- Key segment metrics (same ones monitored in Step 5 of earnings-preview)

Search `[TICKER] Q[X] earnings key metrics`:
- Pull the 3–5 metrics that the market focuses on for this sector
- Compare each actual vs. estimate or prior quarter

### Step 2 — Guidance Analysis

Search `[TICKER] guidance outlook [next quarter / full year]`:
- Next quarter EPS guidance: raised / maintained / lowered vs. prior estimates
- Full-year guidance: raised / maintained / lowered / withdrawn
- Any new commentary on margins, capex, headcount, or strategic direction
- Management tone: confident / cautious / warning signs

Classify guidance as:
- **Raised** — above prior estimates
- **Maintained** — in line with estimates
- **Lowered** — below prior estimates
- **Withdrawn** — removed (significant uncertainty flag)

### Step 3 — Market and Analyst Reaction

Search `[TICKER] stock reaction earnings day`:
- Day-of price reaction (+/- %)
- After-hours / pre-market reaction if applicable
- Volume vs. average (institutional conviction signal)

Search `[TICKER] analyst upgrades downgrades earnings`:
- Any rating changes (upgrades/downgrades) in the 48 hours post-report
- Price target revisions (raised / cut by how much)
- Key analyst commentary (1–2 notable quotes if available)

### Step 4 — Thesis Impact Assessment

Based on Steps 1–3, evaluate the investment thesis:

**Thesis Strengthened** if:
- Beat on key metrics + raised guidance
- Management commentary reinforces the original thesis drivers
- Market reaction positive and sustained (not faded)

**Thesis Neutral** if:
- Mixed results (beat some, missed others)
- Guidance maintained but not raised
- Stock reaction modest or quickly reversed

**Thesis Weakened** if:
- Missed key metrics + guidance cut or withdrawn
- Management tone cautious or defensive
- Analyst downgrades or significant target cuts

For each thesis pillar identified when the position was entered (if known), assess whether it was confirmed or challenged.

### Step 5 — Updated Fundamental Score

Assign an updated fundamental score (1–10) based on:
- Revised growth trajectory post-report
- New analyst consensus and price target
- Guidance quality
- Any new risks or opportunities surfaced

State explicitly: "Updated fundamental score: X.X/10 (was X.X/10 pre-earnings)"

### Step 6 — Action Recommendation

Based on thesis impact and updated score, recommend:

**HOLD** — thesis intact, no change needed
- Set/update stop-loss based on post-earnings support levels

**ADD** — thesis strengthened, score improved
- Suggested allocation: $X = Y.XXX shares at current price
- Entry: market order or limit at $X if you want a pullback

**TRIM** — thesis weakened but not broken
- Suggested trim: X% of current position
- Rationale: lock some gains / reduce risk while maintaining exposure

**EXIT** — thesis broken
- Close position
- Rationale: specific reason thesis is no longer valid

## Currency Rules

Show all prices, stop levels, and allocation changes in the stock's native trading currency.

## Output Schema

```markdown
## Earnings Review: [TICKER] — [Company Name]

**Reported:** [Date] | **Fiscal Quarter:** Q[X] [Year]
**Stock Reaction:** [+/-X%] on earnings day (Volume: [X]x average)

---

### Results vs. Estimates
| Metric | Actual | Estimate | Beat/Miss | YoY |
|--------|--------|----------|-----------|-----|
| EPS | $X.XX | $X.XX | +$X.XX (+X%) | +X% |
| Revenue | $XB | $XB | +$XM (+X%) | +X% |
| [Key metric] | X | X | ✅/❌ | X% |

---

### Guidance
| Period | Metric | Guidance | vs. Prior Est. | Status |
|--------|--------|----------|----------------|--------|
| Q[X+1] | EPS | $X.XX–$X.XX | +X% | ✅ Raised |
| FY[Year] | Revenue | $XB–$XB | Maintained | — |

**Management Tone:** [Confident / Cautious / Warning]
Key commentary: "[1–2 sentence quote or summary]"

---

### Analyst Reactions (48h post-report)
| Analyst | Action | Old Target | New Target |
|---------|--------|------------|------------|
| [Firm] | Upgrade to Buy | $XX | $XX |
| [Firm] | Maintained | $XX | $XX (raised) |

---

### Thesis Impact: [✅ Strengthened / ➡️ Neutral / ⚠️ Weakened]

[2–3 sentences explaining why, referencing specific results vs. original thesis drivers]

**Updated Fundamental Score: X.X/10** (was X.X/10 pre-earnings)

---

### Action Recommendation: [HOLD / ADD / TRIM / EXIT]

[Specific action with dollar amounts, share counts, and rationale]

**Stop-Loss:** $XX.XX ([X%] below current, at [technical level])

**What to Monitor Next Quarter:**
- [Specific metric or milestone]
- [Specific metric or milestone]
```

## Anti-Patterns

- Never assume the earnings results — always search for actuals
- Never conflate a positive stock reaction with a good report (stocks can rally on "less bad than feared")
- Never recommend ADD on a weakened thesis just because the stock pulled back
- Do not issue an EXIT recommendation based solely on a single quarter miss — evaluate whether the thesis is broken vs. just delayed
- Always update the fundamental score — do not leave it as the pre-earnings value

## Verification Checklist

- [ ] Actual EPS and revenue found via search (not estimated)
- [ ] Guidance for next quarter or full year found
- [ ] Stock day-of reaction confirmed
- [ ] At least one analyst reaction (upgrade/downgrade/target change) searched
- [ ] Thesis impact classified as Strengthened / Neutral / Weakened with rationale
- [ ] Updated fundamental score stated explicitly
- [ ] Action recommendation is one of the four defined options with specific rationale
