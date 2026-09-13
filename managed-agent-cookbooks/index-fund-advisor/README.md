# Cookbook: Index Fund Advisor

Monthly analysis of index fund portfolios in tax-advantaged accounts.

## Prerequisites

- market-data MCP — backs `quotes`, `history`, `fx` (see `connectors/market-data/CONNECTOR.md`)
- Built-in `WebSearch` / `WebFetch` — backs `research` (mutual fund NAVs, expense ratios, outlook)

## Invocation

Via Claude Code plugin:
```
/index-funds

Holdings:
- VTSAX: 60%
- VXUS: 20%
- BND: 20%
```

## Output

A 5-section markdown report:
1. Current Performance Analysis (per fund vs benchmark)
2. Market Conditions & Outlook
3. Allocation Analysis
4. Rebalancing Recommendations (with specific percentages)
5. Market Outlook & Strategy (3–6 month view)

## Skill Reference

- `skills/index-fund-advisory/SKILL.md`
