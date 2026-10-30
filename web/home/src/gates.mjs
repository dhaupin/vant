/**
 * src/gates.mjs (vant-home)
 * =========================
 * THE DEPLOY-GATE REGISTRY (pure data, no React): one flag per dynamic
 * surface of the site. A surface is LIVE only when its build variable
 * VITE_<NAME>_LIVE is set to 1 in the Pages build settings; while off,
 * the surface's route renders the SHARED maintenance stage
 * (components/Maintenance.jsx) and the site as a whole stays quiet about
 * it (walk.mjs's WALK_LIVE drops the stop from menu/drawer/footer/hops).
 *
 * The law these flags own (owner direction): a page that depends on a
 * runtime binding (D1, an edge worker with a secret, ...) must never
 * render as if it were working. Not-wired = maintenance line, nothing
 * else. The flags are BUILD-TIME (prerendered pages cannot ask the edge
 * whether a binding exists at runtime); the gate decision is deliberate.
 *
 * Registering a future gated surface:
 *   1. export const <NAME>_LIVE = flag('VITE_<NAME>_LIVE');
 *   2. gate its route:   element={NAME_LIVE ? <Page/> : <Maintenance/>};
 *   3. if it is a tour stop, drop it from walk.mjs's WALK_LIVE filter
 *      while the gate is off, exactly like Status below (via walk.mjs).
 */

function flag(name) {
    const v = (typeof import.meta !== 'undefined' && import.meta.env)
        ? import.meta.env[name]
        : undefined
    return String(v) === '1'
}

/** The status surface: live only once D1 + STATUS_ADMIN_KEY answer 200 and the owner flips the flag. */
export const STATUS_LIVE = flag('VITE_STATUS_LIVE')

/** Future gates follow the same one-line shape, e.g.:
 *  export const RELAY_LIVE = flag('VITE_RELAY_LIVE'); */

/** Lazily resolve a surface by name (for list-driven surfaces): featureLive('status'). */
export function featureLive(name) {
    return flag('VITE_' + String(name).toUpperCase() + '_LIVE')
}
