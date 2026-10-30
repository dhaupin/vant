/**
 * web/home/functions/_lib/status.js
 * =================================
 * The runtime half of the status monitor (pure math lives in
 * _lib/status-math.js). Everything the Pages Functions need:
 *
 *   ensureSchema  - CREATE TABLE IF NOT EXISTS x4 + meta, so the owner's
 *                   setup is "bind D1 as DB in Pages settings", nothing else
 *   seedDefaults  - the six owner-named endpoints on first boot
 *   runSweep      - probe every endpoint ONCE, record check + daily rollup
 *   getSummary    - everything the board renders, assembled in one read
 *
 * HARD LAWS:
 *   - bindings arrive from context.env at REQUEST time (Pages settings;
 *     this repo ships no wrangler file - prd-web.md 3.7, owner law)
 *   - the sweep is THROTTLED (status_meta.last_sweep + STATUS_SWEEP_SECONDS
 *     env, default 600s) so a public GET can never be turned into a
 *     hammer; the scheduled handler and the admin check.run door skip the
 *     throttle on purpose
 *   - days with no samples stay "no data" (pct null), never down
 */

import {
    MONITOR_DEFAULTS, ALERT_LEVELS,
    utcDay, dayBuckets, uptimePct, overallStatus, pickAlert,
} from './status-math.js'

const SWEEP_STALE_SECONDS_DEFAULT = 600
const PROBE_TIMEOUT_MS = 10000
const HISTORY_DAYS = 35
const MONITOR_SELF_STALE_SECONDS = 6 * 3600

function json(status, payload) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
            'cache-control': 'no-store',
        },
    })
}

function hijack(signalController) {
    return () => signalController.abort('status probe timeout')
}

/** One HTTP check of a configured endpoint. Never throws. */
async function probeEndpoint(endpoint) {
    const started = Date.now()
    const controller = new AbortController()
    setTimeout(hijack(controller), PROBE_TIMEOUT_MS)
    let ok = false
    let state = 'down'
    let detail = ''
    try {
        const headers = {}
        const kind = endpoint.kind || 'http'
        const url = endpoint.url
        let options = {}
        try { options = JSON.parse(endpoint.kind_options || '{}') || {} } catch (e) { options = {} }

        if (kind === 'github-ci') {
            headers.accept = 'application/vnd.github+json'
        }
        const res = await fetch(url, { method: 'GET', redirect: 'follow', headers, signal: controller.signal })
        const latency = Date.now() - started
        const bodyText = await res.text()
        if (kind === 'json-ok') {
            let parsed = null
            try { parsed = JSON.parse(bodyText) } catch (e) { parsed = null }
            ok = res.ok && parsed !== null && typeof parsed === 'object' && !parsed.error
            state = ok ? 'up' : 'down'
            if (!ok) detail = res.ok ? 'json parse failed or error key present' : 'http ' + res.status
        } else if (kind === 'github-ci') {
            let runs = null
            try { runs = JSON.parse(bodyText) } catch (e) { runs = null }
            const list = runs && Array.isArray(runs.workflow_runs) ? runs.workflow_runs : []
            const latest = list.find((r) => r && r.status === 'completed') || null
            const maxStaleHours = Number(options.maxStaleHours) > 0 ? Number(options.maxStaleHours) : 26
            if (!res.ok) {
                state = 'down'
                detail = 'http ' + res.status
            } else if (!latest) {
                state = 'degraded'
                detail = 'no completed runs visible'
            } else {
                const ageHours = (Date.now() - Date.parse(latest.run_started_at || latest.updated_at || '')) / 3600000
                const stale = !(ageHours >= 0 && ageHours <= maxStaleHours)
                ok = latest.conclusion === 'success' && !stale
                state = ok ? 'up' : (latest.conclusion === 'success' ? 'degraded' : 'down')
                detail = 'run ' + (latest.conclusion || 'unknown') + ', ' + (Number.isFinite(ageHours) ? ageHours.toFixed(1) : '?') + 'h old' + (stale ? ' (stale window ' + maxStaleHours + 'h)' : '')
            }
        } else {
            ok = res.ok
            state = ok ? 'up' : 'down'
            if (!ok) detail = 'http ' + res.status
        }
        return {
            ok: !!ok,
            state,
            detail: String(detail + (ok ? ' ' + latency + 'ms' : '')).slice(0, 160),
            latencyMs: latency,
        }
    } catch (e) {
        const latency = Date.now() - started
        return {
            ok: false,
            state: 'down',
            detail: String((e && (e.reason || e.message)) || 'fetch failed').slice(0, 160),
            latencyMs: latency,
        }
    }
}

