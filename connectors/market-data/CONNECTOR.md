# Connector: market-data MCP — `quotes`, `history`, `indicators`, `fx`, `rates`, `regime`

**Aliases:** `quotes`, `history`, `indicators`, `fx`, `rates`, `regime`
**Server:** [`servers/market-data/`](../../servers/market-data/README.md) (self-hosted, Streamable HTTP)

Structured numbers for the analysis skills: current prices, OHLCV bars, computed technical indicators, and ECB exchange rates. Sources are Yahoo Finance's chart API and Frankfurter (ECB). There are no fundamentals — those come from `research` (web search).

## Tools

| Alias | Tool | Returns |
|-------|------|---------|
| `quotes` | `market_quote` | Price, prior close, day change, exchange and timestamp for up to 20 symbols. Reports an MCP error only when every symbol fails. |
| `history` | `market_history` | Up to 400 most recent OHLCV bars for one symbol, plus the period return. `range`: 1d–max; `interval`: 1m–1mo. |
| `indicators` | `market_indicators` | From ~2 years of daily bars, for up to 10 symbols: SMA 20/50/200 with price distance and ordering, RSI(14, Wilder), MACD(12,26,9) with any crossover in the last 5 bars, 52-week and 20-day high/low, last volume vs 20-day average, 20-day up/down volume ratio. |
| `fx` | `fx_rate` | ECB reference rates, latest or for a `date` (YYYY-MM-DD). |
| `rates` | `central_bank_rates` | Riksbank policy rate, ECB key rates and Fed target range from official feeds (Riksbank SWEA API, ECB Data Portal, NY Fed), with the last two changes (effective dates), the next policy decision date from each bank's official calendar, and a stance: a change within 120 days sets Tightening/Easing, otherwise On hold. |
| `regime` | `market_regime` | JSON: RISK-ON / TRANSITIONAL / RISK-OFF from the market-snapshot six-signal matrix computed server-side (index vs 50-day MA, VIX, cyclical vs defensive 5-day sector returns, weighted central-bank stance), every signal with its vote, index distances from the 50/200-day MAs, each bank's next decision date, and `failed_inputs`. Returns an MCP error when fewer than 5 of 6 signals are available. When the server has a TypeSafe key, `jev` adds an advisory Jev opinion with per-regime probabilities and `check.agreement`; it never changes `regime`. |
| `judgments` | `stock_judgments` | JSON, shadow only: per-stock TypeSafe Jev judgments for up to 20 symbols — 20-trading-day direction (up / flat / down at ±2%), trend score (1–5), overextended and, when `eventDaysAway` is given, event risk — with the compact state Jev saw, the reference close and TypeSafe confidence. Read by the local `/council-analyze` orchestrator for calibration logging; never by an analyst, and never used to change a decision. |

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
