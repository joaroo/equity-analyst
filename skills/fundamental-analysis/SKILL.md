# Skill: Fundamental Analysis

## Trigger Conditions

- Invoked after market-snapshot has run and its JSON is available in context (labeled `## MARKET CONTEXT (PRE-FETCHED):`)
- Invoked after portfolio JSON has been extracted (holdings, watchlist, cash)
- Do NOT invoke without portfolio data — requires at minimum holdings list and available cash
- Do NOT re-fetch macro data (S&P, VIX, sector, Fed) if a market context block is already provided

## Data Source Priority

1. `portfolio` connector — holdings, cost basis and cash, when bound (otherwise the portfolio JSON from the orchestrator)
2. `quotes` connector — every current price (batch up to 20 symbols per call)
3. `fx` connector — every currency conversion; pass `date` when comparing against a historical entry price
4. `research` connector (WebSearch, then WebFetch on the best URL when highlights are too thin) — fundamentals, analyst ratings/targets, earnings dates and growth, opportunity discovery

Symbols for `quotes` and `history` use exchange suffixes: Stockholm `VOLV-B.ST`, Helsinki `.HE`, Copenhagen `.CO`, Oslo `.OL`, Xetra `.DE`, London `.L`; US tickers take none; indices use a caret (`^GSPC`, `^VIX`, `^OMX`). A 404 usually means the wrong suffix.

Figures from `research` are search-derived: cite the source and never use search for a price.

When a `## MARKET CONTEXT (PRE-FETCHED):` block is present: skip macro lookups entirely, focus all calls on stock-specific data (prices, earnings, analyst ratings, financials).

## Anti-Hallucination Rules

1. Look up current data before making ANY claim about it — prices and index levels via `quotes`/`history`; ratings, earnings dates, Fed policy via `research`
2. If data cannot be found, state: "Unable to verify [X]" and name the source that failed
3. NEVER estimate or assume current prices — take every price from `quotes`, with its timestamp and currency
4. If search results are unclear, acknowledge the uncertainty
5. Cite specific sources for major claims (analyst targets, earnings dates)
6. If conflicting data is found, present both sources and note the conflict

## Data Freshness Standards

- Prices: within the last 24 hours
- Analyst data: within the last 30 days
- Earnings dates: explicitly stated (not inferred from quarterly patterns)
- Fed policy: reflects the most recent FOMC meeting

## Critical Search Requirements

| Data Point | Source |
|---|---|
| Stock price | `quotes` |
| Currency conversion | `fx` |
| Analyst ratings/targets | `research`: `[TICKER] analyst ratings` |
| Earnings date | `research`: `[TICKER] earnings date` (one ticker per query) |
| VIX level | `quotes`: `^VIX` |
| Fed policy | `research`: `Federal Reserve latest decision` |
| Sector performance | `history`: sector ETFs, 5d/1d |

## Workflow Steps

### Step 0 — Market Regime Classification

If `## MARKET CONTEXT (PRE-FETCHED):` block is present, read regime from it and skip to Step 1.

Otherwise, fetch and classify (same sources as the market-snapshot skill):

1. **S&P 500 Technical Position** — current level (`quotes`: `^GSPC`), distance from 50-day MA (bullish if >3%) and 200-day MA (bullish if >8%) from `indicators`
2. **Volatility & Sentiment** — VIX level (`quotes`: `^VIX`). Interpretation: <15=Greed, 15–20=Neutral, 20–25=Caution, >25=Fear
3. **Sector Leadership** — last 5 days sector ETF returns (`history`). Growth leading=Risk-On; Defensive leading=Risk-Off
4. **Fed Policy Stance** — latest decision (`research`). Cutting=Dovish, Pausing=Neutral, Hiking=Hawkish

