---
name: paper-trading
description: Paper-trading ledger rules for equity-analyst — read the paper portfolio from a local ledger file instead of a broker, simulate the portfolio manager's or index-fund advisor's decisions with Montrose fees, and update the ledger, trade log and performance log. Use only when /analyze or /index-funds is run in paper mode; never for real accounts.
---

# Skill: Paper Trading

## Trigger Conditions

- The prompt to `/analyze` or `/index-funds` says **paper mode** (or names a paper ledger)
- Requires `paper-portfolio.json` in the working folder (a Cowork project folder), plus `paper-trades.csv` and `paper-performance.csv` next to it
- Do NOT use with a broker connector's real holdings; in paper mode the `portfolio` connector is ignored
- Only the orchestrator (the main session) reads or writes the ledger. Subagents receive the portfolio JSON built from it and stay read-only

## Files

| File | Content | Written |
|---|---|---|
| `paper-portfolio.json` | Cash (SEK), stock holdings, funds, watchlist, `start_date`, `start_total_value_sek`, `last_run_by_kind`, `benchmarks_at_start`, `realized_pnl_sek`, `fees_paid_sek` | Rewritten after each run |
| `paper-trades.csv` | One row per simulated trade: `date,run,ticker,side,quantity,price,currency,fx_to_sek,gross_sek,fee_sek,net_sek,cash_after_sek,decision,reason` | Appended |
| `paper-performance.csv` | One row per run: `date,run,holdings_value_sek,funds_value_sek,cash_sek,total_value_sek,cost_basis_sek,unrealized_pnl_sek,realized_pnl_sek,fees_paid_sek,return_since_start_pct,omx_since_start_pct,msci_world_sek_since_start_pct` | Appended |

| `regime-calibration.csv` | One row per `/analyze` run, from the market context's `regime_check`: `date,rules_regime,jev_status,jev_regime,p_risk_on,p_transitional,p_risk_off,agreement,omx_close` | Appended |
| `jev-log.jsonl` (optional) | One JSON line per Jev judgment (`kind` regime, stock or gate) with answers, probabilities, confidence, reference close and the state Jev saw, for scoring against later prices | Appended by the local pipeline's logging script only |

`run` is `analyze` or `index-funds`. Never delete or rewrite existing CSV rows. Never edit `jev-log.jsonl` by hand; if the file exists and the pipeline did not provide a logging step, leave it alone. `regime-calibration.csv` records whether Jev's regime probabilities are reliable enough to act on later; `omx_close` (from `quotes`) lets later rows score each call against what the market did next. Create it with its header row if missing.

## Workflow Steps

### Step 1 — Load (replaces broker reads in Phase 0A)

1. Read `paper-portfolio.json`. If it is missing or invalid JSON, stop and report — never create a new ledger silently.
2. **Same-day guard:** if `last_run_by_kind.<kind>` (`analyze` or `index-funds`) is today's date, do the analysis but **execute no trades**, and say so in the report. Re-running must not double-apply trades.
3. Build the portfolio JSON for the pipeline from the ledger: `holdings` (ticker, name, quantity, `cost_basis_base` = `cost_basis_sek`, currency), `watchlist`, `cash_available` = `cash_sek`, `source.holdings` = `"paper ledger"`. For `/analyze`, include funds only as context (they are managed by `/index-funds`).
4. If `benchmarks_at_start` has null values, fill them now: `^OMX` and `XDWD.DE` from `quotes`, and EUR/SEK from `fx` (latest). These are the baseline for performance.

### Step 2 — Execute decisions (after the portfolio manager / index-fund report)

Take the final decisions exactly as reported. Execute in this order: all **sells** (EXIT, TRIM, fund sells), then all **buys** (STRONG BUY, CONDITIONAL BUY, ADD, fund buys) in the order listed in the report.

