# Cookbook: Catalyst Calendar

Scans all holdings and watchlist stocks for upcoming binary events over the next 4 weeks.

## Invocation

```
/catalyst-calendar

Holdings: AAPL, MSFT, NVDA
Watchlist: META, AMZN
```

Or provide a full portfolio JSON.

## Output

- Structured event list sorted by date (earnings, FDA, FOMC, product launches)
- HIGH / MEDIUM / LOW risk tiers per event
- High-risk window identification (2+ HIGH events within 5 days)
- Portfolio-level positioning recommendation

Also integrates into `/analyze` Phase 0 — the catalyst JSON is passed to `portfolio-manager` for proactive binary event handling.

## Skill Reference

- `skills/catalyst-calendar/SKILL.md`
