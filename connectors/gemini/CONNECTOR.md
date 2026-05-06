# Connector: Gemini — `market-data`

**Alias:** `market-data`  
**Used by:** All analyst skills — fundamental, technical, market-snapshot, earnings-preview, earnings-review, catalyst-calendar, valuation

Provides real-time web search and AI generation via Google Gemini's Search Grounding capability. The `search: true` parameter grounds responses in live Google Search results, making it suitable for current prices, analyst ratings, earnings dates, and macro data.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes | Google AI Studio API key — https://aistudio.google.com/app/apikey |

## MCP Server Setup

Add to `~/.claude.json` (global) or `.claude/settings.json` (project):

```json
{
  "mcpServers": {
    "gemini": {
      "command": "npx",
      "args": ["-y", "gemini-mcp-server"],
      "env": {
        "GOOGLE_API_KEY": "${GOOGLE_API_KEY}"
      }
    }
  }
}
```

> The server must register under the name `gemini` so its tools resolve as `mcp__gemini__*`.

## Tools Exposed

| Tool | Used for |
|------|----------|
| `mcp__gemini__gemini_generate` | All market data searches — pass `search: true` to ground in live results |
| `mcp__gemini__gemini_list_models` | Model enumeration at startup |

## Call Pattern

Skills use the `market-data` alias. The runtime resolves it to:

```
mcp__gemini__gemini_generate({
  model: "gemini-3-flash-preview",
  prompt: "...",
  search: true
})
```

`search: true` activates Google Search grounding. Omit it only for pure text tasks (message formatting, summarisation).

## Model Selection

Default: `gemini-3-flash-preview` — best balance of speed, cost, and search quality for market data.

To switch models, update the `model` field in `.mcp.json`. Available models:

```
mcp__gemini__gemini_list_models()
```

Notable options:

| Model | Use case |
|-------|----------|
| `gemini-3-flash-preview` | Default — fast, cheap, good search grounding |
| `gemini-3-pro-preview` | Complex reasoning tasks (DCF, multi-step analysis) |

## Verification

After setup, run:

```
/snapshot
```

Expected output: JSON block containing `regime`, `sp500`, `vix`, `fed_stance`. If the connector is misconfigured, the market-snapshot skill will return an error before any stock analysis begins.

## API Limits

Gemini Flash has generous rate limits for personal use. If you hit limits during `/analyze`:
- The skill batches multiple tickers into single calls to minimise usage
- Catalyst-calendar batches 5 tickers per call
- Market-snapshot targets 2–3 calls maximum
