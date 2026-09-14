---
name: fundamental-analysis
description: Systematic fundamental analysis of a stock portfolio — market regime classification, new opportunity discovery, 1–10 scoring of holdings and watchlist, and position sizing from available cash. Use in the /analyze pipeline after market-snapshot, or when asked to score or evaluate stocks on fundamentals.
---

# Skill: Fundamental Analysis

## Trigger Conditions

- Invoked after market-snapshot has run and its JSON is available in context (labeled `## MARKET CONTEXT (PRE-FETCHED):`)
- Invoked after portfolio JSON has been extracted (holdings, watchlist, cash)
- Do NOT invoke without portfolio data — requires at minimum holdings list and available cash
- Do NOT re-fetch macro data (indices, VIX, sectors, central banks) if a market context block is already provided

## Investor Context

Read `investor-profile.json` first: base currency, account type (ISK by default), home market, benchmarks and position-sizing percentages. Report portfolio-level figures in the base currency and apply the account rules below.

## Data Source Priority

1. Portfolio JSON from the orchestrator — holdings, cost basis, cash and `source` (the orchestrator has already read the broker if one is available; do not re-read it)
2. `quotes` connector — every current price (batch up to 20 symbols per call)
3. `fx` connector — every currency conversion; pass `date` when comparing against a historical entry price
4. `research` connector (WebSearch, then WebFetch on the best URL when highlights are too thin) — fundamentals, analyst ratings/targets, earnings dates and growth, opportunity discovery

Symbols for `quotes` and `history` use exchange suffixes: Stockholm `VOLV-B.ST`, Helsinki `.HE`, Copenhagen `.CO`, Oslo `.OL`, Xetra `.DE`, London `.L`; US tickers take none; indices use a caret (`^GSPC`, `^VIX`, `^OMX`). A 404 usually means the wrong suffix.

Figures from `research` are search-derived: cite the source and never use search for a price.

When a `## CATALYST CALENDAR (PRE-FETCHED):` block is present: take earnings and event dates for holdings and watchlist stocks from it — search dates only for new candidates it does not cover. It spans 28 days: a holding absent from it has no event in that window, so do not search again.

When a `## MARKET CONTEXT (PRE-FETCHED):` block is present: skip macro lookups entirely, focus all calls on stock-specific data (prices, earnings, analyst ratings, financials).

## Research Budget

**At most 22 calls in total:** 4 discovery searches, 1 search (+1 optional WebFetch) per new candidate for at most 5 candidates, and 1 search per holding or watchlist stock for recent analyst rating/target changes (skip a stock whose rating news is already covered by a discovery result). Earnings dates come from the catalyst calendar block; macro data comes from the market context block. A research call is one WebSearch or one WebFetch. Each returns 10–25k characters, so research calls dominate token use. Count them as you go. When the budget is reached, stop researching and list in the output what went without research — never exceed it silently.

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
- Central-bank policy: reflects the most recent Riksbank, ECB and Fed decisions

## Critical Search Requirements

| Data Point | Source |
|---|---|
| Stock price | `quotes` |
| Currency conversion | `fx` |
| Analyst ratings/targets | `research`: `[TICKER] analyst ratings` |
| Earnings date | Catalyst calendar block if present; otherwise `research`: `[TICKER] earnings date` (one ticker per query) |
| VIX level | `quotes`: `^VIX` |
| Central-bank policy | `research`: one query per bank (Riksbank, ECB, Fed) |
| Sector performance | `history`: European sector proxies from `investor-profile.json`, 5d/1d |

**Research sources.** WebFetch only pages on the domains in `research_sources.fetch_allowed` (`investor-profile.json`) — each new domain triggers an approval prompt that would stall a scheduled run. Prefer those domains in WebSearch (`allowed_domains`) when they cover the need. If nothing on the list has it, record "not found" rather than fetching another site.

## Workflow Steps

### Step 0 — Market Regime Classification

If `## MARKET CONTEXT (PRE-FETCHED):` block is present, read regime from it and skip to Step 1.

Otherwise, run the market-snapshot skill's Steps 1–2 (home, European and global index trend; VIX; European sector leadership; Riksbank, ECB and Fed stance) and use its six-signal matrix.

