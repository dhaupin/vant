-- migrations/0001_status_monitor.sql (vant-home)
-- ==============================================
-- Versioned D1 migration for the /status monitor. This is the canonical
-- schema record; the runtime ALSO self-heals (ensureSchema runs
-- CREATE TABLE IF NOT EXISTS on first read) so a fresh deploy never
-- depends on someone remembering this step. The migration exists so an
-- operator can apply the schema deliberately (wrangler d1 migrations
-- apply vant-pub --remote) and so future schema changes version
-- forward here instead of mutating this file.
--
-- Apply (either path works):-- npx wrangler d1 migrations apply vant-pub --remote
-- ...or just bind the database and click the site: first read creates it.
--
-- Owner law (prd-web.md 3.7): the database is bound as `DB` in the
-- PAGES PROJECT SETTINGS, never in a wrangler file.

CREATE TABLE IF NOT EXISTS status_endpoints (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    url          TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'http',   -- http | json-ok | github-ci
    kind_options TEXT NOT NULL DEFAULT '{}',
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_checks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_id INTEGER NOT NULL,
    day         TEXT NOT NULL,                   -- UTC YYYY-MM-DD
    ts          TEXT NOT NULL,                   -- full ISO timestamp
    ok          INTEGER NOT NULL,
    state       TEXT NOT NULL DEFAULT 'down',    -- up | degraded | down
    latency_ms  INTEGER,
    detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_status_checks_endpoint_ts
    ON status_checks (endpoint_id, ts DESC);

CREATE TABLE IF NOT EXISTS status_daily (
    endpoint_id INTEGER NOT NULL,
    day         TEXT NOT NULL,                   -- UTC YYYY-MM-DD
    up_count    INTEGER NOT NULL DEFAULT 0,
    check_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (endpoint_id, day)
);
CREATE INDEX IF NOT EXISTS idx_status_daily_day
    ON status_daily (day);

CREATE TABLE IF NOT EXISTS status_alerts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message    TEXT NOT NULL,
    level      TEXT NOT NULL DEFAULT 'warn',     -- info | warn | critical
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    cleared_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_status_alerts_active
    ON status_alerts (active, id DESC);

CREATE TABLE IF NOT EXISTS status_meta (
    key   TEXT PRIMARY KEY,                      -- e.g. last_sweep
    value TEXT NOT NULL
);
