---
name: valuation
description: Absolute valuation check for one stock — peer comparables table (EV/EBITDA, P/E, EV/Revenue, P/S) and a simplified bull/base/bear DCF giving an intrinsic value range and a Cheap / Fair / Expensive verdict, with no buy/sell call. Use for /valuation TICKER or when asked whether a stock is over- or undervalued.
---

# Skill: Valuation

## Trigger Conditions

- Invoked via `/valuation TICKER` for any stock before initiating a new position or as a sanity check on an existing holding
- Optionally invoked as part of the fundamental-analysis workflow when a high conviction score needs absolute value confirmation
- Requires: ticker symbol
- Best used when: considering a position above 2% of portfolio value, stocks with P/E >40x or <10x, or after a large price move

## Data Source Priority

1. `quotes` connector — current price for the ticker and every peer (one batched call)
2. `research` connector (WebSearch, then WebFetch for thin results) — financials, share count, analyst targets, peer multiples
3. `fx` connector — any conversion needed to compare peers listed in different currencies

Symbols for `quotes` and `history` use exchange suffixes: Stockholm `VOLV-B.ST`, Helsinki `.HE`, Copenhagen `.CO`, Oslo `.OL`, Xetra `.DE`, London `.L`; US tickers take none; indices use a caret (`^GSPC`, `^VIX`, `^OMX`). A 404 usually means the wrong suffix.

Do not use training-data financials — revenue, earnings, and growth rates change quarterly and must be searched. Financials from `research` are search-derived: cite the source and period.

## Workflow Steps

### Step 1 — Pull Company Financials

Search `[TICKER] revenue earnings EPS growth rate annual`:
- Last 12 months (LTM) revenue
- Last 12 months (LTM) EBITDA or operating income
- LTM EPS (diluted)
- Forward revenue estimate (next 12 months)
- Forward EPS estimate (next 12 months)
- Revenue growth rate (last 3 years CAGR if available)
- EBITDA margin (LTM)
- Free cash flow (LTM) if available

Take the current price from `quotes`. Search `[TICKER] shares outstanding market cap`:
- Shares outstanding (diluted)
- Current market cap (recompute as price × diluted shares when the searched figure is stale)
- Enterprise value (market cap + net debt, or search directly)

**Captive finance arms.** Truck, auto, equipment and some industrial companies (e.g. Volvo, Daimler Truck, Traton, PACCAR, CNH, Deere) run finance subsidiaries whose debt funds customer loans and leases. Consolidated net debt and EV then overstate leverage. For these companies:
- Use **industrial operations** net debt / net financial position excluding financial services (search `[COMPANY] industrial operations net financial position excluding financial services`) and industrial EBITDA for EV-based metrics — for the target and every peer
- If industrial figures cannot be found for a company, mark its EV/EBITDA, EV/Revenue and DCF equity bridge as **distorted** and rely on P/E and P/S for it

Search `[TICKER] analyst price target consensus`:
- Average analyst price target
- Upside/downside to consensus target
- Number of analysts covering

### Step 2 — Identify Comparable Companies

Search `[TICKER] comparable companies peers sector`:
- Identify 4–5 comparable public companies in the same sector/business model
- Prioritize companies with similar:
  - Revenue scale (within 0.5x–2x)
  - Growth profile (similar growth rate ±5%)
  - Business model (same revenue type: SaaS/ad-supported/product/etc.)

### Step 3 — Peer Multiples Table

For each peer, search `[PEER_TICKER] EV/EBITDA P/E price to sales forward multiple` and take its current price from `quotes`. Apply the captive-finance rule to peers too — multiples from data sites use consolidated EV.

Build the comps table. Show revenue in the **base currency** (SEK by default), converted with `fx`, so peers are comparable; multiples are currency-neutral.

| Ticker | Revenue (B SEK) | Rev Growth | EBITDA Margin | EV/EBITDA | P/E (FWD) | EV/Revenue | P/S |
|--------|-------------|------------|---------------|-----------|-----------|------------|-----|
| [TICKER] | X | X% | X% | X.Xx | X.Xx | X.Xx | X.Xx |
| [PEER 1] | X | X% | X% | X.Xx | X.Xx | X.Xx | X.Xx |
| [PEER 2] | X | X% | X% | X.Xx | X.Xx | X.Xx | X.Xx |
| [PEER 3] | X | X% | X% | X.Xx | X.Xx | X.Xx | X.Xx |
| **Peer Median** | — | — | — | **X.Xx** | **X.Xx** | **X.Xx** | **X.Xx** |

