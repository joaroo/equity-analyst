# AGENTS.md — Operating the equity-analyst Plugin

This file is the operating manual for any AI agent running inside the equity-analyst plugin. Read it before touching any skill, command, or subagent.

---

## What This Plugin Is

equity-analyst is a structured investment research system. It does not give financial advice — it produces scored analysis that a human uses to make their own decisions. Every output ends with a score, a verdict, or a recommendation category, never a directive.

The plugin has three user-facing entry points:
- **`/analyze`** — the full weekly pipeline (market → fundamental → technical → portfolio decisions)
- **Standalone commands** — `/snapshot`, `/earnings-preview`, `/earnings-review`, `/catalyst-calendar`, `/valuation`, `/index-funds`
- **Managed agent cookbooks** — deployment templates for the Anthropic Managed Agents API

---

## Architecture in One Paragraph

Skills are the source of truth. A skill file (`skills/*/SKILL.md`) defines trigger conditions, data source priority, workflow steps, output schema, anti-patterns, and a verification checklist. Commands (`commands/*.md`) are thin entry points that name the skill to follow. Subagents (`managed-agent-cookbooks/*/subagents/*.yaml`) declare permissions and tool access for managed deployment. Connectors (`connectors.json`) map aliases to real MCP tools. **Agents read skills; they do not invent workflow steps.**

---

## File Map

```
connectors.json                  Connector alias registry — source of truth for tool routing
investor-profile.json            Investor context — base currency, account/tax rules, markets, sizing
.mcp.json.example                Concrete wiring example: Slack (notifications)
connectors/*/CONNECTOR.md        Per-provider setup docs
commands/*.md                    Slash command entry points (thin wrappers)
skills/*/SKILL.md                All analytical logic lives here
managed-agent-cookbooks/         Orchestrator + subagent YAMLs for managed deployment
```

When you need investor context (currency, account rules, home market): **read `investor-profile.json`**. When you need to understand what to do: **read the skill file**. When you need to understand what tool to call: **read `connectors.json`**.

---

## Connector Rules

All data access goes through connector aliases. Never reference raw tool names in skill logic or command prose.

| Alias | Resolves to | Use for |
|-------|-------------|---------|
| `portfolio` | Broker MCP read tools (unbound until a broker is chosen) | Accounts, holdings, cost basis, cash — orchestrator only |
| `quotes` | `market_quote` on the market-data MCP | Every current price, prior close, day change |
| `history` | `market_history` on the market-data MCP | Raw OHLCV bars → support/resistance, drawdown, event-day moves, period returns |
| `indicators` | `market_indicators` on the market-data MCP | Computed SMA 20/50/200, RSI(14), MACD(12,26,9), 52w/20d ranges, volume ratios |
| `fx` | `fx_rate` on the market-data MCP | Every currency conversion (latest or dated) |
| `research` | Built-in `WebSearch`, then `WebFetch` | Fundamentals, analyst ratings/targets, earnings dates/estimates/results, guidance, Fed stance, catalysts, mutual fund NAVs |
| `notifications` | `${NOTIFICATION_MCP_TOOL}` | Progress updates and report delivery — portfolio-manager only |

MCP tool names carry a client-specific prefix (Claude Code: `mcp__<server>__<tool>`); resolve aliases by the tool name.

**Numbers from tools, not prose.** Any figure `quotes`, `history`, `indicators` or `fx` can produce must come from those tools, carrying its timestamp and currency. A price read off a search result is stale by an unknown amount and may be the wrong listing or currency. Moving averages, RSI and MACD come from `indicators` — never searched and never calculated by hand.

**Label search-derived data.** Fundamentals and narrative from `research` must cite their source. If a structured tool fails, say so plainly and mark any fallback figure as unverified.

**Portfolio connector is read-only by rule.** Broker MCPs may grant write tools (orders, trade tickets, alerts) with the same credential. Only the orchestrator reads `portfolio`, and only with read tools. If `portfolio` is unbound or fails, use the portfolio the user provides and say so.

