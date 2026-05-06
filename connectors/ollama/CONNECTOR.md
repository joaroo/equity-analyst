# Connector: Ollama — `local-inference`

**Alias:** `local-inference`  
**Used by:** `/analyze` Phase 0A (portfolio extraction) and Phase 4 (message formatting)

Runs inference locally via Ollama. Used for two tasks that do not require live web data: parsing free-text portfolio input into structured JSON, and reformatting the final markdown report for delivery via the notification channel. Keeping these tasks local avoids unnecessary API costs and latency.

## Prerequisites

Install Ollama and pull at least one small model:

```bash
# Install Ollama
brew install ollama          # macOS
# or: https://ollama.com/download

# Start the server
ollama serve

# Pull a fast small model (pick one)
ollama pull llama3.2         # 3B — fast, good for extraction
ollama pull gemma3:4b        # 4B — strong instruction following
ollama pull phi4-mini        # 3.8B — Microsoft, good reasoning
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama server URL |

## MCP Server Setup

Add to `~/.claude.json` (global) or `.claude/settings.json` (project):

```json
{
  "mcpServers": {
    "ollama": {
      "command": "npx",
      "args": ["-y", "mcp-server-ollama"],
      "env": {
        "OLLAMA_BASE_URL": "http://localhost:11434"
      }
    }
  }
}
```

> The server must register under the name `ollama` so its tools resolve as `mcp__ollama__*`.

## Tools Exposed

| Tool | Used for |
|------|----------|
| `mcp__ollama__ollama_generate` | Portfolio extraction and message reformatting |
| `mcp__ollama__ollama_list_models` | Model enumeration — called first to select fastest available |

## Model Selection

The `/analyze` orchestrator calls `mcp__ollama__ollama_list_models` at startup and selects the fastest available small model automatically. No manual configuration required.

Models are ranked by speed over capability for these tasks — portfolio extraction and message formatting are straightforward and don't require a large model.

## Connector Alias (.mcp.json)

```json
"local-inference": {
  "primary": "mcp__ollama__ollama_generate",
  "model_list": "mcp__ollama__ollama_list_models",
  "model_selection": "fastest-small",
  "purpose": "Portfolio text extraction and notification message formatting"
}
```

## Verification

With Ollama running, confirm models are available:

```bash
ollama list
```

Then run `/analyze` with a small sample portfolio. The Phase 0A portfolio extraction step will confirm the connector is working.

## Remote Ollama

If Ollama runs on a different machine or in Docker:

```json
{
  "mcpServers": {
    "ollama": {
      "command": "npx",
      "args": ["-y", "mcp-server-ollama"],
      "env": {
        "OLLAMA_BASE_URL": "http://192.168.1.100:11434"
      }
    }
  }
}
```

## Optional: Skip Local Inference

If you prefer not to run Ollama, the portfolio extraction step can be done by Gemini instead. Update `.mcp.json` to point `local-inference` at the `market-data` connector and remove the Ollama server from settings. The only trade-off is marginally higher Gemini API usage.
