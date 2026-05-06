# equity-analyst

AI-powered stock portfolio analysis as a Claude Code plugin. Structured with skill files, governed data connectors, permission-bounded subagents, and managed agent templates.

## Installation

```bash
claude --plugin-dir /path/to/equity-analyst
```

Once published:
```bash
claude plugin install equity-analyst@joaroo
```

## Commands

### `/analyze`
Full weekly portfolio analysis pipeline. Runs market snapshot, portfolio extraction, and catalyst calendar in parallel, then sequences fundamental analysis → technical analysis → portfolio management → notification delivery.

**Provide:** Portfolio holdings (with buy-in prices), watch list, available cash and currency.

### `/snapshot`
Fetch current market conditions only. Returns regime classification (RISK-ON / TRANSITIONAL / RISK-OFF) and macro context as compact JSON. No portfolio data needed.

### `/index-funds`
Monthly analysis of an index fund portfolio (401k, IRA, ISA, pension). Researches fund performance vs benchmarks, allocation appropriateness, and rebalancing recommendations.

**Provide:** Fund tickers and allocation percentages.

### `/earnings-preview TICKER`
Pre-earnings analysis for any stock. Fetches consensus estimates, builds bull/base/bear scenarios, calculates options-implied move, reviews last 4 quarters of earnings reactions, and gives a positioning recommendation (Enter Before / Wait for Result / Avoid).

### `/earnings-review TICKER`
Post-earnings analysis after a company has reported. Fetches actuals vs. estimates, guidance changes, analyst reactions (48h), assesses thesis impact (Strengthened / Neutral / Weakened), updates fundamental score, and recommends Hold / Add / Trim / Exit.

### `/catalyst-calendar`
Scans all holdings and watchlist stocks for upcoming binary events over the next 4 weeks (earnings, FDA dates, product launches, FOMC, major data releases). Returns a structured event calendar with HIGH / MEDIUM / LOW risk tiers and a portfolio-level positioning recommendation.

**Provide:** Portfolio holdings and watchlist (or full portfolio JSON).

### `/valuation TICKER`
Quick valuation sanity check. Builds a peer comps table (4–5 comparable companies across EV/EBITDA, P/E, EV/Revenue, P/S) and a simplified 3-scenario DCF (bull/base/bear). Returns an intrinsic value range and a **Cheap / Fair / Expensive** verdict.

## Pipeline (`/analyze`)

```
User Input
    │
    ├── portfolio-extractor (Ollama)   ─── Phase 0 (parallel)
    ├── market-snapshot (Gemini)       ───┤
    └── catalyst-scanner (Gemini)      ───┘
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
| catalyst-scanner | read-only | Gemini search |
| fundamental-analyst | read-only | Gemini search |
| technical-analyst | read-only | Gemini search |
| portfolio-manager | **write** (notify only) | Gemini search + notifications |

Only `portfolio-manager` can trigger notifications. Analyst subagents have no write access.

## Analysis Capabilities

**Market regime classification** — RISK-ON / TRANSITIONAL / RISK-OFF based on S&P 500 vs MAs, VIX level, sector leadership, and Fed stance. All downstream scoring weights adapt to the classified regime.

**Fundamental analysis** — New opportunity discovery (mandatory 3–5 new stocks per run), existing holdings scoring, watch list evaluation, fractional share position sizing. Regime-adjusted deployment targets (70–100% in Risk-On, 30–50% in Risk-Off).

**Technical analysis** — Chart setup, momentum (RSI/MACD/volume), support/resistance, earnings proximity risk, entry quality scoring. Binary event handling: earnings within 3 days scores as `timing: 3–4/10` with a separate flag — not a global score collapse.

**Earnings preview** — Pre-earnings consensus estimates, bull/base/bear scenarios, options-implied move, last 4 quarters of historical reactions, and positioning recommendation.

**Earnings review** — Post-earnings beat/miss table, guidance assessment, analyst reactions (48h), thesis impact (Strengthened / Neutral / Weakened), updated fundamental score, and action recommendation.

**Catalyst calendar** — 4-week forward event scan across all holdings and watchlist: earnings, FDA dates, FOMC, product launches. HIGH / MEDIUM / LOW risk tiers. Fed into `/analyze` Phase 0 so `portfolio-manager` gets pre-fetched event context.

**Valuation** — Peer comps (4–5 companies, multiple metrics) + simplified 3-scenario DCF → intrinsic value range and Cheap / Fair / Expensive verdict.

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

| Alias | Provider | Purpose | Docs |
|-------|----------|---------|------|
| `market-data` | Gemini | Real-time market data via Search Grounding | `connectors/gemini/` |
| `local-inference` | Ollama | Portfolio extraction, message formatting | `connectors/ollama/` |
| `notifications` | Any (Slack reference impl.) | Progress updates and report delivery | `connectors/slack/` |

Skills and commands reference connector aliases only. Real tool names (`mcp__gemini__*`, `mcp__ollama__*`, `mcp__slack__*`) are declared in subagent YAMLs and resolved via `.mcp.json`.

See `.mcp.json.example` for a complete wiring of all three connectors with Slack as the notification provider.

### Notification Provider

Set `NOTIFICATION_MCP_TOOL` to your provider's send tool:

| Provider | Value |
|----------|-------|
| Slack | `mcp__slack__slack_post_message` |
| Telegram | `mcp__telegram__send_message` |
| Gmail | `mcp__gmail__send_email` |

## Project Structure

```
.claude-plugin/
└── plugin.json                          # Plugin manifest (v2.0.0)
.mcp.json                                # Connector alias registry
.mcp.json.example                        # Concrete wiring: Gemini + Ollama + Slack
connectors/
├── gemini/CONNECTOR.md                  # market-data setup (Google AI API key, MCP server)
├── ollama/CONNECTOR.md                  # local-inference setup (local install, model selection)
└── slack/CONNECTOR.md                   # notifications reference impl (Slack app, bot token)
commands/
├── analyze.md                           # /analyze — full weekly pipeline
├── snapshot.md                          # /snapshot — market conditions
├── index-funds.md                       # /index-funds — 401k/IRA analysis
├── earnings-preview.md                  # /earnings-preview TICKER
├── earnings-review.md                   # /earnings-review TICKER
├── catalyst-calendar.md                 # /catalyst-calendar
└── valuation.md                         # /valuation TICKER
skills/
├── fundamental-analysis/SKILL.md        # Fundamental analysis logic
├── technical-analysis/SKILL.md          # Technical analysis logic
├── portfolio-management/SKILL.md        # Portfolio decision logic
├── market-snapshot/SKILL.md             # Market data fetch logic
├── index-fund-advisory/SKILL.md         # Index fund advisory logic
├── earnings-preview/SKILL.md            # Pre-earnings analysis logic
├── earnings-review/SKILL.md             # Post-earnings analysis logic
├── catalyst-calendar/SKILL.md           # Event risk scanning logic
└── valuation/SKILL.md                   # Comps + DCF valuation logic
managed-agent-cookbooks/
├── weekly-portfolio-review/             # /analyze pipeline (6 subagents)
├── index-fund-advisor/                  # /index-funds pipeline
├── earnings-preview/                    # /earnings-preview pipeline
├── earnings-review/                     # /earnings-review pipeline
├── catalyst-calendar/                   # /catalyst-calendar pipeline
└── valuation/                           # /valuation pipeline
```

Skills are the source of truth for all analytical logic. Commands are thin entry points that reference skills. Subagent YAMLs declare permissions and tool access. The managed agent cookbooks are deployment templates for the Anthropic Managed Agents API.
