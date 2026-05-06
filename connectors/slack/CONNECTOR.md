# Connector: Slack — `notifications`

**Alias:** `notifications`  
**Role:** Delivers progress updates and the final analysis report to a Slack channel.

This is the reference implementation of the `notifications` connector. Any MCP server that sends messages can serve this role — see `connectors/README.md` for alternatives (Telegram, Gmail). Slack is recommended for rich text formatting.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Bot OAuth token — starts with `xoxb-` |
| `SLACK_TEAM_ID` | Yes | Workspace ID — found in your Slack workspace URL |
| `NOTIFICATION_MCP_TOOL` | Yes | Set to `mcp__slack__slack_post_message` |
| `SLACK_CHANNEL_ID` | Recommended | Default channel for report delivery |

## Slack App Setup

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**
2. Name it `Stock Analysis` and select your workspace
3. Under **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**, add:
   - `chat:write` — post messages
   - `chat:write.public` — post to channels without joining
4. Click **Install to Workspace** and copy the **Bot OAuth Token** (`xoxb-...`)
5. Find your **Team ID** in **Settings → About this workspace** or your workspace URL
6. Invite the bot to your target channel: `/invite @Stock Analysis`

## MCP Server Setup

Add to `~/.claude.json` (global) or `.claude/settings.json` (project):

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
        "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"
      }
    }
  }
}
```

> The server must register under the name `slack` so its tools resolve as `mcp__slack__*`.

## Tools Exposed

| Tool | Description |
|------|-------------|
| `mcp__slack__slack_post_message` | Post a message to a channel |
| `mcp__slack__slack_reply_to_thread` | Reply in a thread |
| `mcp__slack__slack_get_channels` | List channels (used to resolve channel names to IDs) |

## Wiring to Plugin

Set `NOTIFICATION_MCP_TOOL` in your environment:

```bash
export NOTIFICATION_MCP_TOOL=mcp__slack__slack_post_message
```

Or add to your shell profile / `.env`:

```
NOTIFICATION_MCP_TOOL=mcp__slack__slack_post_message
SLACK_BOT_TOKEN=xoxb-...
SLACK_TEAM_ID=T...
SLACK_CHANNEL_ID=C...
```

The `/analyze` pipeline uses `${NOTIFICATION_MCP_TOOL}` for all four notification calls:
1. Phase 0 complete → "Running fundamental analysis..."
2. Phase 1 complete → "Running technical analysis..."
3. Phase 2 complete → "Portfolio manager deciding..."
4. Phase 3 complete → final formatted report

## Message Format

The Phase 4 formatter converts the markdown report to Slack-compatible mrkdwn:

| Markdown | Slack mrkdwn |
|----------|-------------|
| `## Heading` | `*HEADING*` |
| `**bold**` | `*bold*` |
| `\| table \|` rows | bullet list |
| `---` | blank line |

Emoji (✅ ⚠️ ❌ 🚨) pass through unchanged.

## Verification

After setup, test the connector directly:

```
Send a test message via mcp__slack__slack_post_message to confirm the bot token and channel ID are correct before running /analyze.
```

Then run `/analyze` with a small portfolio and confirm you receive the four progress notifications in your Slack channel.
