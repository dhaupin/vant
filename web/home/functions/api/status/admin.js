/**
 * functions/api/status/admin.js (vant-home)
 * =========================================
 * POST /api/status/admin - the operator door (curl-able, and the tiny
 * operator panel on /status speaks the same shape):
 *
 *   key: <STATUS_ADMIN_KEY>            (header x-admin-key or body.key)
 *   action: alert.set    { message, level: info|warn|critical }
 *           alert.clear
 *           endpoint.add { name, url, kind: http|json-ok|github-ci, options? }
 *           endpoint.remove { target: id | exact name }
 *           endpoint.reset             (defaults back, six owner-named)
 *           check.run                  (force a sweep, no throttle)
 *
 * STATUS_ADMIN_KEY lives in the PAGES PROJECT SETTINGS (env vars); a
 * missing/var-too-short key answers 503 with the fix, not a failure mode
 * that pretends the door was opened. The key comparison is constant-time.
 */

import {
    json, ensureSchema, seedDefaults,
    addEndpoint, removeEndpoint, getEndpoints,
    setAlert, clearAlert, runSweep,
} from '../../_lib/status.js'
import { adminKeyMatch, validEndpointSpec } from '../../_lib/status-math.js'

export async function onRequestPost(context) {
    const env = context.env
    const db = env && env.DB
    if (!db) {
        return json(503, { error: 'Status history is not wired yet: bind the D1 database as `DB` in the Pages settings, then redeploy.' })
    }
    const adminKey = typeof env.STATUS_ADMIN_KEY === 'string' ? env.STATUS_ADMIN_KEY : ''
    if (adminKey.length < 8) {
        return json(503, { error: 'STATUS_ADMIN_KEY is not set (or shorter than 8 chars). Add it in the Pages settings env vars; it never lives in code.' })
    }
    let body = null
    try { body = await context.request.json() } catch (e) { body = null }
    if (!body || typeof body !== 'object') {
        return json(400, { error: 'json body required' })
    }
    const headerKey = context.request.headers.get('x-admin-key') || ''
    const providedKey = typeof body.key === 'string' ? body.key : ''
    if (!adminKeyMatch(headerKey || providedKey, adminKey)) {
        return json(403, { error: 'invalid admin key' })
    }
    try {
        await ensureSchema(db)
        await seedDefaults(db)
        switch (body.action) {
            case 'alert.set': {
                const out = await setAlert(db, body)
                return json(200, { ok: true, alert: out.alert })
            }
            case 'alert.clear': {
                const out = await clearAlert(db)
                return json(200, { ok: true, cleared: out.cleared })
            }
        case 'endpoint.add': {
            // Cost wall: endpoint cap (env STATUS_MAX_ENDPOINTS, plain Text,
            // default 24) - an unlimited table would turn one cold public
            // GET into a probe per row, forever.
            const max = Number(env.STATUS_MAX_ENDPOINTS || '') || 24
            const spec = validEndpointSpec({ name: body.name, url: body.url, kind: body.kind, options: body.options })
            if (!spec.ok) return json(400, { error: spec.reason })
            const out = await addEndpoint(db, spec, max)
            if (out.capped) {
                return json(400, { error: `endpoint cap reached (${out.capped}): remove an endpoint first, or raise STATUS_MAX_ENDPOINTS in the Pages settings (plain Text)` })
            }
            return json(200, { ok: true, added: out.added, endpoints: await getEndpoints(db) })
        }
            case 'endpoint.remove': {
                const out = await removeEndpoint(db, body.target)
                return json(200, { ok: true, removed: out.removed, endpoints: await getEndpoints(db) })
            }
            case 'endpoint.reset': {
                await db.prepare('DELETE FROM status_endpoints').run()
                await seedDefaults(db)
                return json(200, { ok: true, reset: true, endpoints: await getEndpoints(db) })
            }
            case 'check.run': {
                const out = await runSweep(db, { force: true })
                return json(200, { ok: true, results: out.results || [] })
            }
            default:
                return json(400, {
                    error: 'unknown action; one of alert.set | alert.clear | endpoint.add | endpoint.remove | endpoint.reset | check.run',
                })
        }
    } catch (e) {
        return json(400, { error: String((e && e.message) || 'admin action failed').slice(0, 200) })
    }
}
