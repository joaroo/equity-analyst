# Skill: Valuation

## Trigger Conditions

- Invoked via `/valuation TICKER` for any stock before initiating a new position or as a sanity check on an existing holding
- Optionally invoked as part of the fundamental-analysis workflow when a high conviction score needs absolute value confirmation
- Requires: ticker symbol
- Best used when: considering a position >$50, stocks with P/E >40x or <10x, or after a large price move

## Data Source Priority

1. `market-data` connector (see `.mcp.json`)
2. No fallback — all financial metrics, peer multiples, and analyst targets must be live-searched

Do not use training-data financials — revenue, earnings, and growth rates change quarterly and must be searched.

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

Search `[TICKER] shares outstanding market cap`:
- Shares outstanding (diluted)
- Current market cap
- Enterprise value (market cap + net debt, or search directly)

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

For each peer, search `[PEER_TICKER] EV/EBITDA P/E price to sales forward multiple`:

Build the comps table:

| Ticker | Revenue ($B) | Rev Growth | EBITDA Margin | EV/EBITDA | P/E (FWD) | EV/Revenue | P/S |
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

- **EV/EBITDA implied price:** (Peer Median EV/EBITDA × LTM EBITDA − Net Debt) ÷ Shares = $X.XX
- **P/E implied price:** Peer Median P/E × Forward EPS = $X.XX
- **EV/Revenue implied price:** (Peer Median EV/Revenue × Forward Revenue − Net Debt) ÷ Shares = $X.XX

Comps-implied value range: low $X — high $X (using spread of peer multiples, not just median)

### Step 5 — Simplified DCF

Use 3 scenarios. Pull analyst consensus for revenue/earnings estimates where available.

**Inputs:**
- Base revenue: LTM revenue
- Growth rate assumptions per scenario (from analyst estimates or historical trend)
- Terminal growth rate: 3% (conservative long-term)
- Discount rate (WACC): 10% default; adjust for risk profile

**Bull Case** (optimistic scenario):
- Revenue CAGR over 5 years: analyst high estimate or +5% above consensus
- EBITDA margin: expands to sector median or historical peak
- Terminal multiple: current peer median EV/EBITDA
- Implied intrinsic value: $X.XX per share

**Base Case** (consensus scenario):
- Revenue CAGR: analyst consensus estimate
- EBITDA margin: current level maintained
- Terminal multiple: slight discount to peer median
- Implied intrinsic value: $X.XX per share

**Bear Case** (conservative scenario):
- Revenue CAGR: below consensus by 3–5%
- EBITDA margin: compression scenario
- Terminal multiple: at discount to peers
- Implied intrinsic value: $X.XX per share

### Step 6 — Synthesis and Verdict

Combine comps and DCF to produce an intrinsic value range:
- Low end: bear DCF or comps low
- High end: bull DCF or comps high
- Central estimate: average of base DCF and comps median implied

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

## Output Schema

```markdown
## Valuation: [TICKER] — [Company Name]

**Current Price:** $XX.XX | **Market Cap:** $XB | **Enterprise Value:** $XB

---

### Company Financials
| Metric | LTM | Forward (NTM) | YoY Growth |
|--------|-----|---------------|------------|
| Revenue | $XB | $XB | +X% |
| EBITDA | $XB | $XB | +X% |
| EPS (diluted) | $X.XX | $X.XX | +X% |
| FCF | $XB | — | — |

---

### Comparable Companies

| Ticker | Rev ($B) | Rev Growth | EBITDA Margin | EV/EBITDA | Fwd P/E | EV/Rev |
|--------|----------|------------|---------------|-----------|---------|--------|
| [TICKER] | X | X% | X% | X.Xx | X.Xx | X.Xx |
| [PEER 1] | X | X% | X% | X.Xx | X.Xx | X.Xx |
| [PEER 2] | X | X% | X% | X.Xx | X.Xx | X.Xx |
| [PEER 3] | X | X% | X% | X.Xx | X.Xx | X.Xx |
| **Peer Median** | — | — | — | **X.Xx** | **X.Xx** | **X.Xx** |

**Comps-Implied Range:** $XX — $XX per share

---

### DCF Scenarios
| Scenario | Rev CAGR | EBITDA Margin | Implied Value |
|----------|----------|---------------|---------------|
| Bull | +X% | X% | $XX.XX |
| Base | +X% | X% | $XX.XX |
| Bear | +X% | X% | $XX.XX |

---

### Intrinsic Value Summary
| Method | Implied Value |
|--------|---------------|
| Comps (median) | $XX.XX |
| DCF (base) | $XX.XX |
| **Central Estimate** | **$XX.XX** |
| **Range** | **$XX — $XX** |

**Current Price vs. Central Estimate: [+/-X%] → [Cheap / Fair / Expensive]**
**Analyst Consensus Target: $XX ([+/-X%] upside)**

---

### Verdict: [CHEAP / FAIR / EXPENSIVE]

[2–3 sentences on what the valuation implies for the investment case]

**What would shift the verdict:**
- To Cheap: [specific condition — e.g., price falls to $XX, or earnings revision]
- To Expensive: [specific condition]
```

## Anti-Patterns

- Never use training-data revenue or earnings — always search for current figures
- Never apply P/E to pre-profit or high-growth companies (use EV/Revenue or EV/EBITDA instead)
- Never treat the DCF as precise — it is a range, not a price target
- Never select peers with fundamentally different business models (don't compare a SaaS company to a hardware company)
- Do not issue a buy/sell recommendation — that is the portfolio-management skill's job. This skill outputs: Cheap / Fair / Expensive + the range.

## Verification Checklist

- [ ] Current price and market cap confirmed via search
- [ ] LTM revenue and forward estimates found (not assumed)
- [ ] 4–5 comparable peers identified with similar scale and business model
- [ ] Peer multiples table has at least 3 populated peers
- [ ] All 3 DCF scenarios use different growth assumptions (not the same)
- [ ] Central estimate calculated as average of base DCF and comps median
- [ ] Verdict is one of: Cheap / Fair / Expensive
- [ ] Currency stated clearly