---

## Permission Model

| Role | Read | Write | Notify |
|------|------|-------|--------|
| Orchestrator (`/analyze`) | ✅ portfolio (read tools only) | ✗ | ✅ milestones |
| Analyst subagents | ✅ quotes / history / indicators / fx / research (per YAML) | ✗ | ✗ |
| portfolio-manager | ✅ quotes, fx | ✅ notifications only | ✅ |

If you are running as an analyst subagent, you have no write access. Do not attempt to call the notifications connector. Do not send output anywhere except back to the orchestrator.

---

## Skill Execution Protocol

When a command or orchestrator invokes a skill:

1. **Read the full skill file** before making any tool calls
2. **Check trigger conditions** — halt with a clear message if they are not met (e.g. `/earnings-review` before earnings have been reported)
3. **Follow workflow steps in order** — do not skip steps, do not reorder
4. **Use the output schema exactly** — field names, table structure, JSON keys must match
5. **Run the verification checklist** before returning output — if any item fails, fix it or state why it cannot be completed
6. **Never fabricate data** — if a tool or search returns no result for a required field, state "not found" rather than estimating

---

## Running `/analyze` (the Full Pipeline)

The orchestrator (`commands/analyze.md`) parses the portfolio input itself, then runs Phase 0 in parallel and phases 1–4 sequentially.

```
Phase 0A (orchestrator): parse portfolio input → portfolio JSON

Phase 0 (parallel):
  B. market-snapshot       → market context JSON  (skills/market-snapshot/SKILL.md)
  C. catalyst-scanner      → catalyst calendar JSON  (skills/catalyst-calendar/SKILL.md)

Phase 1: fundamental-analyst
  Input: portfolio JSON + market context JSON (labeled ## MARKET CONTEXT (PRE-FETCHED):)
  Skill: skills/fundamental-analysis/SKILL.md
  Output: full report + <analysis-json> block

Phase 2: technical-analyst
  Input: fundamental report + market context JSON + portfolio JSON
  Skill: skills/technical-analysis/SKILL.md
  Output: full report + <technical-json> block

Phase 3: portfolio-manager
  Input: fundamental report + technical report + catalyst calendar JSON
  Skill: skills/portfolio-management/SKILL.md
  Output: executive summary with position decisions

Phase 4: format-notification (orchestrator, no sub-agent)
  Input: portfolio-manager output
  Task: reformat markdown to notification channel format (see commands/analyze.md Phase 4)
  Deliver via: ${NOTIFICATION_MCP_TOOL}
```

**Critical handoff rules:**
- Phase 1 must receive the market context labeled exactly as `## MARKET CONTEXT (PRE-FETCHED):` — the fundamental-analysis skill skips macro searches when this header is present
- Phase 2 must receive the full Phase 1 report including the `<analysis-json>` block — the technical-analysis skill reads fundamental scores from it
- Phase 3 must receive both `<analysis-json>` and `<technical-json>` blocks — the portfolio-management skill uses them for combined score calculation
- Catalyst calendar JSON from Phase 0C must be passed to Phase 3 — it replaces per-stock earnings searches in the portfolio-manager

---

## Standalone Command Protocols

### `/snapshot`
Invoke `skills/market-snapshot/SKILL.md`. Return JSON only — no prose. Index levels, VIX and sector returns from `quotes`/`history`; at most 2 `research` calls (Fed stance).

### `/earnings-preview TICKER`
Check that earnings have **not yet been reported** this quarter. If they have, halt: `Earnings already reported — run /earnings-review {TICKER} instead.`  
Then follow `skills/earnings-preview/SKILL.md`.

### `/earnings-review TICKER`
Check that earnings **have been reported**. If not, halt: `Earnings not yet reported — run /earnings-preview {TICKER} instead.`  
Then follow `skills/earnings-review/SKILL.md`. Do not invoke more than 2 weeks after the report date.