/* ============================== SCHEMA ============================== */

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS status_endpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'http',
        kind_options TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS status_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        ts TEXT NOT NULL,
        ok INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'down',
        latency_ms INTEGER,
        detail TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS status_daily (
        endpoint_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        up_count INTEGER NOT NULL DEFAULT 0,
        check_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (endpoint_id, day)
    )`,
    `CREATE TABLE IF NOT EXISTS status_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'warn',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        cleared_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS status_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`,
]

async function ensureSchema(db) {
    await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)))
}

/* ============================== ENDPOINTS ============================== */

async function seedDefaults(db) {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM status_endpoints').first()
    if (row && Number(row.n) > 0) return
    const inserts = MONITOR_DEFAULTS.map((e) => db.prepare(
        'INSERT OR IGNORE INTO status_endpoints (name, url, kind, kind_options, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(e.name, e.url, e.kind, JSON.stringify(e.options || {}), new Date().toISOString()))
    await db.batch(inserts)
}

async function getEndpoints(db) {
    const res = await db.prepare('SELECT * FROM status_endpoints ORDER BY id').all()
    return res.results || []
}

/**
 * Add an endpoint (admin door only). The cap (default 24, tunable with
 * STATUS_MAX_ENDPOINTS in the Pages settings, plain Text) is a COST WALL:
 * every cold public GET sweeps every endpoint, so an unlimited table turns
 * one compromised admin key into an unbounded edge-egress hammer.
 */
async function addEndpoint(db, spec, maxEndpoints = 24) {
    let cap = 0
    if (Number(maxEndpoints) > 0) cap = Number(maxEndpoints)
    if (cap > 0) {
        const row = await db.prepare('SELECT COUNT(*) AS n FROM status_endpoints').first()
        if (row && Number(row.n) >= cap) return { added: false, capped: cap }
    }
    const res = await db.prepare(
        'INSERT OR IGNORE INTO status_endpoints (name, url, kind, kind_options, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(spec.name, spec.url, spec.kind, JSON.stringify(spec.options || {}), new Date().toISOString()).run()
    return { added: res.meta && res.meta.changes > 0 }
}

async function removeEndpoint(db, idOrName) {
    const byId = /^\d+$/.test(String(idOrName))
    const stmt = byId
        ? db.prepare('DELETE FROM status_endpoints WHERE id = ?').bind(Number(idOrName))
        : db.prepare('DELETE FROM status_endpoints WHERE name = ?').bind(String(idOrName))
    const res = await stmt.run()
    return { removed: res.meta && res.meta.changes > 0 }
}

/* ============================== SWEEP ============================== */

async function recordCheck(db, endpoint, result) {
    const now = new Date()
    const day = utcDay(now)
    const ts = now.toISOString()
    await db.prepare(
        'INSERT INTO status_checks (endpoint_id, day, ts, ok, state, latency_ms, detail) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(endpoint.id, day, ts, result.ok ? 1 : 0, result.state, result.latencyMs, result.detail).run()
    await db.prepare(
        `INSERT INTO status_daily (endpoint_id, day, up_count, check_count)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint_id, day) DO UPDATE SET
            up_count = up_count + excluded.up_count,
            check_count = check_count + excluded.check_count`
    ).bind(endpoint.id, day, result.ok ? 1 : 0, 1).run()
}

/** Throttle read/write through status_meta (protected by the caller's gate). */
async function getMeta(db, key) {
    const row = await db.prepare('SELECT value FROM status_meta WHERE key = ?').bind(key).first()
    return row ? row.value : null
}

async function setMeta(db, key, value) {
    await db.prepare(
        'INSERT INTO status_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).bind(key, String(value)).run()
}

/**
 * Probe every endpoint once and record the results.
 * `force` bypasses the throttle (scheduled handlers, admin check.run).
 */
async function runSweep(db, { force = false } = {}) {
    const last = await getMeta(db, 'last_sweep')
    const lastAt = last ? Date.parse(last) : 0
    if (!force && Number.isFinite(lastAt)) {
        return { skipped: true, lastSweep: last }
    }
    const endpoints = await getEndpoints(db)
    const results = await Promise.all(endpoints.map(async (endpoint) => {
        const result = await probeEndpoint(endpoint)
        await recordCheck(db, endpoint, result)
        return { id: endpoint.id, name: endpoint.name, ...result }
    }))
    await setMeta(db, 'last_sweep', new Date().toISOString())
    return { skipped: false, results }
}

/* ============================== ALERTS ============================== */

async function getActiveAlert(db) {
    const res = await db.prepare(
        'SELECT * FROM status_alerts WHERE active = 1 ORDER BY id DESC LIMIT 10'
    ).all()
    return pickAlert(res.results || [])
}

async function setAlert(db, { message, level }) {
    const lvl = ALERT_LEVELS[level] ? level : 'warn'
    const text = String(message || '').trim().slice(0, 500)
    if (!text) throw new Error('alert.message required (max 500 chars)')
    // One live banner at a time: retire the old actives, then open the new one.
    await db.prepare('UPDATE status_alerts SET active = 0, cleared_at = ? WHERE active = 1')
        .bind(new Date().toISOString()).run()
    await db.prepare(
        'INSERT INTO status_alerts (message, level, active, created_at) VALUES (?, ?, 1, ?)'
    ).bind(text, lvl, new Date().toISOString()).run()
    return { alert: await getActiveAlert(db) }
}

async function clearAlert(db) {
    const res = await db.prepare('UPDATE status_alerts SET active = 0, cleared_at = ? WHERE active = 1')
        .bind(new Date().toISOString()).run()
    return { cleared: res.meta && res.meta.changes > 0 }
}

/* ============================== SUMMARY ============================== */

/**
 * Run a sweep only when the throttle says the data is cold.
 */
async function maybeSweep(env, db) {
    const stale = Number(env.STATUS_SWEEP_SECONDS || '') || SWEEP_STALE_SECONDS_DEFAULT
    const last = await getMeta(db, 'last_sweep')
    const lastAt = last ? Date.parse(last) : 0
    const fresh = Number.isFinite(lastAt) && (Date.now() - lastAt) / 1000 < stale
    if (fresh) return { ran: false }
    return { ran: true, ...(await runSweep(db, { force: true })) }
}

/**
 * Everything the board renders in one read: overall state, per-endpoint
 * freshest state + 35-day buckets + 30d uptime percent, the headline alert,
 * and the monitor's own freshness (a monitor that stops monitoring is its
 * own worst outage - so it shows up as a row too).
 */
async function getSummary(db) {
    const endpoints = await getEndpoints(db)
    const sinceDay = utcDay(new Date(Date.now() - (HISTORY_DAYS + 2) * 86400000))
    const daily = await db.prepare(
        'SELECT endpoint_id, day, up_count, check_count FROM status_daily WHERE day >= ? ORDER BY day'
    ).bind(sinceDay).all()
    const buckets = dayBuckets(daily.results || [], HISTORY_DAYS)
    const checks = await db.prepare(
        'SELECT endpoint_id, ts, ok, state, latency_ms, detail FROM status_checks ORDER BY id DESC LIMIT 300'
    ).all()
    const freshest = new Map()
    for (const c of checks.results || []) {
        if (!freshest.has(c.endpoint_id)) freshest.set(c.endpoint_id, c)
    }
    const rows = endpoints.map((e) => {
        const fresh = freshest.get(e.id) || null
        const hist = buckets.get(e.id) || []
        return {
            id: e.id,
            name: e.name,
            url: e.url,
            kind: e.kind,
            state: fresh ? (fresh.state === 1 || fresh.state === 'up' ? 'up' : fresh.state) : 'unknown',
            latencyMs: fresh ? fresh.latency_ms : null,
            lastCheck: fresh ? fresh.ts : null,
            detail: fresh ? fresh.detail : null,
            uptime30: uptimePct(hist, 30),
            history: hist,
        }
    })
    const lastSweep = await getMeta(db, 'last_sweep')
    const sweepAgeSec = lastSweep ? Math.round((Date.now() - Date.parse(lastSweep)) / 1000) : null
    const selfState = sweepAgeSec !== null && sweepAgeSec < MONITOR_SELF_STALE_SECONDS ? 'up' : 'degraded'
    return {
        generatedAt: new Date().toISOString(),
        overall: overallStatus(rows.map((r) => r.state)),
        monitor: { name: 'Status monitor (self)', lastSweep, sweepAgeSec, state: sweepAgeSec === null ? 'unknown' : selfState },
        alert: await getActiveAlert(db),
        endpoints: rows,
    }
}

export {
    json, ensureSchema, seedDefaults,
    getEndpoints, addEndpoint, removeEndpoint,
    runSweep, maybeSweep, getSummary,
    getActiveAlert, setAlert, clearAlert,
}
