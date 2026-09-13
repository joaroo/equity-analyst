# market-data MCP server

Remote MCP server (Streamable HTTP, stateless) that gives equity-analyst structured
numbers instead of scraped ones:

| Tool | Source | Use |
|------|--------|-----|
| `market_quote` | Yahoo Finance chart API | Current price, prior close, day change — up to 20 symbols per call |
| `market_history` | Yahoo Finance chart API | OHLCV bars (MAs, RSI, MACD, drawdown, period return) |
| `fx_rate` | Frankfurter (ECB) | Currency conversion, latest or point-in-time |

No fundamentals: Yahoo's `quoteSummary` needs a cookie/crumb handshake and is too
fragile. Fundamentals and narrative come from web search.

## Access control

The endpoint is a secret URL: `https://<host>/<MCP_PATH_SECRET>/mcp`. Every other
path returns 404. Claude custom connectors support only no-auth or OAuth, and the
data is public, so the URL itself is the credential. Treat it like a password:

- Keep it only in the deploy platform's env and your Claude connector settings.
- Disable reverse-proxy access logs for this route — they record the full path.
- If it leaks, generate a new secret, redeploy, and update the connector.

## Configuration

| Env var | Default | Notes |
|---------|---------|-------|
| `MCP_PATH_SECRET` | — (required) | ≥32 URL-safe chars: `openssl rand -base64 32 \| tr "+/" "-_" \| tr -d "="` |
| `PORT` | `3000` | |
| `RATE_LIMIT_PER_MINUTE` | `120` | Global inbound MCP requests |
| `MAX_CONCURRENT_REQUESTS` | `16` | In-flight requests; excess get 503 |

Built-in limits:

- **Inbound:** POST only, JSON responses (no SSE), 256 KB body read within 10 s, no
  JSON-RPC batches. Every rejection closes the connection.
- **Deadlines:** each tool call finishes within 45 s, returning partial results; a
  hard 55 s wall-clock cap applies to the whole HTTP request. A client disconnect
  cancels queued and in-flight upstream fetches.
- **Upstream:** 120 fetches/min budget, 6 concurrent, at most 64 queued, 15 s per
  fetch, 5 MB byte cap enforced while streaming.
- **Errors:** `market_quote` returns an MCP error when every symbol fails, and a
  normal result with a failure count when only some fail.

Also set limits outside the app: a container memory limit (~256 MB) plus CPU/PID
limits, and Traefik body-size, rate and in-flight-request middleware on the router.

## Run

```bash
npm install
MCP_PATH_SECRET=... npm start      # Node 24+, runs TypeScript directly
npm run typecheck
```

## Deploy

```bash
docker build -t equity-analyst-market-data .
docker run -e MCP_PATH_SECRET=... -p 3000:3000 --memory=256m equity-analyst-market-data
```

Behind a TLS reverse proxy, set a container memory limit (~256 MB) — the server may
share a host with other services. Health check: `GET /healthz`.
