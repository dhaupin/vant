/**
 * functions/api/status/scheduled.js (vant-home)
 * =============================================
 * onScheduled - the daily-sweep door on a cron trigger. Configure the
 * schedule in the Pages dashboard (Settings > Functions > Cron triggers),
 * e.g. every 30 minutes: the handler runs the SAME sweep
 * (www check per endpoint + daily rollup, force=true so it skips the GET
 * throttle) so quiet days still get fresh samples.
 *
 * If a trigger is not configured, history is NOT lost: every summary
 * visitor drives the throttled sweep, and days with no samples render as
 * "no data" rather than as downtime. This notes-file honest posture lives
 * in web/home/functions/README.md.
 */

import { ensureSchema, seedDefaults, runSweep } from '../../_lib/status.js'

export async function onScheduled(context) {
    const env = context.env
    if (!env || !env.DB) return // nothing to do without the binding
    try {
        await ensureSchema(env.DB)
        await seedDefaults(env.DB)
        await runSweep(env.DB, { force: true })
    } catch (e) {
        // Scheduled failures are silent on the wire; the monitor's own
        // freshness row (last_sweep age) is what surfaces them honestly.
        if (e && e.message) console.log('[status/scheduled]', e.message)
    }
}

export const onRequest = () => new Response(JSON.stringify({ error: 'scheduled only' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' },
})
