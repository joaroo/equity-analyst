# llm-stock-analysis

A Claude Code plugin providing AI-powered stock analysis agents for weekly portfolio management and index fund analysis.

## Installation

```bash
claude --plugin-dir /path/to/llm-stock-analysis
```

Once published to a marketplace:
```bash
claude plugin install llm-stock-analysis@joaroo
```

## Agents

### `llm-stock-analysis:stock-analysis-orchestrator`
Runs the full weekly analysis pipeline end-to-end. Invokes the three specialist agents in sequence, passing outputs between them automatically. **Start here for weekly analysis.**

**Provide in prompt:** Portfolio holdings, watch list, available cash.

---

### `llm-stock-analysis:systematic-fundamental-analyst`
Performs systematic fundamental analysis. Classifies market regime (Risk-On/Transitional/Risk-Off), discovers new investment opportunities, scores existing holdings, and produces a weekly allocation recommendation with fractional share calculations.

**Provide in prompt:** Portfolio holdings, watch list, available cash.

### `llm-stock-analysis:independent-technical-analyst`
Evaluates chart setups and entry timing after fundamental analysis is complete. Analyzes moving averages, RSI, MACD, support/resistance levels, and earnings proximity risk. Scores each stock 1–10 and provides stop-loss levels.

**Provide in prompt:** The fundamental analyst's report plus the list of stocks to analyze.

### `llm-stock-analysis:portfolio-manager`
Investment Committee Chairman that synthesizes both analyst reports into final allocation decisions. Calculates regime-weighted combined scores, reconciles disagreements, handles binary events (earnings), and produces an actionable executive summary with allocations, entry targets, and stop-losses — all in each instrument's native currency.

**Provide in prompt:** Both the fundamental and technical analyst reports.

### `llm-stock-analysis:financial-advisor-index-funds`
Monthly analysis of an index fund portfolio (401k, IRA, ISA, pension, etc.). Researches current fund performance, benchmarks, market conditions, and provides rebalancing recommendations.

**Provide in prompt:** Your index fund holdings (tickers and allocation percentages).

## Workflow

**Option A — Automated (recommended):**
```
stock-analysis-orchestrator  →  runs all 3 steps, returns final decision
```

**Option B — Manual (step-by-step):**
```
1. systematic-fundamental-analyst  →  fundamental report
2. independent-technical-analyst   →  technical report (uses fundamental report)
3. portfolio-manager               →  final allocation decisions (uses both reports)
```

The `financial-advisor-index-funds` agent runs independently for index fund portfolio analysis.

## Currency

All agents use each instrument's **native trading currency** (USD for NYSE/NASDAQ, GBP for LSE, EUR for Euronext, JPY for TSE, AUD for ASX, CAD for TSX, etc.). Mixed-currency portfolios are supported — each position is shown in its own currency.

## Project Structure

```
.claude-plugin/
└── plugin.json          # Plugin manifest
agents/
├── stock-analysis-orchestrator.md
├── systematic-fundamental-analyst.md
├── independent-technical-analyst.md
├── portfolio-manager.md
└── financial-advisor-index-funds.md
```