| Decision | Paper action |
|---|---|
| STRONG BUY / ADD | Buy the reported number of whole shares |
| CONDITIONAL BUY | Buy only the size stated for **now**; a trigger-only or zero-now decision is not executed |
| BINARY EVENT SPECIAL CASE | Execute only the explicit size the report gives for now |
| TRIM | Sell the reported number of shares (never more than held) |
| EXIT | Sell the whole position |
| HOLD / SKIP / KEEP WATCHING | No trade. STOP WATCHING removes the item from `watchlist` |
| Fund rebalancing (`/index-funds`) | Convert the recommended target percentages into SEK amounts on current fund value; sell over-weights first, then buy under-weights |

**Prices:** stocks and ETFs at the current `quotes` price at execution time (record it). Mutual funds without a quote symbol at the NAV the index-fund report cites (with its date); if no NAV was found, do not trade that fund and log why. Convert with `fx` (latest).

**Fees (Montrose Access, from `investor-profile.json` → `paper_trading.fees`):**
- Nordic markets (Stockholm, Oslo, Copenhagen, Helsinki): 0.15% of trade value, min 1 SEK, max 99 SEK
- Other markets: 0.15%, min 1 SEK, no cap
- Currency exchange on non-SEK trades: +0.12% of trade value in SEK
- Funds: no commission

**Cash rules:** a buy that would take cash below zero is reduced to the largest affordable whole number of shares; if that is zero, skip it and log `skipped — insufficient cash`. Sells add net proceeds to cash before buys run.

**Bookkeeping per trade:**
- Buy: quantity += shares; `cost_basis_sek` += net cost (gross + fees); add the holding (with `opened` = today) if new; remove the ticker from `watchlist` if it was there
- Sell: realised P&L = net proceeds − (cost basis × shares sold ÷ quantity held); reduce `cost_basis_sek` proportionally; remove the holding when quantity reaches 0; add to `realized_pnl_sek`
- Add every fee to `fees_paid_sek`
- Append one `paper-trades.csv` row per trade or skipped trade

### Step 3 — Value and record

1. Value all holdings (`quotes` × `fx`) and funds (ETF via `quotes`; mutual funds at `last_nav`, updated when the index-fund report cites a newer dated NAV).
2. Compute `return_since_start_pct` = total value ÷ (seed total value at start) − 1. Store the seed total in the ledger as `start_total_value_sek` on the first run if missing. Benchmark returns: `^OMX` vs its start level; `XDWD.DE` converted to SEK vs its start level in SEK.
3. Append one row to `paper-performance.csv`. For `/analyze`, also append one row to `regime-calibration.csv` (empty fields where Jev is disabled or failed; probabilities as decimals). Skip it if the file already has a row for today, so re-runs do not double-count a day.
4. Set `last_run_by_kind.<kind>` to today's date and write `paper-portfolio.json` with 2-space indentation.

### Step 4 — Report

Add a **Paper Ledger** section at the end of the report:
- Trades executed (and skipped, with reason), fees
- Cash before → after
- Total value, return since start, vs OMX Stockholm 30 and MSCI World (SEK)
- Any ledger warnings (missing NAVs, same-day guard, reduced orders)

## Anti-Patterns

- Never touch a real broker account in paper mode — no broker read or write tools
- Never execute a decision label outside the closed set, or a size not stated in the report
- Never recalculate the portfolio manager's decisions; paper trading executes them as written
- Never overwrite `paper-trades.csv` or `paper-performance.csv` rows
- Never commit ledger files to a repository

## Verification Checklist

- [ ] Same-day guard checked before executing
- [ ] Sells executed before buys; cash never negative
- [ ] Every trade priced from `quotes`/`fx` (or a cited NAV) with fees from the profile
- [ ] One CSV row per executed or skipped trade; one performance row per run; one `regime-calibration.csv` row per `/analyze` run
- [ ] `paper-portfolio.json` written and valid JSON; `last_run_by_kind` updated
- [ ] Paper Ledger section present in the report
