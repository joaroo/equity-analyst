# Cookbook: Weekly Portfolio Review

Full weekly stock analysis pipeline — from raw portfolio text to formatted notification delivery.

## Pipeline

```
User Input (portfolio text or Finance folder reference)
    │
    ├── portfolio-extractor (Ollama) ──────────── Phase 0 (parallel)
    └── market-snapshot (Gemini search) ─────────┘
              │
    fundamental-analyst (Gemini search) ──────── Phase 1
              │
    technical-analyst (Gemini search) ────────── Phase 2
              │
    portfolio-manager (Gemini search + notify)   Phase 3
              │
    portfolio-extractor / format-notification ── Phase 4
              │
    Notification delivery (chat or email)
```

## Prerequisites

The following MCP connectors must be configured:
- `mcp__gemini__gemini_generate` — Google Gemini with search capability
- `mcp__ollama__ollama_generate` + `mcp__ollama__ollama_list_models` — local Ollama instance
- `${NOTIFICATION_MCP_TOOL}` — any chat or email MCP provider (e.g. Telegram, Slack, email). Set the `NOTIFICATION_MCP_TOOL` environment variable to the MCP tool name for your provider.

## Invocation

Via Claude Code plugin:
```
/analyze

Portfolio:
- AAPL: $150 buy-in (fractional, NYSE)
- MSFT: $280 buy-in (fractional, NASDAQ)

Watchlist:
- NVDA: watching at $850
- META: watching at $500

Cash: $100 USD
```

Or ask it to read from a file: "Read my portfolio from ~/Finance/holdings.txt"

## Subagent Permission Boundaries

| Subagent | Read | Write | MCP Access |
|----------|------|-------|------------|
| portfolio-extractor | ✅ | ❌ | Ollama only |
| market-snapshot | ✅ | ❌ | Gemini only |
| fundamental-analyst | ✅ | ❌ | Gemini only |
| technical-analyst | ✅ | ❌ | Gemini only |
| portfolio-manager | ✅ | ✅ (notifications only) | Gemini + notification connector |

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
