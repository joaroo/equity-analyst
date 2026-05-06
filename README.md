# llm-stock-analysis

AI-powered stock portfolio analysis as a Claude Code plugin. Structured with skill files, governed data connectors, permission-bounded subagents, and managed agent templates.

## Installation

```bash
claude --plugin-dir /path/to/llm-stock-analysis
```

Once published:
```bash
claude plugin install llm-stock-analysis@joaroo
```

## Commands

### `/analyze`
Full weekly portfolio analysis pipeline. Runs market snapshot and portfolio extraction in parallel, then sequences fundamental analysis → technical analysis → portfolio management → notification delivery.

**Provide:** Portfolio holdings (with buy-in prices), watch list, available cash and currency.

### `/snapshot`
Fetch current market conditions only. Returns regime classification (RISK-ON / TRANSITIONAL / RISK-OFF) and macro context as compact JSON. No portfolio data needed.

### `/index-funds`
Monthly analysis of an index fund portfolio (401k, IRA, ISA, pension). Researches fund performance vs benchmarks, allocation appropriateness, and rebalancing recommendations.

**Provide:** Fund tickers and allocation percentages.

## Pipeline (`/analyze`)

```
User Input
    │
    ├── portfolio-extractor (Ollama)   ─── Phase 0 (parallel)
    └── market-snapshot (Gemini)       ───┘
              │
    fundamental-analyst (Gemini)       ─── Phase 1
              │
    technical-analyst (Gemini)         ─── Phase 2
              │
    portfolio-manager (Gemini + notify)─── Phase 3
              │
    format-notification (Ollama)       ─── Phase 4
              │
    Notification delivery
```

**Subagent permission boundaries:**

| Subagent | Access | Data connector |
|----------|--------|----------------|
| portfolio-extractor | read-only | Ollama (local inference) |
| market-snapshot | read-only | Gemini search |
| fundamental-analyst | read-only | Gemini search |
| technical-analyst | read-only | Gemini search |
| portfolio-manager | **write** (notify only) | Gemini search + notifications |

Only `portfolio-manager` can trigger notifications. Analyst subagents have no write access.

## Analysis Capabilities

**Market regime classification** — RISK-ON / TRANSITIONAL / RISK-OFF based on S&P 500 vs MAs, VIX level, sector leadership, and Fed stance. All downstream scoring weights adapt to the classified regime.

**Fundamental analysis** — New opportunity discovery (mandatory 3–5 new stocks per run), existing holdings scoring, watch list evaluation, fractional share position sizing. Regime-adjusted deployment targets (70–100% in Risk-On, 30–50% in Risk-Off).

**Technical analysis** — Chart setup, momentum (RSI/MACD/volume), support/resistance, earnings proximity risk, entry quality scoring. Binary event handling: earnings within 3 days scores as `timing: 3–4/10` with a separate flag — not a global score collapse.

**Portfolio management** — Regime-weighted combined scores `(Fund × weight) + (Tech × weight)`, analyst disagreement resolution, binary event position sizing framework, P&L-tiered hold/trim/add/exit logic, cash allocation philosophy.

**Combined score weights by stock type and regime:**

| Stock Type | Risk-On | Transitional | Risk-Off |
|------------|---------|--------------|----------|
| Growth | 35% Fund / 65% Tech | 45% / 55% | 60% / 40% |
| Value | 55% Fund / 45% Tech | 60% / 40% | 70% / 30% |

## Currency

All analysis uses each instrument's **native trading currency** — USD for NYSE/NASDAQ, GBP for LSE, EUR for Euronext, JPY for TSE, AUD for ASX, CAD for TSX. Mixed-currency portfolios are supported; each position is shown in its own currency.

## Data Sources

Governed in `.mcp.json`:

| Connector | Provider | Purpose |
|-----------|----------|---------|
| `market-data` | Gemini (search: true) | All real-time market data |
| `local-inference` | Ollama | Portfolio extraction, notification formatting |
| `notifications` | `${NOTIFICATION_MCP_TOOL}` | Progress updates and report delivery |

Set `NOTIFICATION_MCP_TOOL` to any chat or email MCP tool (Telegram, Slack, email, etc.).

## Project Structure

```
.claude-plugin/
└── plugin.json                          # Plugin manifest (v2.0.0)
.mcp.json                                # Data connector registry
commands/
├── analyze.md                           # /analyze entry point
├── snapshot.md                          # /snapshot entry point
└── index-funds.md                       # /index-funds entry point
skills/
├── fundamental-analysis/SKILL.md        # Fundamental analysis logic
├── technical-analysis/SKILL.md          # Technical analysis logic
├── portfolio-management/SKILL.md        # Portfolio decision logic
├── market-snapshot/SKILL.md             # Market data fetch logic
└── index-fund-advisory/SKILL.md         # Index fund advisory logic
managed-agent-cookbooks/
├── weekly-portfolio-review/
│   ├── agent.yaml                       # Orchestrator template
│   ├── subagents/                       # 5 permission-bounded subagents
│   └── README.md
└── index-fund-advisor/
    ├── agent.yaml
    ├── subagents/
    └── README.md
```

Skills are the source of truth for all analytical logic. Commands are thin entry points that reference skills. Subagent YAMLs declare permissions and tool access. The managed agent cookbooks are deployment templates for the Anthropic Managed Agents API.
