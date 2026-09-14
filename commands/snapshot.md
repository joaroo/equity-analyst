---
name: snapshot
description: Fetch current market conditions only. Returns regime classification (RISK-ON / TRANSITIONAL / RISK-OFF) and macro context as compact JSON. No portfolio data needed.
---

Invoke the `equity-analyst:market-snapshot` agent to fetch the market snapshot, and return its JSON exactly as it returns it — no preamble, no prose, no reformatting.

The agent runs on a smaller model and follows `skills/market-snapshot/SKILL.md`: `quotes` for index levels and VIX, `indicators` for moving averages, `history` for sector ETF returns, and `rates` for Riksbank, ECB and Fed policy rates and stance from official data.

If the agent cannot be invoked in this client, follow the `equity-analyst:market-snapshot` skill yourself and return only its JSON.
