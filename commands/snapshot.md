---
name: snapshot
description: Fetch current market conditions only. Returns regime classification (RISK-ON / TRANSITIONAL / RISK-OFF) and macro context as compact JSON. No portfolio data needed.
---

Invoke the `equity-analyst:market-snapshot` agent to fetch the market snapshot, and return its JSON exactly as it returns it — no preamble, no prose, no reformatting.

The agent runs on a smaller model and follows `skills/market-snapshot/SKILL.md`: `regime` for the classification and every signal behind it (computed server-side, with an advisory Jev opinion) and `quotes` for index levels and VIX. If `regime` is unavailable it falls back to `indicators`, `history` and `rates` and applies the signal matrix itself.

If the agent cannot be invoked in this client, follow the `equity-analyst:market-snapshot` skill yourself and return only its JSON.
