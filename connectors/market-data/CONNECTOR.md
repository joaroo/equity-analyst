# Connector: market-data MCP — `quotes`, `history`, `indicators`, `fx`

**Aliases:** `quotes`, `history`, `indicators`, `fx`
**Server:** [`servers/market-data/`](../../servers/market-data/README.md) (self-hosted, Streamable HTTP)

Structured numbers for the analysis skills: current prices, OHLCV bars, computed technical indicators, and ECB exchange rates. Sources are Yahoo Finance's chart API and Frankfurter (ECB). There are no fundamentals — those come from `research` (web search).

## Tools

| Alias | Tool | Returns |
|-------|------|---------|
| `quotes` | `market_quote` | Price, prior close, day change, exchange and timestamp for up to 20 symbols. Reports an MCP error only when every symbol fails. |
| `history` | `market_history` | Up to 400 most recent OHLCV bars for one symbol, plus the period return. `range`: 1d–max; `interval`: 1m–1mo. |
| `indicators` | `market_indicators` | From ~2 years of daily bars, for up to 10 symbols: SMA 20/50/200 with price distance and ordering, RSI(14, Wilder), MACD(12,26,9) with any crossover in the last 5 bars, 52-week and 20-day high/low, last volume vs 20-day average, 20-day up/down volume ratio. |
| `fx` | `fx_rate` | ECB reference rates, latest or for a `date` (YYYY-MM-DD). |

## Symbols

Exchange suffixes, not country codes: Stockholm `VOLV-B.ST`, Helsinki `NOKIA.HE`, Copenhagen `.CO`, Oslo `.OL`, Xetra `.DE`, London `.L`. US tickers take none. Indices use a caret: `^GSPC`, `^VIX`, `^OMX`. A 404 usually means the suffix is wrong.

## Setup

1. Deploy the server (see its README) and note the secret URL: `https://<host>/<MCP_PATH_SECRET>/mcp`.
2. Add it as a connector:
   - **claude.ai / Cowork:** Settings → Connectors → Add custom connector, paste the URL, no OAuth.
   - **Claude Code:** `claude mcp add --transport http --scope local market-data '<secret URL>'`
3. The URL is the credential. Never commit it or paste it into a shared document.

## Limits

Calls are limited per server: 120 upstream fetches/min, 45 s per tool call (partial results after that). Batch symbols into one `market_quote` call rather than calling per ticker.
