# Connectors

Connectors are the data source layer for this plugin. Each connector is an MCP server that exposes a set of tools. Skills and commands reference connectors by **alias** (defined in `.mcp.json`) — never by tool name directly.

## Connector Aliases

| Alias | Provider | Role |
|-------|----------|------|
| `market-data` | Gemini | Real-time prices, analyst ratings, earnings, macro data |
| `local-inference` | Ollama | Portfolio text extraction, message formatting |
| `notifications` | Any chat/email MCP | Progress updates and final report delivery |

## Adding a Connector

1. Install and configure the MCP server (see per-provider CONNECTOR.md)
2. Add the server to your Claude Code settings (`~/.claude.json` or `.claude/settings.json`)
3. Set any required environment variables
4. Verify the alias is wired correctly in `.mcp.json`

## Notification Provider

The `notifications` connector is provider-agnostic. Set `NOTIFICATION_MCP_TOOL` to the tool name of your chosen provider:

| Provider | Value |
|----------|-------|
| Slack | `mcp__slack__slack_post_message` |
| Telegram | `mcp__telegram__send_message` |
| Email (Gmail) | `mcp__gmail__send_email` |

See each provider's CONNECTOR.md for setup details. The Slack connector is the reference example.

## Example: Full Setup

See `.mcp.json.example` for a concrete wiring of all three connectors with Slack as the notification provider.
