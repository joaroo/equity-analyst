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

Skills are the source of truth. A skill file (`skills/*/SKILL.md`) defines trigger conditions, data source priority, workflow steps, output schema, anti-patterns, and a verification checklist. Commands (`commands/*.md`) are thin entry points that name the skill to follow. Subagents (`managed-agent-cookbooks/*/subagents/*.yaml`) declare permissions and tool access for managed deployment. Connectors (`.mcp.json`) map aliases to real MCP tools. **Agents read skills; they do not invent workflow steps.**

---

## File Map

```
.mcp.json                        Connector alias registry — source of truth for tool routing
.mcp.json.example                Concrete wiring example: Gemini + Ollama + Slack
connectors/*/CONNECTOR.md        Per-provider setup docs
commands/*.md                    Slash command entry points (thin wrappers)
skills/*/SKILL.md                All analytical logic lives here
managed-agent-cookbooks/         Orchestrator + subagent YAMLs for managed deployment
```

When you need to understand what to do: **read the skill file**. When you need to understand what tool to call: **read `.mcp.json`**.

---

## Connector Rules

All data access goes through connector aliases. Never reference raw tool names in skill logic or command prose.

| Alias | Resolves to | Use for |
|-------|-------------|---------|
| `market-data` | `mcp__gemini__gemini_generate` | All live market data — prices, earnings, ratings, macro |
| `local-inference` | `mcp__ollama__ollama_generate` | Portfolio extraction, message formatting — no search needed |
| `notifications` | `${NOTIFICATION_MCP_TOOL}` | Progress updates and report delivery — portfolio-manager only |

**Call pattern for market-data:**
```
mcp__gemini__gemini_generate({
  model: "gemini-3-flash-preview",
  prompt: "...",
  search: true          ← always true for market data
})
```

**Call pattern for local-inference:**
1. Call `mcp__ollama__ollama_list_models` first — select the fastest available small model
2. Call `mcp__ollama__ollama_generate` with that model

**Never** use `WebSearch`, `WebFetch`, or any tool not declared in `.mcp.json` for market data.

---

## Permission Model

| Role | Read | Write | Notify |
|------|------|-------|--------|
| All analyst subagents | ✅ market-data | ✗ | ✗ |
| portfolio-extractor | ✅ local-inference | ✗ | ✗ |
| portfolio-manager | ✅ market-data | ✅ notifications only | ✅ |

If you are running as an analyst subagent, you have no write access. Do not attempt to call the notifications connector. Do not send output anywhere except back to the orchestrator.

---

## Skill Execution Protocol

When a command or orchestrator invokes a skill:

1. **Read the full skill file** before making any tool calls
2. **Check trigger conditions** — halt with a clear message if they are not met (e.g. `/earnings-review` before earnings have been reported)
3. **Follow workflow steps in order** — do not skip steps, do not reorder
4. **Use the output schema exactly** — field names, table structure, JSON keys must match
5. **Run the verification checklist** before returning output — if any item fails, fix it or state why it cannot be completed
6. **Never fabricate data** — if a search returns no result for a required field, state "not found" rather than estimating

---

## Running `/analyze` (the Full Pipeline)

The orchestrator (`commands/analyze.md`) runs four phases. Phase 0 is parallel; phases 1–4 are sequential.

```
Phase 0 (parallel):
  A. portfolio-extractor   → portfolio JSON
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

Phase 4: format-notification
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
Invoke `skills/market-snapshot/SKILL.md`. Return JSON only — no prose. Maximum 3 market-data calls.

### `/earnings-preview TICKER`
Check that earnings have **not yet been reported** this quarter. If they have, halt: `Earnings already reported — run /earnings-review {TICKER} instead.`  
Then follow `skills/earnings-preview/SKILL.md`.

### `/earnings-review TICKER`
Check that earnings **have been reported**. If not, halt: `Earnings not yet reported — run /earnings-preview {TICKER} instead.`  
Then follow `skills/earnings-review/SKILL.md`. Do not invoke more than 2 weeks after the report date.

### `/catalyst-calendar`
User provides portfolio JSON (holdings + watchlist). Batch tickers 5 per market-data call. Follow `skills/catalyst-calendar/SKILL.md`. Return both the JSON block and the markdown table.

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
5. **Currency accuracy** — always use native trading currency per instrument. USD for NYSE/NASDAQ, GBP for LSE, EUR for Euronext, JPY for TSE, AUD for ASX, CAD for TSX.
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

- Using training-data knowledge for revenue, earnings, or price — always search
- Calling `notifications` connector from an analyst subagent
- Skipping the market context pre-fetch header check (causes redundant macro searches)
- Collapsing the technical score to 1–2/10 because of an upcoming earnings event (see `skills/technical-analysis/SKILL.md` binary event handling)
- Comparing peers with different business models in valuation comps (SaaS vs hardware, for example)
- Issuing a buy/sell directive — output categories, not directives
- Running `/earnings-review` before earnings have been reported
- Making more market-data calls than necessary — batch tickers, reuse pre-fetched market context

---

## Adding or Modifying a Skill

1. Create or edit `skills/{name}/SKILL.md` — include all seven sections: Trigger Conditions, Data Source Priority, Workflow Steps, Output Schema, Anti-Patterns, Verification Checklist, Currency Rules
2. Register in `.claude-plugin/plugin.json` under `"skills"`
3. Create `commands/{name}.md` if a slash command is needed — thin wrapper, connector alias in body, no `tools:` frontmatter
4. Create `managed-agent-cookbooks/{name}/` with `agent.yaml`, `subagents/analyst.yaml`, `README.md` if managed deployment is needed
5. Update `README.md` commands table and capabilities section
6. Skills reference connector aliases only (`market-data`, `local-inference`, `notifications`) — never raw MCP tool names
