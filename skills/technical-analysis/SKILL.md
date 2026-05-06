# Skill: Technical Analysis

## Trigger Conditions

- Invoked after fundamental-analysis skill has completed and its report is available in context
- Requires: fundamental analyst report (including `<analysis-json>` block) + market context JSON
- Do NOT invoke without the fundamental analyst's report — technical scoring depends on fundamental scores and regime
- If a `## MARKET CONTEXT (PRE-FETCHED):` block is present, skip portfolio-level macro searches

## Data Source Priority

1. `market-data` connector (see `.mcp.json`)
2. No WebSearch or WebFetch fallback

When market context is pre-fetched: skip S&P 500, VIX, sector, and Fed searches. Focus all calls on individual stock charts, MAs, RSI, earnings dates.

## Scoring Weight Awareness

Based on the market regime from fundamental analysis, the technical score is weighted as follows by the portfolio-manager skill:

- Risk-On + Growth Stock: **60–65%** of combined score (timing matters most)
- Transitional: **50–55%** of combined score
- Risk-Off + Value Stock: **35–40%** of combined score (fundamentals matter most)

In momentum markets, entry timing can make or break performance — be thorough.

## Workflow Steps

Analyze EACH stock: existing holdings + new recommendations + **all watching stocks**.

### Step 1 — Chart Setup

Search `[TICKER] stock chart` or `[TICKER] moving averages`:

**Price vs Moving Averages:**
- Current price: $XX.XX
- 20-day MA: $XX.XX → Price is [+/-X%] [above/below]
- 50-day MA: $XX.XX → Price is [+/-X%] [above/below]
- 200-day MA: $XX.XX → Price is [+/-X%] [above/below]

**Trend Classification:**
- Strong Bullish: Above all MAs, MAs in proper order (20>50>200)
- Bullish: Above 50 & 200, may be below 20 (healthy pullback)
- Neutral/Choppy: Mixed signals, crossing MAs
- Bearish: Below 50 & 200
- Strong Bearish: Below all MAs, MAs inverted

**Extension Analysis (distance from 200-day MA):**
- >50% above = Extreme extension (high risk)
- 20–50% above = Extended (caution)
- 10–20% above = Healthy bull trend
- <10% or negative = Potential value/reversal setup

### Step 2 — Momentum Indicators

Search `[TICKER] RSI` or `[TICKER] MACD`:

**RSI (14-period):**
- <30 = Oversold (potential bounce)
- 30–40 = Bearish but not extreme
- 40–60 = Neutral (healthy range)
- 60–70 = Bullish, not extreme
- >70 = Overbought (pullback risk)

RSI context: Strong uptrend + RSI 60–70 = Healthy. Choppy + RSI >70 = Warning.

**MACD (12,26,9):**
- Bullish: MACD crossing above signal line
- Bearish: MACD crossing below signal line
- Divergence: Price at new highs but MACD not confirming = Bearish divergence

**Volume:** Rising on up days = healthy. Rising on down days = distribution.

### Step 3 — Support & Resistance

Search `[TICKER] support resistance`:

**Support Levels:**
- Primary: $XX.XX (recent low / MA support / prior breakout)
- Secondary: $XX.XX (stronger level below)
- Major: $XX.XX (critical — break would be very bearish)

**Resistance Levels:**
- Nearest: $XX.XX
- Major: $XX.XX

**Current Position Assessment:**
Calculate: (Current Price − Support) / (Resistance − Support)
- 0–25%: Near support ✅ LOW RISK ENTRY
- 25–50%: Lower middle ⚠️ MODERATE
- 50–75%: Upper middle ⚠️ MODERATE-HIGH
- 75–100%: Near resistance ❌ HIGH RISK ENTRY

**Risk/Reward:** want ≥2:1 for new entries.

### Step 4 — Pattern Recognition

Bullish: Cup & Handle, Ascending triangle, Bull flag, Higher lows.
Bearish: Head & Shoulders, Descending triangle, Bear flag, Lower highs.
Neutral: Symmetrical triangle, Rectangle, Tight consolidation.

### Step 5 — Timing Red Flags

Search `[TICKER] earnings date`:

**Earnings Proximity Risk:**
- 0–3 days: 🚨🚨🚨 EXTREME RISK — do not enter (binary event)
- 4–7 days: 🚨🚨 HIGH RISK — reduce size significantly or wait
- 8–14 days: 🚨 MODERATE RISK — acceptable with tight stop
- 15+ days: ✅ LOW RISK — sufficient runway

Other triggers: ex-dividend date, product launch, FDA approval, legal decision, sector-wide event.

### Step 6 — Technical Score Calculation

**Component scores (1–10 each):**

**A. Trend Quality:**
- 9–10: Strong uptrend, above all MAs, properly stacked
- 7–8: Bullish, above 50/200, slight pullback to 20
- 5–6: Neutral, choppy, mixed MAs
- 3–4: Weak, below 50 MA, downtrend attempt
- 1–2: Strong downtrend, below all MAs

**B. Momentum Health:**
- 9–10: RSI 50–65 with bullish MACD, strong volume
- 7–8: RSI 45–70, MACD bullish or neutral
- 5–6: RSI 35–75, mixed signals
- 3–4: RSI >75 (overbought) or <35 (oversold in downtrend)
- 1–2: Extreme overbought (>80) with bearish divergence

