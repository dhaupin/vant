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

**Settings → Variables and Secrets** (both production and preview),
added as type **Secret** (encrypted, write-once: the panel never shows
the value again): name **`STATUS_ADMIN_KEY`**, value a random secret
≥ 8 chars (`openssl rand -hex 24` is a good source). It is the only
thing guarding POST `/api/status/admin` (alert set/clear,
endpoints add/remove/reset, forced sweeps) — treat it like a password.

### 3. `STATUS_SWEEP_SECONDS` (optional)

A plain **Text** var, not a secret (it only tunes public-surface
behavior), default `600`: how stale a sweep may be before a public GET
of `/api/status/summary` triggers a fresh one. Public GETs can never
hammer the monitors — the throttle is the guarantee.

### 4. Sweep cadence (the honest truth: Pages has NO cron triggers)

There is no "Functions → Cron triggers" section in the Pages dashboard
because Cloudflare ships cron triggers on WORKERS projects, not Pages
projects — their own Pages→Workers migration guide lists Cron Triggers
under the features Workers has "and Pages does not" (verified against
developers.cloudflare.com, October 2026). Nothing is misconfigured on
your project; the section simply does not exist.

Consequences, all by design:

- The scheduled handler (`functions/api/status/scheduled.js`,
  `onScheduled`) stays in the tree, harmless: it fires if this project
  is ever moved to Workers (where cron triggers exist and the handler
  finds the same `DB` binding).
- History does not depend on a schedule: every public GET of
  `/api/status/summary` runs the throttled sweep whenever the data is
  cold (`STATUS_SWEEP_SECONDS`, default 600s), and days with no samples
  render as "no data" — never as downtime.
- Want a fixed cadence anyway? Point ANY external scheduler (uptime
  pinger, a one-file Worker with a cron trigger, a GitHub Actions
  schedule) at `GET https://<your-project>.pages.dev/api/status/summary`
  every 10+ minutes: each call refreshes the cold data through the same
  throttle path. Ready-to-paste GitHub Actions recipe (anonymous GET,
  no secrets to configure):

    ```yaml
    name: status sweep ping
    on:
      schedule:
        - cron: '*/15 * * * *'
    jobs:
      ping:
        runs-on: ubuntu-latest
        steps:
          - run: curl -fsS https://<your-project>.pages.dev/api/status/summary > /dev/null
    ```

## Route map

| Route | Auth | What it does |
|---|---|---|
| `GET /api/status/summary` | public | whole board in one read: overall state, per-endpoint freshest check + 35-day buckets + 30d uptime, active maintenance alert, monitor self-freshness. Throttled sweep on cold data. |
| `POST /api/status/admin` | `x-admin-key` | `alert.set` / `alert.clear` / `endpoint.add` / `endpoint.remove` / `endpoint.reset` / `check.run` |
| `onScheduled` | cron | forced sweep, same `_lib/status.js` |

## Honest postures (on purpose)

- **No `DB` binding**: every route answers `503` with the exact fix, and
  the site shows NO status surface at all (the build gates the page, menu,
  and walk on `VITE_STATUS_LIVE=1` which is set only after the bindings
  are live). Missing data is never faked as downtime.

The type split, so the panel question has one answer: `STATUS_ADMIN_KEY`
is the only **Secret** in this checklist; `STATUS_SWEEP_SECONDS` and the
`VITE_STATUS_LIVE` build variable are plain **Text** (safe to inspect).
One hard trap: Vite inlines every `VITE_*` build variable into the
shipped JavaScript bundle every visitor downloads, so a `VITE_` name
must never carry a private value in this or any other repo project.
- **No/short `STATUS_ADMIN_KEY`**: the admin door stays closed (`503`),
  and the operator panel explains itself.

The type split, so the panel question always has one answer:
`STATUS_ADMIN_KEY` is the only **Secret** in this checklist;
`STATUS_SWEEP_SECONDS` and the `VITE_STATUS_LIVE` build variable are
plain **Text** (safe to inspect). One hard trap: Vite inlines every
`VITE_*` build variable into the shipped JavaScript bundle every
visitor downloads, so a `VITE_` name must never carry a private value
in this or any other repo project.
- Schema statements are `CREATE TABLE IF NOT EXISTS`; adding a column
  later is a new `migrations/000N_*.sql` file, not an edit to 0001.
