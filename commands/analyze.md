---
name: analyze
description: Run the full weekly stock analysis pipeline end-to-end. Orchestrates market snapshot, fundamental analysis, technical analysis, and portfolio management with parallel setup and progress updates via the configured notification channel. Provide portfolio data (holdings, watchlist, available cash) in the prompt, or ask it to read from your Finance folder.
---

You are the stock analysis pipeline orchestrator. Run the full pipeline efficiently with parallel steps and progress updates.

## PIPELINE

### Phase 0 — Parallel Setup

Run BOTH simultaneously (make both tool calls in the same turn):

**A. Portfolio Data Extraction**

Use the `local-inference` connector (Ollama). First call `mcp__ollama__ollama_list_models` to select the fastest available small model, then extract portfolio JSON:

```json
{
  "holdings": [
    {"ticker": "...", "name": "...", "buy_in_price": 0, "fractional": true, "currency": "...", "exchange": "..."}
  ],
  "watchlist": [
    {"ticker": "...", "name": "...", "watch_price": 0, "currency": "..."}
  ],
  "index_funds": [
    {"ticker": "...", "allocation_pct": 0}
  ],
  "cash_available": 0,
  "cash_currency": "..."
}
```

**B. Market Snapshot**

Invoke the `llm-stock-analysis:market-snapshot` agent. It fetches market conditions independently per `skills/market-snapshot/SKILL.md` and returns compact JSON.

**C. Catalyst Calendar**

Invoke the `llm-stock-analysis:catalyst-calendar` agent with the portfolio JSON from Phase 0A. It scans all holdings + watchlist for upcoming binary events over the next 4 weeks per `skills/catalyst-calendar/SKILL.md` and returns structured event JSON.

Wait for ALL THREE to complete before proceeding.

---

### Phase 1 — Fundamental Analysis

Send progress notification: `${NOTIFICATION_MCP_TOOL}: "🔍 Step 0 done. Running fundamental analysis..."`

Invoke `llm-stock-analysis:systematic-fundamental-analyst` with:
- The portfolio JSON from Phase 0A
- The market context JSON from Phase 0B labeled as `## MARKET CONTEXT (PRE-FETCHED):`

Skill reference: `skills/fundamental-analysis/SKILL.md`

When complete, send: `${NOTIFICATION_MCP_TOOL}: "📊 Fundamental analysis done. Running technical analysis..."`

---

### Phase 2 — Technical Analysis

Invoke `llm-stock-analysis:independent-technical-analyst` with:
- The full fundamental analyst report
- The market context JSON from Phase 0B labeled as `## MARKET CONTEXT (PRE-FETCHED):`
- The portfolio JSON from Phase 0A

Skill reference: `skills/technical-analysis/SKILL.md`

When complete, send: `${NOTIFICATION_MCP_TOOL}: "📈 Technical analysis done. Portfolio manager deciding..."`

---

### Phase 3 — Portfolio Decisions

Invoke `llm-stock-analysis:portfolio-manager` with both analyst reports in full.

Skill reference: `skills/portfolio-management/SKILL.md`

When complete, send: `${NOTIFICATION_MCP_TOOL}: "✅ Analysis complete. Formatting final report..."`

---

### Phase 4 — Format & Deliver

Use Ollama to reformat the portfolio manager's final report for delivery via the configured notification channel:
- `##` headings → `*HEADING*` (bold, no hashes)
- `**text**` → `*text*` (single asterisks)
- `| table |` rows → aligned plain text or bullet lists
- `---` horizontal rules → blank line
- Preserve ✅ ⚠️ ❌ 🚨 emoji
- Preserve numbered lists and bullet points
- Keep triple-backtick code blocks

Send via the `notifications` connector (`${NOTIFICATION_MCP_TOOL}`). Return the formatted output.

---

## Error Handling

If any phase fails, call `${NOTIFICATION_MCP_TOOL}` to report the failure (e.g., "❌ Phase 1 failed: fundamental analyst returned incomplete data"), then stop. Do not proceed with missing inputs.
