/**
 * functions/api/status/summary.js (vant-home)
 * ===========================================
 * GET /api/status/summary - the whole board in one GET:
 *   { overall, monitor, alert, endpoints: [{ name, state, uptime30,
 *     history: [35 daily buckets], latencyMs, lastCheck, detail }] }
 *
 * Setup contract (owner law, pass 355): the D1 database is bound as `DB`
 * in the PAGES PROJECT SETTINGS (Settings > Bindings > Add > D1 database
 * bindings) - no wrangler file ships here. Tables create themselves on
 * first read; the six owner-named endpoints seed themselves on first boot.
 *
 * The sweep is throttled through status_meta + the STATUS_SWEEP_SECONDS
 * Pages env var (default 10 minutes), so a public GET can never be turned
 * into a hammer. The scheduled handler and the admin check.run door share
 * this _lib but skip the throttle.
 */

import { json, ensureSchema, seedDefaults, maybeSweep, getSummary } from '../../_lib/status.js'

export async function onRequestGet(context) {
    const env = context.env
    if (!env || !env.DB) {
        // error rides the BOARD in one short clause; fix is the operator
        // sentence (the island renders them separately, no prose soup).
        return json(503, {
            error: 'no D1 binding on this deploy',
            fix: 'Bind the vant-pub database as `DB` in this Pages project settings: Settings > Bindings > Add > D1 database bindings, then redeploy.',
        })
    }
    try {
        await ensureSchema(env.DB)
        await seedDefaults(env.DB)
        const sweep = await maybeSweep(env, env.DB)
        const summary = await getSummary(env.DB)
        summary.sweep = { ran: !!sweep.ran }
        return json(200, summary)
    } catch (e) {
        // Never echo internals; the payload shape stays calm and the D1
        // console (Workers logs) carries the real error for operators.
        if (e && e.message) console.log('[status/summary]', e.message)
        return json(503, { error: 'Status summary unavailable; check the Workers logs for the failing query.' })
    }
}