For high-growth stocks (revenue growth >30%), EV/Revenue and P/S are more relevant than P/E.
For mature/value stocks (revenue growth <10%), P/E and EV/EBITDA are more relevant.

### Step 4 — Implied Value from Comps

Apply peer median multiples to the subject company:

- **EV/EBITDA implied price:** (Peer Median EV/EBITDA × LTM EBITDA − Net Debt) ÷ Shares = X.XX [CCY]
- **P/E implied price:** Peer Median P/E × Forward EPS = X.XX [CCY]
- **EV/Revenue implied price:** (Peer Median EV/Revenue × Forward Revenue − Net Debt) ÷ Shares = X.XX [CCY]

Comps-implied value range: low X [CCY] — high X [CCY] (using spread of peer multiples, not just median)

### Step 5 — Simplified DCF

Use 3 scenarios. Pull analyst consensus for revenue/earnings estimates where available.

**Inputs:**
- Base revenue: LTM revenue
- Growth rate assumptions per scenario (from analyst estimates or historical trend)
- Terminal growth rate: at most the long-run inflation target of the reporting currency area — default 2% for SEK, EUR and USD (see `investor-profile.json`)
- Discount rate: local 10-year government bond yield for the reporting currency (look it up with `research` and cite it) + about 5 percentage points equity risk premium, adjusted for size and business risk. State every input

**Bull Case** (optimistic scenario):
- Revenue CAGR over 5 years: analyst high estimate or +5% above consensus
- EBITDA margin: expands to sector median or historical peak
- Terminal multiple: current peer median EV/EBITDA
- Implied intrinsic value: X.XX [CCY] per share

**Base Case** (consensus scenario):
- Revenue CAGR: analyst consensus estimate
- EBITDA margin: current level maintained
- Terminal multiple: slight discount to peer median
- Implied intrinsic value: X.XX [CCY] per share

**Bear Case** (conservative scenario):
- Revenue CAGR: below consensus by 3–5%
- EBITDA margin: compression scenario
- Terminal multiple: at discount to peers
- Implied intrinsic value: X.XX [CCY] per share

### Step 6 — Synthesis and Verdict

First, list any method you flagged as **distorted** (captive finance, trough earnings, one-off items, a peer multiple that is an outlier by more than 2x the median) and exclude it — a method you would caveat as unreliable must not drive the verdict.

Then combine the remaining methods to produce an intrinsic value range:
- Low end: bear DCF or comps low (undistorted methods only)
- High end: bull DCF or comps high (undistorted methods only)
- Central estimate: average of base DCF and comps median implied — if the DCF is distorted, use the comps median (from undistorted multiples) alone and say so; if both are distorted, state that no reliable central estimate exists and give the verdict as "Fair" only if price is within the plausible range, with the uncertainty stated

Compare to current price:
- Premium: current price is X% above central estimate → [Expensive]
- Discount: current price is X% below central estimate → [Cheap]
- At fair value: within ±10% of central estimate → [Fair]

**Verdict framework:**
- **Cheap** (>15% discount to central estimate): Strong valuation support — thesis has margin of safety
- **Fair** (within ±15%): Priced for expected performance — no margin of safety, but not overvalued
- **Expensive** (>15% premium to central estimate): Priced for perfection — execution risk is high

## Currency Rules

Show all values in the stock's native trading currency. Make clear which currency is used for each metric.

`[CCY]` in templates means the instrument's native trading currency (SEK for Nasdaq Stockholm, NOK Oslo, DKK Copenhagen, EUR Helsinki/Xetra/Euronext, GBP/GBp London, USD US exchanges). Position sizes and allocations are in the base currency from `investor-profile.json` (SEK by default), converted with `fx`.

Many Nordic companies report in EUR or USD while their shares trade in SEK: convert per-share values into the trading currency with `fx` before comparing with the share price, and say so.

Pick peers from the same region first (Nordic, then European), and add global peers only when the business model match is clearly better; note regional valuation differences when mixing them.