Output this block:
```
MARKET REGIME: [RISK-ON / TRANSITIONAL / RISK-OFF]

Evidence:
- OMX Stockholm 30: [Above/Below] 50-day MA by X%
- STOXX Europe 600: [Above/Below] 50-day MA by X%
- S&P 500: [Above/Below] 50-day MA by X%
- VIX: X.XX ([Greed/Neutral/Fear])
- European Sector Leadership: [Cyclicals/Mixed/Defensives]
- Central Banks: Riksbank [stance], ECB [stance], Fed [stance] → net [Easing/On hold/Tightening]
- Divergence: [home vs global, if any]

Investment Implications:
- [Deployment guidance based on regime]
```

### Step 1 — New Opportunity Discovery (MANDATORY)

Perform exactly these **4 discovery searches** (one subject per query). Sector leadership is already in the market context block — do not search for it.
1. `analyst upgrades and new buy ratings Nordic stocks past week` — Sweden/Nordics
2. `analyst upgrades European stocks past week` — Europe outside the Nordics
3. `analyst upgrades global large-cap stocks past week` — global (check the instrument is ISK-eligible and tradable at the broker)
4. Regime-adjusted, aimed at the least-represented region or sector in the portfolio:
   - Risk-On → `[region] growth stocks earnings momentum`
   - Transitional → `[region] quality stocks strong balance sheet earnings growth`
   - Risk-Off → `[region] defensive dividend stocks`

Pick 3–5 candidates from these results and quotes; do not run further discovery searches.

**Candidate mix.** Evaluate at least one candidate from each of: (a) Sweden/Nordics, (b) Europe outside the Nordics, (c) global (US or elsewhere; ISK-eligible and tradable at the broker). Then tilt the remaining slots toward what reduces current concentration: if the portfolio is already heavy in one country, sector or currency (check weights before discovery), prefer candidates outside it. A candidate that adds to an existing concentration needs a stated reason. If a bucket yields nothing above the bar, say so rather than silently dropping it.

For every candidate (3–5):
- Current price from `quotes` (batch the candidates)
- **One** `research` search: `[Company] analyst consensus price target and earnings growth forecast` — WebFetch the best result only if the target or growth figure is missing from the highlights
- Score using the 1–10 framework below
- Calculate recommended position size as a percentage of available cash (Step 3), in the stock's currency and the base currency

**New Stock Evaluation Template:**
```
Ticker & Company Name:
Current Price & Analyst Target:
Growth Rate & Key Metrics:
Fundamental Score (1–10):
Recommended Investment: X [base currency] (= Y.YY [stock currency]) = N shares at Z [stock currency]/share
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

**Minimum requirement:** Evaluate 3–5 new stocks AND all watching stocks before analyzing existing holdings, within the research budget.

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

**Position Sizing Logic** (percentages from `investor-profile.json`, never fixed amounts):
- High conviction (Score 8–10): 25–40% of available cash
- Medium conviction (Score 6.5–7.9): 15–25% of available cash
- Speculative (Score 6.0–6.4): 10–15% of available cash (Risk-On only)

Convert each amount to the stock's currency with `fx`. Swedish brokers generally do not offer fractional shares: round down to whole shares and state the amount actually deployed. Skip orders so small that the broker's minimum commission is a material share of the order.

Always express positions as:
> "X SEK = N shares at Z [stock currency]/share (≈ Y [stock currency])"

**Portfolio Construction Rules:**
- Max single position: 35% of available cash, and no position above 10% of total portfolio value after the trade
- Sector concentration limit: 60% of available cash
- Must have ≥2 sectors represented if deploying >50% of cash
- Note currency exposure: report the share of portfolio value in SEK vs foreign currencies after the proposed trades

## Currency Rules

Prices, targets and stops use each instrument's **native trading currency**:
- Nasdaq Stockholm → SEK (kr)
- Oslo Børs → NOK; Nasdaq Copenhagen → DKK; Nasdaq Helsinki → EUR
- Xetra / Euronext → EUR (€)
- LSE → GBP (£) or GBp (pence)
- NYSE/NASDAQ → USD ($)

Cash, position sizes, portfolio value, deployment amounts and P&L are reported in the **base currency** (SEK by default), converted with `fx`. For P&L on a foreign holding, split the return into local-price performance and currency effect (convert the entry at the `fx` rate on the purchase date).

## Portfolio Interpretation Rules

1. **Cost basis:** Prefer quantity and cost basis from the `portfolio` connector. For pasted input: if `fractional: true`, "Buy In Price" is the total amount invested (in the base currency unless stated); if `fractional: false`, it is the price per share.
2. **P&L Calculation:**
   - From broker data: P&L = (Quantity × Current Price − Cost Basis) ÷ Cost Basis, in the base currency
   - Fractional = TRUE: Shares = Buy In Price ÷ Price at purchase; P&L = (Shares × Current Price − Buy In Price) ÷ Buy In Price
   - Fractional = FALSE: P&L = (Current Price − Buy In Price) ÷ Buy In Price
3. **Days Held:** <7=Very new; 7–30=New; 30–90=Established; >90=Long-term
4. Do NOT recommend "taking profits" on positions with <10% gains.

## Account Rules (ISK by default — see `investor-profile.json`)

- Selling, trimming and rebalancing inside an ISK have **no tax cost**. Decide purely on investment merit; never mention capital gains tax, tax-loss harvesting or holding periods for tax.
- The ISK is taxed on its value, including cash — idle cash is not tax-free.
- Foreign dividends suffer withholding tax that is only partly creditable; note it for high-yield foreign holdings.
- Only recommend instruments that are ISK-eligible and tradable at the broker. US-domiciled ETFs are generally not available to EU retail investors — use UCITS alternatives.

## Opportunity Cost Rule

If holding >50% cash while the home index (OMX Stockholm 30) or the global benchmark is up >10% YTD (`history`, `range: "ytd"`), MUST justify:
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

Available Cash: [FROM PORTFOLIO DATA, base currency]
Recommended Deployment: XX SEK (XX%)
Cash to Hold: XX SEK (XX%)

Market Regime: [RISK-ON/TRANSITIONAL/RISK-OFF]
Investment Posture: [AGGRESSIVE/BALANCED/DEFENSIVE]

Allocations:
1. [TICKER]: XX SEK (N shares at YY [stock currency]/share)
2. [TICKER]: XX SEK (N shares at YY [stock currency]/share)
3. Cash Reserved: XX SEK

Quality Bar: [X.X/10] — Only recommending stocks above this threshold

Rationale: [2–3 sentences on allocation mix given current environment]
```