Output this block:
```
MARKET REGIME: [RISK-ON / TRANSITIONAL / RISK-OFF]

Evidence:
- S&P 500: [Above/Below] 50-day MA by X%
- VIX: X.XX ([Greed/Neutral/Fear])
- Sector Leadership: [Growth/Mixed/Defensive]
- Fed Stance: [Dovish/Neutral/Hawkish]

Investment Implications:
- [Deployment guidance based on regime]
```

### Step 1 — New Opportunity Discovery (MANDATORY)

Perform ALL of the following searches:
1. `best performing sectors this year` — identify sectors missing from portfolio
2. `stocks breaking out new highs this week` — momentum plays
3. `analyst upgrades past 7 days` — newly recommended stocks
4. `undervalued stocks strong earnings growth` — value opportunities
5. Regime-adjusted:
   - Risk-On → `AI stocks earnings growth`, `growth technology leaders`
   - Risk-Off → `dividend aristocrats`, `defensive consumer staples`

For every viable new stock found:
- Current price from `quotes` (batch the candidates)
- Search `[TICKER] analyst price target` with `research`
- Search `[TICKER] earnings growth rate` with `research`
- Score using the 1–10 framework below
- Calculate recommended position size from available cash

**New Stock Evaluation Template:**
```
Ticker & Company Name:
Current Price & Analyst Target:
Growth Rate & Key Metrics:
Fundamental Score (1–10):
Recommended Investment: $X = Y.XXX shares at $Z/share
Portfolio Fit Rationale:
```

**Watching Stock Evaluation Template:**
```
Ticker & Company Name:
Current Price & Analyst Target:
Growth Rate & Key Metrics:
Fundamental Score (1–10):
Recommendation: BUY (with allocation) / KEEP WATCHING (rationale) / STOP WATCHING (rationale)
Portfolio Fit Rationale:
```

**Minimum requirement:** Evaluate at least 3–5 new stocks AND all watching stocks before analyzing existing holdings.

### Step 2 — Portfolio Scoring Framework

Score each stock 1–10 on:
- Revenue/earnings growth rate
- Analyst consensus and price target upside
- Sector momentum and macro tailwinds
- Valuation relative to growth (PEG, not raw P/E for growth stocks)
- Earnings date proximity (flag if within 14 days as a risk)

### Step 3 — Allocation Framework

**Regime-Adjusted Deployment Targets:**

| Market Regime | Quality Threshold | Deployment Target | Cash Target |
|---|---|---|---|
| Risk-On | Combined ≥ 6.0 | 70–100% | 0–30% |
| Transitional | Combined ≥ 6.5 | 50–70% | 30–50% |
| Risk-Off | Combined ≥ 7.0 | 30–50% | 50–70% |

**Position Sizing Logic (Fractional Share Compatible):**
- High conviction (Score 8–10): $25–40 per stock
- Medium conviction (Score 6.5–7.9): $15–25 per stock
- Speculative (Score 6.0–6.4): $10–15 per stock (Risk-On only)

Always express positions as:
> "$X investment = Y.XXX shares at $Z/share"

**Portfolio Construction Rules:**
- Max single position: 35% of available cash
- Sector concentration limit: 60% of available cash
- Must have ≥2 sectors represented if deploying >50% of cash

## Currency Rules

Always use the **native trading currency** of each stock or fund:
- NYSE/NASDAQ → USD ($)
- LSE → GBP (£) or GBp (pence)
- Euronext → EUR (€)
- TSE → JPY (¥)
- ASX → AUD (A$)
- TSX → CAD (C$)

Show all prices, targets, position sizes, and P&L in each instrument's native currency. If portfolio mixes currencies, display each position in its own currency.

## Portfolio Interpretation Rules

1. **Fractional Shares:** If `fractional: true` in portfolio JSON — "Buy In Price" = total investment amount (not price per share). If `fractional: false` — "Buy In Price" = actual price per share; assume 1 share.
2. **P&L Calculation:**
   - Fractional = TRUE: Shares = Buy In Price ÷ Price at purchase; P&L = (Shares × Current Price − Buy In Price) ÷ Buy In Price
   - Fractional = FALSE: P&L = (Current Price − Buy In Price) ÷ Buy In Price
