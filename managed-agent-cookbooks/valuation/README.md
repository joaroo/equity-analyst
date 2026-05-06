# Cookbook: Valuation

Quick valuation sanity check — peer comps + simplified DCF for any stock.

## Invocation

```
/valuation NVDA
```

## Output

- Company financials (LTM + forward estimates)
- Peer comps table (4–5 comparables: EV/EBITDA, P/E, EV/Revenue, P/S)
- DCF: 3 scenarios (bull/base/bear) → intrinsic value range
- Central estimate vs. current price (% premium/discount)
- Verdict: **Cheap / Fair / Expensive**

Does not issue a buy/sell recommendation — that is handled by `/analyze`.

## Skill Reference

- `skills/valuation/SKILL.md`
