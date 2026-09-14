---
name: index-fund-advisory
description: Monthly review of an index fund portfolio in a tax-advantaged account — per-fund performance vs benchmark, costs, allocation drift, rebalancing recommendations with percentages, and a 3–6 month outlook. Use for /index-funds or questions about fund allocation; not for individual stock picking.
---

# Skill: Index Fund Advisory

## Trigger Conditions

- Invoked via `/index-funds` command — standalone, not part of the weekly stock analysis pipeline
- Requires: user-provided fund holdings (tickers + allocation percentages)
- Suitable for monthly analysis of tax-advantaged accounts — by default a Swedish ISK (see `investor-profile.json`); also pension or other wrapper accounts if the profile says so
- Do NOT apply stock-picking scoring framework (fundamental/technical scores) to index funds

## Data Source Priority

1. `portfolio` connector — fund holdings and values, when bound (otherwise user-provided holdings)
2. `quotes` connector — current price for exchange-traded funds and benchmark indices
3. `history` connector — YTD and period performance for ETFs and benchmarks (`range: "ytd"`)
4. `fx` connector — every currency conversion
5. `research` connector (WebSearch/WebFetch) — NAVs and performance for mutual funds that are not exchange-traded, expense ratios, fund changes, market outlook

Symbols for `quotes` and `history` use exchange suffixes: Stockholm `VOLV-B.ST`, Helsinki `.HE`, Copenhagen `.CO`, Oslo `.OL`, Xetra `.DE`, London `.L`; US tickers take none; indices use a caret (`^GSPC`, `^VIX`, `^OMX`). A 404 usually means the wrong suffix.

Mutual funds (e.g. Swedish UCITS funds without a ticker) usually have no `quotes` symbol: take their NAV from `research`, cite the source and date, and note that the NAV may lag by a day or more.

## Investor Context

Read `investor-profile.json` first: base currency, account type and benchmarks.

## Currency Rules

Show each fund's NAV in its own currency (most Swedish funds quote in SEK; UCITS ETFs on Xetra or Euronext in EUR). Report holdings, allocation values and portfolio performance in the base currency (SEK by default), converted with `fx`. For funds holding foreign assets, note that SEK returns include currency effects.

## Account Rules (ISK)

- Rebalancing, switching funds and selling have no tax cost inside an ISK — recommend changes on merit, cost and risk only.
- The account is taxed on its value each year regardless of return, so fund fees and idle cash are the main controllable drags.
- Only ISK-eligible funds and UCITS ETFs tradable at the broker. US-domiciled ETFs (e.g. VTI, VOO, BND) are not available to EU retail investors — never recommend them; suggest UCITS equivalents.

**Research sources.** WebFetch only pages on the domains in `research_sources.fetch_allowed` (`investor-profile.json`) — each new domain triggers an approval prompt that would stall a scheduled run. Prefer those domains in WebSearch (`allowed_domains`) when they cover the need. If nothing on the list has it, record "not found" rather than fetching another site.

## Workflow Steps

### Step 1 — Current Performance Analysis

For EACH index fund:
- Current price/NAV and YTD performance (`quotes`/`history` for ETFs; `research` for mutual fund NAVs)
- Compare vs the fund's own benchmark, measured in SEK: e.g. OMX Stockholm All-Share (`^OMXSPI`) for Swedish equity funds, MSCI World (`XDWD.DE`, converted with `fx`) for global funds, STOXX Europe 600 for European funds, a Swedish bond index for fixed income
- Expense ratios and any recent changes
- Any fund changes, mergers, or management updates
- Whether allocation percentages still make sense

### Step 2 — Market Conditions & Outlook

- Current market conditions across major indices
- Economic indicators affecting long-term investing
- Interest rate environment impact on different fund categories
- Sector rotation trends affecting fund performance
- Inflation impact on different asset classes

### Step 3 — Allocation Analysis

- Is the current allocation appropriate for long-term growth?
- Over/under-exposure to specific sectors or asset classes?
- Age-appropriate risk assessment (focused on long-term growth)
- Swedish vs international exposure, and unhedged currency exposure in SEK terms
- Bond allocation considerations in current rate environment

### Step 4 — Rebalancing Recommendations

- Should allocation percentages be adjusted?
- Any funds underperforming that should be replaced?
- Specific rebalancing actions with percentages
- Timing considerations for any changes
- Rebalancing is tax-free inside the ISK; weigh trading costs and fund fees instead

### Step 5 — Market Outlook & Strategy

- 3–6 month outlook for index fund investing
- Regular monthly saving (månadssparande) strategy assessment
- Any tactical adjustments for current market cycle
- Defensive vs growth positioning recommendations

## Output Schema

Structure with clear markdown sections:

```markdown
## 1. Current Performance Analysis
[Per-fund: NAV, YTD, vs benchmark, expense ratio, any changes]

## 2. Market Conditions & Outlook
[Macro factors, rate environment, sector rotation, inflation]

## 3. Allocation Analysis
[Appropriateness, concentration, international/domestic, bonds]

## 4. Rebalancing Recommendations
[Specific percentages, fund replacements if any, timing, tax notes]

## 5. Market Outlook & Strategy
[3–6 month view, DCA assessment, tactical adjustments]
```

Formatting rules:
- Use `##` for main sections, `###` for subsections
- Bold fund tickers and key metrics with `**`
- Include specific percentages and performance numbers
- Keep paragraphs short (2–3 sentences max)
- Be direct and actionable

## Anti-Patterns

- Do not apply stock-picking scoring framework to index funds
- Do not recommend frequent rebalancing without considering tax implications
- Always compare to the relevant benchmark in SEK, not just a US index (a bond fund benchmarks to a bond index, not equities)
- Never recommend US-domiciled ETFs or cite 401k/IRA rules for an ISK
- Never cite capital gains tax on rebalancing inside an ISK
- Do not recommend individual stock substitutes for index funds in this skill
- Do not ignore currency when presenting multi-currency portfolios

## Verification Checklist

- [ ] Current price/NAV for each fund — from `quotes` where a symbol exists, otherwise a dated, cited NAV
- [ ] Each fund compared to relevant benchmark
- [ ] Specific allocation recommendations include percentages
- [ ] Rationale provided for any suggested changes
- [ ] Long-term growth strategy is the focus
- [ ] Account implications follow `investor-profile.json` (ISK: no tax on switches, value-based tax)
- [ ] All recommended funds are ISK-eligible (no US-domiciled ETFs)