### `/catalyst-calendar`
User provides portfolio JSON (holdings + watchlist), or read it from `portfolio`. One ticker per `research` query. Follow `skills/catalyst-calendar/SKILL.md`. Return both the JSON block and the markdown table.

### `/valuation TICKER`
Follow `skills/valuation/SKILL.md`. Output: Cheap / Fair / Expensive verdict with intrinsic value range. **Do not issue a buy/sell recommendation** — that is the portfolio-manager's role.

### `/index-funds`
User provides fund tickers and allocation percentages. Follow `skills/index-fund-advisory/SKILL.md`. Do not apply the stock-picking scoring framework to index funds.

---

## Output Integrity Rules

These apply to every skill, every time:

1. **No training-data financials** — revenue, earnings, EPS, and growth rates must be searched. They change quarterly.
2. **No estimated dates** — if an earnings date, FDA date, or event date cannot be confirmed via search, write "date unconfirmed" rather than guessing.
3. **No fabricated peers** — comparable companies in valuation comps must be real, publicly traded, and searchable. Do not invent tickers.
4. **No score manipulation for narrative** — scores are calculated from the formula in the skill file. Do not adjust scores to match a preferred conclusion.
5. **Currency accuracy** — prices, targets and stops in each instrument's native trading currency (SEK Nasdaq Stockholm, NOK Oslo, DKK Copenhagen, EUR Helsinki/Xetra/Euronext, GBP London, USD US exchanges); cash, allocations, portfolio value and P&L in the base currency from `investor-profile.json`, converted with `fx`. Never write `$` for a non-USD amount.
6. **Verdicts are bounded** — portfolio-manager outputs one of: Strong Buy / Conditional / Binary Event Special Case / Skip. Valuation outputs one of: Cheap / Fair / Expensive. Earnings review outputs one of: Hold / Add / Trim / Exit. No other verdict categories.

---

## What to Do When a Search Returns No Data

| Situation | Correct behaviour |
|-----------|------------------|
| Price not found | State current price unavailable; do not estimate |
| Earnings date unconfirmed | Mark as "date unconfirmed" in catalyst calendar; do not exclude the ticker |
| No analyst coverage | Note "no analyst coverage found"; omit consensus target from output |
| Peer has no EBITDA (pre-profit) | Use EV/Revenue and P/S only; omit EV/EBITDA for that peer |
| Options data unavailable | Omit options-implied move; note it was not found |

Never silently skip a required field. Always state why it is missing.

---

## Common Mistakes to Avoid

- Using training-data knowledge for revenue, earnings, or price — prices from `quotes`, financials from `research`
- Taking a price, index level or indicator value from a search result
- Calling `notifications` connector from an analyst subagent
- Skipping the market context pre-fetch header check (causes redundant macro searches)
- Collapsing the technical score to 1–2/10 because of an upcoming earnings event (see `skills/technical-analysis/SKILL.md` binary event handling)
- Comparing peers with different business models in valuation comps (SaaS vs hardware, for example)
- Issuing a buy/sell directive — output categories, not directives
- Running `/earnings-review` before earnings have been reported
- Making more calls than necessary — batch symbols in `quotes` (up to 20), reuse pre-fetched market context

---

## Adding or Modifying a Skill

1. Create or edit `skills/{name}/SKILL.md` — include all seven sections: Trigger Conditions, Data Source Priority, Workflow Steps, Output Schema, Anti-Patterns, Verification Checklist, Currency Rules
2. Register in `.claude-plugin/plugin.json` under `"skills"`
3. Create `commands/{name}.md` if a slash command is needed — thin wrapper, connector alias in body, no `tools:` frontmatter
4. Create `managed-agent-cookbooks/{name}/` with `agent.yaml`, `subagents/analyst.yaml`, `README.md` if managed deployment is needed
5. Update `README.md` commands table and capabilities section
6. Skills reference connector aliases only (`portfolio`, `quotes`, `history`, `indicators`, `fx`, `research`, `notifications`) — never raw MCP tool names
