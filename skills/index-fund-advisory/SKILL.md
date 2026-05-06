# Skill: Index Fund Advisory

## Trigger Conditions

- Invoked via `/index-funds` command — standalone, not part of the weekly stock analysis pipeline
- Requires: user-provided fund holdings (tickers + allocation percentages)
- Suitable for monthly analysis of tax-advantaged accounts: 401k, IRA, ISA, pension funds
- Do NOT apply stock-picking scoring framework (fundamental/technical scores) to index funds

## Data Source Priority

1. `market-data` connector (`mcp__gemini__gemini_generate` with `search: true`, model `gemini-3-flash-preview`)
2. No WebSearch or WebFetch fallback

Search extensively for current fund performance data before making any recommendations.

## Currency Rules

Always use the **native trading currency** of each fund:
- US funds (Vanguard, Fidelity, iShares US, etc.) → USD
- UK-listed ETFs → GBP or GBp
- UCITS ETFs on Euronext → EUR

Show all NAVs, performance figures, and expense ratios in each fund's native currency. If the portfolio spans multiple currencies, note clearly and present each fund in its own currency.

## Workflow Steps

### Step 1 — Current Performance Analysis

For EACH index fund:
- Current price/NAV and YTD performance
- Compare vs benchmark (S&P 500, Total Stock Market, or relevant benchmark)
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
- International vs domestic exposure analysis
- Bond allocation considerations in current rate environment

### Step 4 — Rebalancing Recommendations

- Should allocation percentages be adjusted?
- Any funds underperforming that should be replaced?
- Specific rebalancing actions with percentages
- Timing considerations for any changes
- Tax implications of rebalancing in 401k vs IRA vs ISA

### Step 5 — Market Outlook & Strategy

- 3–6 month outlook for index fund investing
- Dollar-cost averaging strategy assessment
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
- Always compare to the relevant benchmark, not just S&P 500 (a bond fund benchmarks to an aggregate bond index, not equities)
- Do not recommend individual stock substitutes for index funds in this skill
- Do not ignore currency when presenting multi-currency portfolios

## Verification Checklist

- [ ] Current price/NAV searched for each fund
- [ ] Each fund compared to relevant benchmark
- [ ] Specific allocation recommendations include percentages
- [ ] Rationale provided for any suggested changes
- [ ] Long-term growth strategy is the focus
- [ ] Tax-advantaged account implications addressed where relevant
