/**
 * Shared Sidecar Runtime (pass 166) — spawn/health/post/stop for JIT-heavy
 * language bridges.
 *
 * WHY: subprocess-per-call connectors (BaseConnector.execute) pay the
 * language's startup cost on EVERY eval. For Julia that is a 2-30s JIT
 * compile per call — geometry/engine.js pays it on every complex
 * multiply. A sidecar pays it ONCE: a small HTTP process spawned on
 * localhost, health-checked, then eval'd via POST until stopped.
 *
 * PARITY (owner decision, pass 166): this runtime is deliberately SHARED —
 * both lib/connectors/ (SidecarConnector for compute.js) and lib/adapters/
 * (sidecar-hosted format bridges) use the same spawn/health/post/stop
 * machinery, so the two systems keep identical lifecycle semantics.
 *
 * SECURITY POSTURE (mirrors the MCP door):
 * - Bind LOOPBACK ONLY (127.0.0.1) unless VANT_SIDECAR_HOST overrides.
 * - Per-instance random token; every eval POST must carry it. Nothing
 *   else on the box can drive the sidecar without the token.
 * - The sidecar runs the language the operator already runs; sandbox
 *   capability gating stays at the compute.js layer (unchanged).
 *
 * Wire (both directions JSON):
 *   GET  /health  -> { ok: true, lang }
 *   POST /eval    { token, code }  -> { ok, stdout, stderr, success }
 *   POST /stop    { token }        -> process exits 0
 */

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_TIMEOUT = 30000;
const START_TIMEOUT = 30000;   // Julia JITs on first /health — be patient
const HEALTH_INTERVAL = 200;

/**
 * Build a sidecar spec for a language. Centralized so callers cannot
 * disagree about command/port/token derivation.
 * @param {string} lang - 'julia' | 'rust' | 'python' (srv scripts live in
 *   lib/connectors/<lang>-srv.jl etc.)
 * @param {object} opts - { port?, host?, token?, srvPath?, env? }
 */
function buildSpec(lang, opts = {}) {
    const srvPath = opts.srvPath ||
        path.join(__dirname, 'connectors', lang + '-srv.jl');
    return {
        lang,
        srvPath,
        host: opts.host || process.env.VANT_SIDECAR_HOST || '127.0.0.1',
        port: opts.port || 0,               // 0 = ask the OS for a free port
        token: opts.token || crypto.randomBytes(16).toString('hex'),
        startTimeout: opts.startTimeout || START_TIMEOUT,
        env: opts.env || {}
    };
}

/**
 * POST JSON, return parsed body. Rejects on transport error; callers
 * decide policy (fail-open/fallback vs throw).
 */
function post(spec, pathname, payload, timeoutMs = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const req = http.request({
            host: spec.host,
            port: spec.port,
            path: pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'x-sidecar-token': spec.token
            },
            timeout: timeoutMs
        }, (res) => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (e) {
                    reject(new Error('sidecar returned non-JSON: ' + raw.slice(0, 120)));
                }
            });
        });
        req.on('timeout', () => { req.destroy(new Error('sidecar POST timed out')); });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Health probe. Resolves true only when /health answers with ok:true and
 * the expected lang (a stray process on the port must not count).
 */
function healthy(spec) {
    return new Promise((resolve) => {
        const req = http.get({
            host: spec.host,
            port: spec.port,
            path: '/health',
            timeout: 2000,
            headers: { 'x-sidecar-token': spec.token }
        }, (res) => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try {
                    const body = JSON.parse(raw);
                    resolve(res.statusCode === 200 && body.ok === true && body.lang === spec.lang);
                } catch (e) { resolve(false); }
            });
        });
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

/**
 * Spawn the sidecar process for a spec and wait until /health is ok.
 * The srv script is expected to print its bound port on stdout as the
 * LAST line ("SIDECAR_PORT=<n>") so port 0 (OS-assigned) works.
 * @returns {{ proc, spec }} handle — caller owns proc.on('exit') logging
 *   and stop().
 */
async function spawnAndWait(spec) {
    const proc = spawn(spec.lang, [spec.srvPath, String(spec.token)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...spec.env }
    });

    let stderr = '';
    proc.stderr.on('data', d => stderr += d);

    const port = await new Promise((resolve, reject) => {
        let stdout = '';
        let settled = false;
        const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };
        const timer = setTimeout(() => done(reject, new Error(
            'sidecar start timed out after ' + spec.startTimeout + 'ms' +
            (stderr ? ' — stderr: ' + stderr.slice(-200) : ''))), spec.startTimeout);

        // (pass 166, pin-caught) spawn ENOENT (language not installed) emits
        // 'error' — without this handler it crashes the whole process.
        proc.on('error', (err) => {
            clearTimeout(timer);
            done(reject, new Error('sidecar spawn failed: ' + err.message));
        });
        proc.stdout.on('data', (d) => {
            stdout += d;
            const m = stdout.match(/SIDECAR_PORT=(\d+)\s*$/m);
            if (m) {
                clearTimeout(timer);
                done(resolve, parseInt(m[1], 10));
            }
        });
        proc.on('exit', (code) => {
            clearTimeout(timer);
            done(reject, new Error('sidecar exited during startup (code ' + code + ')' +
                (stderr ? ' — stderr: ' + stderr.slice(-200) : '')));
        });
    });

    const liveSpec = Object.assign({}, spec, { port });

    // Health-poll until the language runtime answers (Julia JITs on first
    // request; START_TIMEOUT bounds the whole wait).
    const deadline = Date.now() + spec.startTimeout;
    while (Date.now() < deadline) {
        if (await healthy(liveSpec)) {
            return { proc, spec: liveSpec };
        }
        await new Promise(r => setTimeout(r, HEALTH_INTERVAL));
    }
    proc.kill();
    throw new Error('sidecar never became healthy on :' + liveSpec.port);
}

/**
 * Eval code on a running sidecar. Returns the BaseConnector-compatible
 * result shape so compute.js needs zero adaptation:
 *   { code: 0, stdout, stderr, success }
 */
async function evalOn(spec, code, timeoutMs = DEFAULT_TIMEOUT) {
    const res = await post(spec, '/eval', { token: spec.token, code }, timeoutMs);
    if (!res || res.ok !== true) {
        return {
            code: 1,
            stdout: '',
            stderr: (res && res.stderr) || 'sidecar eval failed',
            success: false
        };
    }
    return { code: 0, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim(), success: true };
}

/**
 * Ask the sidecar to exit cleanly. Fire-and-forget safe.
 */
async function stop(spec) {
    try {
        await post(spec, '/stop', { token: spec.token }, 2000);
    } catch (e) { /* already gone — fine */ }
}

module.exports = { buildSpec, spawnAndWait, post, healthy, evalOn, stop, DEFAULT_TIMEOUT };