### Section 2 — New Investment Opportunities
- 3–5 evaluated new stocks with scores and recommendations
- Format: `TICKER: Invest XX SEK = N shares at Z [stock currency]/share (Score: X.X/10)`

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
    {"ticker": "...", "score": 0.0, "recommended_amount_base": 0, "shares": 0, "currency": "...", "price": 0.0}
  ],
  "watchlist": [
    {"ticker": "...", "score": 0.0, "action": "BUY|KEEP_WATCHING|STOP_WATCHING", "recommended_amount_base": 0, "currency": "..."}
  ],
  "base_currency": "SEK",
  "total_recommended_deployment_base": 0
}
</analysis-json>
```

## Anti-Patterns

- Never estimate current prices, or take them from search results — use `quotes`
- Never convert currencies from memory or search — use `fx`
- Never recommend profit-taking on <10% gains
- Never hold >50% cash without written justification when the home or global benchmark is up >10% YTD
- Never size positions in fixed currency amounts — use percentages of available cash from the profile
- Never cite capital gains tax or tax-loss harvesting for an ISK
- Never recommend US-domiciled ETFs to an EU retail investor
- Never skip new opportunity discovery — it is mandatory regardless of market conditions
- Never score growth stocks on raw P/E; use PEG or growth-relative metrics

## Verification Checklist

- [ ] All current prices from `quotes`, with timestamp and currency (no estimates, no search)
- [ ] Every currency conversion from `fx`
- [ ] Share counts and amounts correct; position sizes are percentages of available cash, shown in SEK and the stock's currency
- [ ] Foreign P&L split into local performance and currency effect
- [ ] Candidates evaluated from all three buckets (Nordic, Europe ex-Nordic, global), tilted away from existing country/sector/currency concentration
- [ ] No tax reasoning that contradicts ISK rules
- [ ] Actual P&L calculated for all holdings
- [ ] Market regime explicitly classified
- [ ] Score thresholds adjusted for regime
- [ ] Deployment % justified given regime and quality
- [ ] If holding >50% cash, opportunity cost addressed
- [ ] Earnings dates within 14 days flagged as risk
- [ ] Growth stocks scored on growth metrics, not raw P/E
- [ ] All watching stocks evaluated with clear decisions
