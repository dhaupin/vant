# Schedule

Periodic tasks and maintenance cadence.

---

## Daily

- GitHub rate limit check: `vant rate`
- Health check: `vant health`

## Weekly

- Update check: `vant update`
- Full sync: `vant sync`

## Monthly

- Brain cleanup: Remove stale branches
- Dependency audit: Check for updates
- CHANGELOG review

## Per Release

- Run: `vant test`
- Update CHANGELOG.md
- Tag: `vant bump`
- Docker build triggers on tag

---

## Cron Syntax

```bash
# Daily health check (every day at 9am)
0 9 * * * vant health

# Weekly update (every Sunday at midnight)
0 0 * * 0 vant update
```

---

## Scheduled Commands

| Command | Frequency | Purpose |
|--------|-----------|---------|
| vant health | Daily | Monitor system |
| vant rate | Daily | Check limits |
| vant update | Weekly | Stay current |
| vant sync pull | Weekly | Get latest brain |
| vant sync push | After changes | Save brain |