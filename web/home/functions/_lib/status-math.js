/**
 * web/home/functions/_lib/status-math.js
 * ======================================
 * The PURE core of the status monitor: the endpoint defaults, the history
 * bucketing, the uptime math, and the state/alert aggregation. No runtime
 * objects here - no `env`, no `fetch`, no D1 - so the vitest suite imports
 * it directly and everything below is a truth the tests pin.
 *
 * The monitoring model:
 *   - each probe result lands as `up | degraded | down` (never silent),
 *   - daily samples roll up into status_daily (up_count / check_count per
 *     UTC day), and the drawn history is the last N days of buckets,
 *   - days with no samples render as "no data" (hollow), never as down,
 *     so a quiet week stays honest instead of inventing outages.
 */

/** The owner-named defaults (status page, pass 355). Kinds:
 *   http       - network response must be ok (2xx)
 *   json-ok    - response must be 2xx AND parse as JSON without an `error` key
 *   github-ci  - the repo's latest completed Actions run must be a success
 *                (and no older than options.maxStaleHours, else degraded) */
export const MONITOR_DEFAULTS = [
    { name: 'Vant Home', url: 'https://vant.creadev.org/', kind: 'http', options: {} },
    { name: 'Vant Brain', url: 'https://brain.creadev.org/', kind: 'http', options: {} },
    { name: 'Vant Relay', url: 'https://brain.creadev.org/api/r/capabilities', kind: 'json-ok', options: {} },
    { name: 'Vant Docs', url: 'https://docs.creadev.org/vant/', kind: 'http', options: {} },
    { name: 'Axolotl (headless / MCP)', url: 'https://brain.creadev.org/api/mcp/tools', kind: 'json-ok', options: {} },
    {
        name: 'GitHub CI (passing tests)',
        url: 'https://api.github.com/repos/dhaupin/vant/actions/runs?per_page=5',
        kind: 'github-ci',
        options: { maxStaleHours: 26 },
    },
]

export const ENDPOINT_KINDS = ['http', 'json-ok', 'github-ci']

/** Alert levels, ranked so "worst wins" when several are somehow active. */
export const ALERT_LEVELS = { info: 1, warn: 2, critical: 3 }

const STATE_RANK = { up: 0, degraded: 1, down: 2 }

/** Emit UTC YYYY-MM-DD for a Date (or "now"). */
export function utcDay(date) {
    const d = date || new Date()
    return d.toISOString().slice(0, 10)
}

/** The trailing N UTC days, oldest first, today last. */
export function trailingDays(n, today) {
    const out = []
    const base = today ? new Date(today + 'T00:00:00Z') : new Date()
    if (Number.isNaN(base.getTime())) return out
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base.getTime() - i * 86400000)
        out.push(utcDay(d))
    }
    return out
}

/**
 * Turn sparse per-endpoint daily rows into fixed-slot history buckets.
 * rows: [{ endpoint_id, day, up_count, check_count }]
 * returns: Map endpoint_id -> [{ day, up, total, pct|null }]
 * pct is null when the day has no samples: an honest "no data", never a
 * fabricated outage, and never a fabricated uptime either.
 */
export function dayBuckets(rows, days = 35, today) {
    const dates = trailingDays(days, today)
    const byEndpoint = new Map()
    if (Array.isArray(rows)) {
        for (const r of rows) {
            if (!r || r.endpoint_id === undefined || r.endpoint_id === null) continue
            if (!byEndpoint.has(r.endpoint_id)) byEndpoint.set(r.endpoint_id, new Map())
            const dayMap = byEndpoint.get(r.endpoint_id)
            const slot = dayMap.get(String(r.day)) || { up: 0, total: 0 }
            slot.up += Number(r.up_count) || 0
            slot.total += Number(r.check_count) || 0
            dayMap.set(String(r.day), slot)
        }
    }
    const out = new Map()
    for (const [id, dayMap] of byEndpoint) {
        out.set(id, dates.map((day) => {
            const hit = dayMap.get(day)
            return hit && hit.total > 0
                ? { day, up: hit.up, total: hit.total, pct: Math.round((100 * hit.up) / hit.total) }
                : { day, up: 0, total: 0, pct: null }
        }))
    }
    return out
}

/** Uptime percent over the trailing window; null when there is no data. */
export function uptimePct(buckets, windowDays = 30) {
    if (!Array.isArray(buckets) || !buckets.length) return null
    const win = buckets.slice(-windowDays)
    let up = 0
    let total = 0
    for (const b of win) {
        up += b.up
        total += b.total
    }
    if (total === 0) return null
    return Math.round((100 * up) / total)
}

/**
 * Overall status: worst state across endpoints. Endpoints never probed
 * ('unknown') never drag the headline on their own - but when nothing is
 * known, the honest answer is 'unknown'.
 */
export function overallStatus(states) {
    const list = Array.isArray(states) ? states : []
    let worst = 'up'
    let known = false
    for (const s of list) {
        const v = s && s.state ? s.state : 'unknown'
        if (v === 'unknown') continue
        known = true
        if ((STATE_RANK[v] ?? 0) > (STATE_RANK[worst] ?? 0)) worst = v
    }
    return known ? worst : 'unknown'
}

/** Pick the headline alert: active rows only, worst level wins, then newest. */
export function pickAlert(alerts) {
    const list = Array.isArray(alerts) ? alerts : []
    let best = null
    for (const a of list) {
        if (!a || !a.active) continue
        const rankB = ALERT_LEVELS[a.level] ?? 0
        if (!best) best = a
        const rankA = ALERT_LEVELS[best.level] ?? 0
        if (rankB > rankA) best = a
        else if (rankB === rankA && Number(a.id) > Number(best.id)) best = a
    }
    return best
}

/** Validate a monitor kind + spec coming from the admin surface. */
export function validEndpointSpec(spec) {
    if (!spec || typeof spec !== 'object') return { ok: false, reason: 'body required' }
    const name = typeof spec.name === 'string' ? spec.name.trim() : ''
    const url = typeof spec.url === 'string' ? spec.url.trim() : ''
    const kind = typeof spec.kind === 'string' ? spec.kind.trim() : 'http'
    if (!name || name.length > 80) return { ok: false, reason: 'name required (max 80 chars)' }
    if (!/^https:\/\/[^\s]+$/.test(url) || url.length > 300) {
        return { ok: false, reason: 'url must be an https URL (max 300 chars)' }
    }
    if (!ENDPOINT_KINDS.includes(kind)) {
        return { ok: false, reason: 'kind must be one of ' + ENDPOINT_KINDS.join(', ') }
    }
    if (spec.options !== undefined) {
        const looksObject = typeof spec.options === 'object' && spec.options !== null && !Array.isArray(spec.options)
        if (!looksObject) return { ok: false, reason: 'options must be an object' }
    }
    return { ok: true, name, url, kind, options: spec.options || {} }
}

/** Timing-safe-enough string compare for the admin key (no early exit). */
export function adminKeyMatch(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false
    const len = Math.max(a.length, b.length)
    let diff = a.length === b.length ? 0 : 1
    for (let i = 0; i < len; i++) {
        diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
    }
    return diff === 0
}