## Output Schema

```markdown
## Valuation: [TICKER] — [Company Name]

**Current Price:** XX.XX [CCY] | **Market Cap:** XB [CCY] | **Enterprise Value:** XB [CCY]

---

### Company Financials
| Metric | LTM | Forward (NTM) | YoY Growth |
|--------|-----|---------------|------------|
| Revenue | XB [CCY] | XB [CCY] | +X% |
| EBITDA | XB [CCY] | XB [CCY] | +X% |
| EPS (diluted) | X.XX [CCY] | X.XX [CCY] | +X% |
| FCF | XB [CCY] | — | — |

---

### Comparable Companies

*Revenue in the base currency (B SEK), converted with `fx` at [date]. EV multiples use industrial net debt for captive-finance companies; mark any that could not be adjusted as (distorted).*

| Ticker | Rev (B SEK) | Rev Growth | EBITDA Margin | EV/EBITDA | Fwd P/E | EV/Rev |
|--------|-------------|------------|---------------|-----------|---------|--------|
| [TICKER] | X | X% | X% | X.Xx | X.Xx | X.Xx |
| [PEER 1] | X | X% | X% | X.Xx | X.Xx | X.Xx |
| [PEER 2] | X | X% | X% | X.Xx | X.Xx | X.Xx |
| [PEER 3] | X | X% | X% | X.Xx | X.Xx | X.Xx |
| **Peer Median** | — | — | — | **X.Xx** | **X.Xx** | **X.Xx** |

**Comps-Implied Range:** XX [CCY] — XX [CCY] per share

---

### DCF Scenarios
| Scenario | Rev CAGR | EBITDA Margin | Implied Value |
|----------|----------|---------------|---------------|
| Bull | +X% | X% | XX.XX [CCY] |
| Base | +X% | X% | XX.XX [CCY] |
| Bear | +X% | X% | XX.XX [CCY] |

---

### Intrinsic Value Summary
| Method | Implied Value | Used in central estimate |
|--------|---------------|--------------------------|
| Comps (median, undistorted multiples) | XX.XX [CCY] | Yes / No — [reason] |
| DCF (base) | XX.XX [CCY] | Yes / No — [reason] |
| **Central Estimate** | **XX.XX [CCY]** | |
| **Range** | **XX [CCY] — XX [CCY]** | |

**Excluded as distorted:** [method and reason, or "none"]

**Current Price vs. Central Estimate: [+/-X%] → [Cheap / Fair / Expensive]**
**Analyst Consensus Target: XX [CCY] ([+/-X%] upside)**

---

### Verdict: [CHEAP / FAIR / EXPENSIVE]

[2–3 sentences on what the valuation implies for the investment case]

**What would shift the verdict:**
- To Cheap: [specific condition — e.g., price falls to XX, [CCY] or earnings revision]
- To Expensive: [specific condition]
```

## Anti-Patterns

- Never use training-data revenue or earnings — always search for current figures
- Never apply P/E to pre-profit or high-growth companies (use EV/Revenue or EV/EBITDA instead)
- Never treat the DCF as precise — it is a range, not a price target
- Never select peers with fundamentally different business models (don't compare a SaaS company to a hardware company)
- Never use consolidated net debt or EV for companies with captive finance arms
- Never include a method you have flagged as distorted in the central estimate
- Never show peer figures in a currency other than the base currency or the company's own currency
- Do not issue a buy/sell recommendation — that is the portfolio-management skill's job. This skill outputs: Cheap / Fair / Expensive + the range.

## Verification Checklist

- [ ] Current price from `quotes`; market cap consistent with price × diluted shares
- [ ] LTM revenue and forward estimates found (not assumed)
- [ ] 4–5 comparable peers identified with similar scale and business model
- [ ] Peer multiples table has at least 3 populated peers
- [ ] All 3 DCF scenarios use different growth assumptions (not the same)
- [ ] Captive-finance companies (target and peers) use industrial net debt/EV, or those metrics are marked distorted
- [ ] Central estimate uses only undistorted methods, with any exclusion stated
- [ ] Peer revenue shown in the base currency
- [ ] Verdict is one of: Cheap / Fair / Expensive
- [ ] Currency stated clearly
