# Connectors

Connectors are the data source layer for this plugin. Most are MCP servers exposing a set of tools; `research` is the built-in web search. Skills and commands reference connectors by **alias** (defined in `connectors.json`) — never by tool name directly.

## Connector Aliases

| Alias | Provider | Role |
|-------|----------|------|
| `portfolio` | Broker MCP (e.g. Montrose) — read tools only | Accounts, holdings, cost basis, cash |
| `quotes` | [market-data MCP](market-data/CONNECTOR.md) | Current prices |
| `history` | [market-data MCP](market-data/CONNECTOR.md) | Raw OHLCV bars for support/resistance and returns |
| `indicators` | [market-data MCP](market-data/CONNECTOR.md) | Computed MAs, RSI, MACD, ranges, volume ratios |
| `fx` | [market-data MCP](market-data/CONNECTOR.md) | Currency conversion |
| `research` | Built-in WebSearch / WebFetch | Fundamentals, ratings, earnings, guidance, Fed, catalysts |
| `notifications` | Any chat/email MCP (optional) | Progress updates and final report delivery |

## Portfolio Provider

The `portfolio` alias is unbound until you choose a broker. Tested options:

| Broker | Read tools used | Notes |
|--------|-----------------|-------|
| Montrose (`https://mcp.montrose.io/`, OAuth) | `get_user_accounts`, `get_holdings`, `get_watchlists`, `get_watchlist` | Accounts addressable by ID (pick the ISK). Access expires after 7 days. No market data. Also exposes write tools — never used. |

Montrose does not provide fundamentals or analyst consensus.

**Tool permissions.** Plugin agents cannot restrict MCP servers, so enforce read-only in the client: in the broker connector's tool permissions, set every write/delete tool (trade tickets, alerts, watchlist changes) to never allowed, and set the read tools above to always allowed — scheduled runs cannot answer approval prompts.

**Web research domains.** `research` may only fetch pages from `research_sources.fetch_allowed` in `investor-profile.json`. Approve each of those domains once in Cowork before scheduling runs.

**Account and watchlist selection.** Set `portfolio.account` and `portfolio.watchlist` in `investor-profile.json` when the broker has more than one ISK account or watchlist.

## Adding a Connector

1. Install and configure the MCP server (see per-provider CONNECTOR.md)
2. Add the server to your Claude Code settings (`~/.claude.json` or `.claude/settings.json`)
3. Set any required environment variables
4. Verify the alias is wired correctly in `connectors.json`

## Notification Provider

The `notifications` connector is optional and provider-agnostic. Set `NOTIFICATION_MCP_TOOL` to the tool name of your chosen provider; if it is unset, `/analyze` returns results in the session only:

| Provider | Value |
|----------|-------|
| Slack | `mcp__slack__slack_post_message` |
| Telegram | `mcp__telegram__send_message` |
| Email (Gmail) | `mcp__gmail__send_email` |

See each provider's CONNECTOR.md for setup details. The Slack connector is the reference example.

## Example: Full Setup

See `.mcp.json.example` for a concrete wiring with Slack as the notification provider.