**C. Entry Positioning:**
- 9–10: Within 5% of support, R/R > 3:1
- 7–8: 5–15% above support, R/R > 2:1
- 5–6: Middle of range, R/R 1.5:1
- 3–4: Near resistance, R/R < 1.5:1
- 1–2: At resistance, R/R < 1:1

**D. Timing Risk:**
- 9–10: No earnings for 15+ days
- 7–8: Earnings 14+ days out
- 5–6: Earnings 7–14 days
- 4–5: Earnings 4–7 days
- 3–4: Earnings 0–3 days (binary event)

**Overall Technical Score:**

```
(Trend × 0.30) + (Momentum × 0.25) + (Entry × 0.30) + (Timing × 0.15)
```

Round to 1 decimal place.

## Binary Event Handling (CRITICAL)

If earnings in 0–3 days:
- Score the timing component normally (3–4/10)
- Add a separate 🚨🚨🚨 BINARY EVENT FLAG
- State: "Chart scores X/10 technically, but binary event requires position sizing decision"
- Do NOT destroy the overall technical score to 1–2/10 solely for earnings

**WRONG example:**
- Trend: 9/10, Momentum: 8/10, Entry: 7/10, Timing: 1/10 → Overall: 2.0/10 ❌

**CORRECT example:**
- Trend: 9/10, Momentum: 8/10, Entry: 7/10, Timing: 4/10 → Overall: 7.3/10 ✅
- Flag: "🚨🚨🚨 BINARY EVENT: Earnings today ±10% move"

A great chart is still a great chart — earnings mean "don't add size", not "terrible setup".

## Currency Rules

Always use the native trading currency of each stock:
- NYSE/NASDAQ → USD ($)
- LSE → GBP (£) or GBp (pence)
- Euronext → EUR (€)
- TSE → JPY (¥)
- ASX → AUD (A$)
- TSX → CAD (C$)

Show all prices, support/resistance, and stop-losses in each instrument's native currency.

## Output Schema

### Technical Validation Table (Summary)

| Ticker | Fund Score | Tech Score | Type | Chart Setup | Entry Quality | Timing Risk | Agreement |
|--------|-----------|-----------|------|-------------|---------------|-------------|-----------|
| TICKER | X.X/10 | X.X/10 | Existing/New | Bullish/Neutral/Bearish | Good/Wait/Poor | Low/Moderate/High | ✅/⚠️/❌ |

### Per-Stock Assessment (for each stock)

Structured as: current chart setup → momentum analysis → support & resistance → timing red flags → technical score breakdown → assessment (AGREE ✅ / MODIFY ⚠️ / DISAGREE ❌).

Each assessment ends with stop-loss level and entry/exit guidance.

**AGREE framework:** "Chart is technically EXCELLENT: [strengths]. Proceed with fundamental recommendation."
**MODIFY framework:** "Fundamentals compelling BUT [specific timing/setup issue]. Option A: reduced size. Option B: wait for level. Option C: skip this week."
**DISAGREE framework:** "Despite good fundamentals, chart shows [weakness]. SKIP. What would change my mind: [specific condition]."

### Portfolio-Level Technical Summary

- S&P 500 technical status (current, vs MAs, trend)
- VIX level and implication
- Technical regime confirmation vs fundamental analyst's classification
- Highest technical risk, best technical setup, lowest conviction calls

### Modified Allocation Recommendation

Show: Fundamental analyst proposed → Technical adjustment → Net effect (if any capital was deferred or skipped).

### Stop-Loss Summary Table

| Ticker | Current Price | Recommended Stop | % Risk | Rationale |
|--------|---------------|------------------|--------|-----------|
| TICKER | $XX.XX | $XX.XX | -X% | Below [support / MA / breakdown point] |

### Structured JSON Block (for portfolio-manager consumption)

After the full report, append:

```
<technical-json>
{
  "stocks": [
    {
      "ticker": "...",
      "tech_score": 0.0,
      "trend": "Strong Bullish|Bullish|Neutral|Bearish|Strong Bearish",
      "entry_quality": "Good|Moderate|Poor",
      "earnings_days_away": null,
      "binary_event": false,
      "stop_level": 0.0,
      "stop_currency": "...",
      "agreement": "AGREE|MODIFY|DISAGREE"
    }
  ],
  "technical_deployment_recommendation": 0
}
</technical-json>
```

## Anti-Patterns

- Never assume or estimate chart data — always search
- Never destroy an overall technical score to 1–2/10 solely for binary events
- Never skip any stock present in the fundamental report
- Never recommend "wait for perfect pullback" in strong uptrends (analysis paralysis)
- Never use raw P/E to evaluate growth stocks' technical validity

## Verification Checklist

- [ ] All current prices searched and verified
- [ ] Moving averages for each stock calculated/found
- [ ] RSI and MACD current values researched
- [ ] Support/resistance levels identified from actual price action
- [ ] Earnings dates within 14 days explicitly flagged
- [ ] Risk/reward calculated for new entries
- [ ] Stop-loss levels provided for all positions
- [ ] Clear AGREE/MODIFY/DISAGREE stated for each recommendation
- [ ] If DISAGREE with fundamental, alternative action provided
