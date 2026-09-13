# Cookbook: Weekly Portfolio Review

Full weekly stock analysis pipeline — from broker holdings (or pasted portfolio text) to a final report, optionally delivered as a notification.

## Pipeline

```
portfolio connector (broker, read-only) — or portfolio text in the prompt
    │
    orchestrator builds portfolio JSON
    │
    ├── market-snapshot ───────────────────────── Phase 0 (parallel)
    └── catalyst-scanner ────────────────────────┘
              │
    fundamental-analyst ─────────────────────── Phase 1
              │
    technical-analyst ───────────────────────── Phase 2
              │
    portfolio-manager ───────────────────────── Phase 3
              │
    orchestrator delivers report ────────────── Phase 4
              │
    Response (+ optional chat or email notification)
```

## Prerequisites

The following MCP connectors must be configured:
- market-data MCP — backs `quotes`, `history`, `indicators`, `fx` (see `connectors/market-data/CONNECTOR.md`)
- Built-in `WebSearch` / `WebFetch` — backs `research` (fundamentals, ratings, events, Fed)
- Optional broker MCP — backs `portfolio` (read tools only); without it, provide the portfolio in the prompt
- Optional: `${NOTIFICATION_MCP_TOOL}` — any chat or email MCP provider (e.g. Telegram, Slack, email). Without it, results are returned in the session.

## Invocation

Via Claude Code plugin:
```
/analyze

Portfolio (ISK, SEK):
- VOLV-B.ST: 40 shares, cost basis 11,200 SEK
- INVE-B.ST: 25 shares, cost basis 6,100 SEK

Watchlist:
- ASSA-B.ST: watching at 310 SEK
- SAND.ST: watching at 360 SEK

Cash: 10,000 SEK
```

Or ask it to read from a file: "Read my portfolio from ~/Finance/holdings.txt"

## Subagent Permission Boundaries

| Subagent | Read | Write | MCP Access |
|----------|------|-------|------------|
| orchestrator | ✅ | ❌ (notifications if configured) | portfolio: accounts, holdings, watchlists (read tools only) |
| market-snapshot | ✅ | ❌ | quotes, indicators, history, web search |
| catalyst-scanner | ✅ | ❌ | web search |
| fundamental-analyst | ✅ | ❌ | quotes, indicators, fx, web search |
| technical-analyst | ✅ | ❌ | quotes, indicators, history, web search |
| portfolio-manager | ✅ | ❌ | quotes, fx |

All subagents are read-only. Only the orchestrator sends notifications. In Claude Code and Cowork these subagents are the plugin agents in `agents/`; this YAML is a template for the Managed Agents API.

## Output

A formatted executive summary, returned in the session and optionally sent to the notification channel, with:
- Market regime classification
- Final allocation table with combined scores
- Urgent action checklist (earnings today, stops to set)
- Per-position analysis with entry targets and stop-losses
- Cash management rationale

## Skill References

- `skills/market-snapshot/SKILL.md`
- `skills/fundamental-analysis/SKILL.md`
- `skills/technical-analysis/SKILL.md`
- `skills/portfolio-management/SKILL.md`
