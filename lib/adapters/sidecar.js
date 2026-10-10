/**
 * Adapter Sidecar (pass 166) — parity hook for lib/adapters/.
 *
 * Owner decision (pass 166): connectors and adapters keep PARITY on the
 * sidecar capability. Connectors get it via SidecarConnector (compute.js
 * routing); adapters get the SAME shared runtime (lib/sidecar.js) here, so
 * a format bridge can live in a persistent language process instead of
 * re-spawning it per conversion.
 *
 * Example: a Julia-side transformer for huge publication batches — host
 * the transformer in julia-srv.jl, then:
 *
 *   const adapterSidecar = require('./sidecar');
 *   const result = await adapterSidecar.transform('julia', 'transformBatch(...)', { rows: [...] });
 *
 * Transform payloads ride the SAME token-checked localhost HTTP wire and
 * the SAME spawn/health/stop lifecycle as connector sidecars — one shared
 * runtime (lib/sidecar.js), two consumers, zero divergent semantics.
 *
 * NOTE: this is the minimal parity seam (transform + stop). Adapter-side
 * sidecars were requested as a capability, not a migration — existing
 * in-process adapters (langchain, github-fragmenter) stay exactly as they
 * are; this is for NEW heavy bridges.
 */

const sidecar = require('../sidecar');

const _handles = new Map(); // lang -> { proc, spec }

/**
 * Run a transform snippet on the language's sidecar (spawning it if
 * needed). `payload` must be JSON-serializable; it is embedded into the
 * code string as a variable named `payload_json`.
 * @returns BaseConnector-compatible shape { code, stdout, stderr, success }
 */
async function transform(lang, code, payload = {}, opts = {}) {
    let handle = _handles.get(lang);
    if (!handle || handle.proc.exitCode !== null || !(await sidecar.healthy(handle.spec))) {
        const spec = sidecar.buildSpec(lang, opts.sidecar || {});
        handle = await sidecar.spawnAndWait(spec);
        _handles.set(lang, handle);
    }
    const payloadJson = JSON.stringify(payload).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    const fullCode = 'const payload_json = `' + payloadJson + '`;\n' + code;
    return sidecar.evalOn(handle.spec, fullCode, opts.timeout);
}

/**
 * Stop every sidecar this module spawned.
 */
async function stopAll() {
    const stops = [];
    for (const [, handle] of _handles) {
        stops.push(sidecar.stop(handle.spec));
        if (handle.proc.exitCode === null) handle.proc.kill();
    }
    _handles.clear();
    await Promise.all(stops);
}

module.exports = { transform, stopAll };
