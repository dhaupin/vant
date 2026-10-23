# vant-home Pages Functions — setup & bindings

Everything the API routes under `functions/` need is configured in the
**Cloudflare Pages project settings** — never in a wrangler file (owner
law, prd-web.md 3.7: bindings arrive from `context.env` at request time;
this repo ships no wrangler config).

## The one-time checklist

### 1. D1 database (the history store)

1. Cloudflare dashboard → **Workers & Pages → D1 → Create database**.
   Name it **`vant-pub`** (this is the site's public-surface database —
   the status monitor today, other public data later). Closest region
   is fine.
2. Open the **vant-home Pages project → Settings → Bindings → Add →
   D1 database bindings**.
3. Variable name: **`DB`**. Database: **`vant-pub`**. Save.

That is the whole wiring. Tables create themselves on first read
(`ensureSchema`); the six owner-named endpoints seed themselves on first
boot (`seedDefaults`). To apply the schema deliberately instead, the
versioned migration lives at `../migrations/0001_status_monitor.sql`:

```bash
npx wrangler d1 migrations apply vant-pub --remote
```

Both paths end at the same schema; neither is required for the other.

### 2. `STATUS_ADMIN_KEY` (the operator door)

**Settings → Environment variables** (both production and preview):
name **`STATUS_ADMIN_KEY`**, value a random secret ≥ 8 chars
(`openssl rand -hex 24` is a good source). It is the only thing guarding
POST `/api/status/admin` (alert set/clear, endpoints add/remove/reset,
forced sweeps) — treat it like a password.

### 3. `STATUS_SWEEP_SECONDS` (optional)

Env var, default `600`: how stale a sweep may be before a public GET of
`/api/status/summary` triggers a fresh one. Public GETs can never hammer
the monitors — the throttle is the guarantee.

### 4. Cron trigger (optional, keeps history honest)

**Settings → Functions → Cron triggers**: e.g. `*/30 * * * *`.The scheduled handler (`functions/api/status/scheduled.js`, `onScheduled`)
runs the same probe sweep with the throttle skipped, so quiet days still
get samples. No trigger configured? Nothing breaks: every summary
visitor drives the throttled sweep, and days with no samples render as
"no data" — never as downtime.

**Why no migration sets this for you:** a D1 migration only moves
DATABASE schema — a Pages cron trigger is a PROJECT setting (it lives
next to the build config, not in any database), so there is no SQL
migration that can create it. Under this repo's no-wrangler-strings law
the two supported paths are: the dashboard step above, or (automation
you own) the Pages REST API — a `PATCH /accounts/{account_id}/pages/
projects/{project_name}` call with Pages Write scope, the same endpoint
canonical for project config updates — the panel path is the
checklist default.

## Route map

| Route | Auth | What it does |
|---|---|---|
| `GET /api/status/summary` | public | whole board in one read: overall state, per-endpoint freshest check + 35-day buckets + 30d uptime, active maintenance alert, monitor self-freshness. Throttled sweep on cold data. |
| `POST /api/status/admin` | `x-admin-key` | `alert.set` / `alert.clear` / `endpoint.add` / `endpoint.remove` / `endpoint.reset` / `check.run` |
| `onScheduled` | cron | forced sweep, same `_lib/status.js` |

## Honest postures (on purpose)

- **No `DB` binding**: every route answers `503` with the exact fix; the
  board on `/status` falls back to direct browser checks and says it is
  the fallback. Missing data is never faked as downtime.
- **No/short `STATUS_ADMIN_KEY`**: the admin door stays closed (`503`),
  and the operator panel explains itself.
- Schema statements are `CREATE TABLE IF NOT EXISTS`; adding a column
  later is a new `migrations/000N_*.sql` file, not an edit to 0001.
