# equity-analyst for OpenCode

This branch adds a prototype OpenCode plugin wrapper around the existing `equity-analyst` skills and commands.

## What changes

- Existing `skills/*/SKILL.md` files remain the source of truth.
- Each skill is registered as a configurable OpenCode agent.
- Model/provider assignment is controlled from `~/.config/opencode/equity-analyst.jsonc` or `.opencode/equity-analyst.jsonc`.
- Gemini, Ollama, OpenAI, Anthropic, etc. are normal OpenCode providers, not MCP connectors.
- MCP is only used for optional external tools such as notifications.
- Commands `/analyze`, `/snapshot`, `/valuation`, `/earnings-preview`, `/earnings-review`, `/catalyst-calendar`, and `/index-funds` are registered through the OpenCode plugin config hook.

## Try locally

```bash
bun install
bun run build
```

Add the local plugin to OpenCode config while testing:

```jsonc
{
  "plugin": ["file:///Users/joaroo/Projects/llm-stock-analysis"]
}
```

Or, after publishing/installing as a package:

```bash
bunx equity-analyst-opencode install
```

## Config example

Create `~/.config/opencode/equity-analyst.jsonc`:

```jsonc
{
  "$schema": "https://unpkg.com/equity-analyst-opencode@latest/equity-analyst.schema.json",
  "preset": "balanced",
  "agents": {
    "marketSnapshot": {
      "model": "google/gemini-3-flash-preview"
    },
    "fundamentalAnalyst": {
      "model": "anthropic/claude-sonnet-4.5",
      "variant": "high"
    },
    "technicalAnalyst": {
      "model": "openai/gpt-5.4-mini"
    },
    "portfolioManager": {
      "model": "openai/gpt-5.5",
      "variant": "high",
      "mcps": ["notifications"]
    },
    "formatter": {
      "model": "ollama/qwen2.5:7b"
    }
  },
  "tools": {
    "notifications": { "mcp": "slack", "tool": "slack_post_message" }
  }
}
```

## Parallel `/analyze` behavior

The registered `/analyze` command tells the orchestrator to delegate work to stable agent ids:

- `equity-portfolio-extractor`
- `equity-market-snapshot`
- `equity-catalyst-calendar`
- `equity-fundamental-analyst`
- `equity-technical-analyst`
- `equity-portfolio-manager`
- `equity-formatter`

Each agent has its own configured model/provider. Parallel calls therefore run as separate OpenCode subagent sessions using their assigned models.

The plugin intentionally uses provider-native model routing for market research and formatting. It does not require Gemini/Ollama MCP servers. If a provider cannot verify current market data, the skill prompts instruct agents to state that instead of fabricating.

## Safety defaults

- Analyst agents: no file write/edit/bash permissions.
- Only `portfolioManager` defaults to the `notifications` connector.
- MCP permissions are generated only for optional tools, e.g. `notifications` -> `slack_slack_post_message`.
