# Schedule

Periodic tasks and maintenance cadence.

---

## Daily

- GitHub rate limit check: `agent rate`
- Health check: `agent health`

## Weekly

- Update check: `agent update`
- Full sync: `agent sync`

## Monthly

- Brain cleanup: `agent prune`
- Dependency audit: Check for updates
- CHANGELOG review

## Per Release

- Run: `agent test`
- Update CHANGELOG.md
- Tag: `agent bump`
- Docker build triggers on tag

---

## Cron Syntax

```bash
# Daily health check (every day at 9am)
0 9 * * * agent health

# Weekly update (every Sunday at midnight)
0 0 * * 0 agent update
```

---

## Scheduled Commands

| Command | Frequency | Purpose |
|--------|-----------|---------|
| agent health | Daily | Monitor system |
| agent rate | Daily | Check limits |
| agent update | Weekly | Stay current |
| agent sync | Weekly | Get latest brain |
| agent prune | Monthly | Clean stale states |
| agent components | As needed | Lazy-load brain |
| agent resolution | As needed | Track thoughts |