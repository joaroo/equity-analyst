# Connectors

Connectors are the data source layer for this plugin. Most are MCP servers exposing a set of tools; `research` is the built-in web search. Skills and commands reference connectors by **alias** (defined in `connectors.json`) — never by tool name directly.

## Connector Aliases

| Alias | Provider | Role |
|-------|----------|------|
| `portfolio` | Broker MCP (Montrose or IBKR) — read tools only | Accounts, holdings, cost basis, cash |
| `quotes` | [market-data MCP](market-data/CONNECTOR.md) | Current prices |
| `history` | [market-data MCP](market-data/CONNECTOR.md) | Raw OHLCV bars for support/resistance and returns |
| `indicators` | [market-data MCP](market-data/CONNECTOR.md) | Computed MAs, RSI, MACD, ranges, volume ratios |
| `fx` | [market-data MCP](market-data/CONNECTOR.md) | Currency conversion |
| `research` | Built-in WebSearch / WebFetch | Fundamentals, ratings, earnings, guidance, Fed, catalysts |
| `notifications` | Any chat/email MCP | Progress updates and final report delivery |

## Portfolio Provider

The `portfolio` alias is unbound until you choose a broker. Tested options:

| Broker | Read tools used | Notes |
|--------|-----------------|-------|
| Montrose (`https://mcp.montrose.io/`, OAuth) | `get_user_accounts`, `get_holdings` | Accounts addressable by ID (pick the ISK). Access expires after 7 days. No market data. Also exposes write tools — never used. |
| IBKR (`https://api.ibkr.com/v1/api/mcp-public`, OAuth) | `get_account_positions`, `get_account_balances`, `get_account_summary` | One connected account at a time. Also has price history and options, not used by the plugin yet. |

Neither broker provides fundamentals or analyst consensus.

## Adding a Connector

1. Install and configure the MCP server (see per-provider CONNECTOR.md)
2. Add the server to your Claude Code settings (`~/.claude.json` or `.claude/settings.json`)
3. Set any required environment variables
4. Verify the alias is wired correctly in `connectors.json`

## Notification Provider

The `notifications` connector is provider-agnostic. Set `NOTIFICATION_MCP_TOOL` to the tool name of your chosen provider:

| Provider | Value |
|----------|-------|
| Slack | `mcp__slack__slack_post_message` |
| Telegram | `mcp__telegram__send_message` |
| Email (Gmail) | `mcp__gmail__send_email` |

See each provider's CONNECTOR.md for setup details. The Slack connector is the reference example.

## Example: Full Setup

See `.mcp.json.example` for a concrete wiring with Slack as the notification provider.