3. **Days Held:** <7=Very new; 7–30=New; 30–90=Established; >90=Long-term
4. Do NOT recommend "taking profits" on positions with <10% gains.

## Opportunity Cost Rule

If holding >50% cash while S&P is up >10% YTD, MUST justify:
- What specific risk is being avoided
- What entry condition is being waited for
- Why a defensive posture is warranted

Cash is a position, but so is missing the rally.

## Critical Philosophy

- In bull markets (Risk-On): default is INVESTED, not cash
- In bear markets (Risk-Off): default is CASH, not invested
- Quality matters, but so does participation
- Job is finding opportunities, not finding reasons to hold cash

## Output Schema

### Section 1 — Allocation Summary Box (top of report)
```
💰 WEEKLY ALLOCATION RECOMMENDATION

Available Cash: [FROM USER DATA]
Recommended Deployment: $XX (XX%)
Cash to Hold: $XX (XX%)

Market Regime: [RISK-ON/TRANSITIONAL/RISK-OFF]
Investment Posture: [AGGRESSIVE/BALANCED/DEFENSIVE]

Allocations:
1. [TICKER]: $XX (X.XXX fractional shares at $YY/share)
2. [TICKER]: $XX (X.XXX fractional shares at $YY/share)
3. Cash Reserved: $XX

Quality Bar: [X.X/10] — Only recommending stocks above this threshold

Rationale: [2–3 sentences on allocation mix given current environment]
```

### Section 2 — New Investment Opportunities
- 3–5 evaluated new stocks with scores and recommendations
- Format: `TICKER: Invest $XX = Y.XXX shares at $Z/share (Score: X.X/10)`

### Section 3 — Watching Stocks Analysis
- Every stock on the watch list evaluated
- Clear decision per stock: BUY, KEEP WATCHING, or STOP WATCHING

### Section 4 — Existing Holdings Analysis
- Analysis of current positions and P&L
- Any position adjustments (with fractional share calculations)

### Section 5 — Final Allocation Decision
- Full deployment plan across new stocks, existing positions, and cash reserves

### Structured JSON Block (for portfolio-manager consumption)

After the full analysis report, append:

```
<analysis-json>
{
  "regime": "RISK-ON|TRANSITIONAL|RISK-OFF",
  "quality_threshold": 0.0,
  "holdings": [
    {"ticker": "...", "score": 0.0, "action": "HOLD|TRIM|EXIT|ADD", "currency": "..."}
  ],
  "new_opportunities": [
    {"ticker": "...", "score": 0.0, "recommended_amount": 0, "currency": "...", "price": 0.0}
  ],
  "watchlist": [
    {"ticker": "...", "score": 0.0, "action": "BUY|KEEP_WATCHING|STOP_WATCHING", "recommended_amount": 0, "currency": "..."}
  ],
  "total_recommended_deployment": 0
}
</analysis-json>
```

## Anti-Patterns

- Never estimate current prices, or take them from search results — use `quotes`
- Never convert currencies from memory or search — use `fx`
- Never recommend profit-taking on <10% gains
- Never hold >50% cash without written justification when S&P is up >10% YTD
- Never skip new opportunity discovery — it is mandatory regardless of market conditions
- Never score growth stocks on raw P/E; use PEG or growth-relative metrics

## Verification Checklist

- [ ] All current prices from `quotes`, with timestamp and currency (no estimates, no search)
- [ ] Every currency conversion from `fx`
- [ ] Fractional share positions calculated correctly
- [ ] Actual P&L calculated for all holdings
- [ ] Market regime explicitly classified
- [ ] Score thresholds adjusted for regime
- [ ] Deployment % justified given regime and quality
- [ ] If holding >50% cash, opportunity cost addressed
- [ ] Earnings dates within 14 days flagged as risk
- [ ] Growth stocks scored on growth metrics, not raw P/E
- [ ] All watching stocks evaluated with clear decisions
