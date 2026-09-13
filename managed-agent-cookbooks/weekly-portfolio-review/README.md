# Cookbook: Weekly Portfolio Review

Full weekly stock analysis pipeline — from raw portfolio text to formatted notification delivery.

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
    portfolio-manager (+ notify) ────────────── Phase 3
              │
    orchestrator formats notification ───────── Phase 4
              │
    Notification delivery (chat or email)
```

## Prerequisites

The following MCP connectors must be configured:
- market-data MCP — backs `quotes`, `history`, `indicators`, `fx` (see `connectors/market-data/CONNECTOR.md`)
- Built-in `WebSearch` / `WebFetch` — backs `research` (fundamentals, ratings, events, Fed)
- Optional broker MCP — backs `portfolio` (read tools only); without it, provide the portfolio in the prompt
- `${NOTIFICATION_MCP_TOOL}` — any chat or email MCP provider (e.g. Telegram, Slack, email). Set the `NOTIFICATION_MCP_TOOL` environment variable to the MCP tool name for your provider.

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
| orchestrator | ✅ | ❌ | portfolio (read tools only) |
| market-snapshot | ✅ | ❌ | quotes, indicators, history, web search |
| catalyst-scanner | ✅ | ❌ | web search |
| fundamental-analyst | ✅ | ❌ | quotes, indicators, fx, web search |
| technical-analyst | ✅ | ❌ | quotes, indicators, history, web search |
| portfolio-manager | ✅ | ✅ (notifications only) | quotes, fx + notification connector |

Only `portfolio-manager` can trigger notifications. Read-only analysts cannot cause side effects.

## Output

A formatted executive summary delivered via the configured notification channel with:
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
