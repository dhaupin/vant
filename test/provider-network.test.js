#!/usr/bin/env node
/**
 * Provider HTTP routing tests (follow-up to P2 #25)
 *
 * After P2 #25 the provider timeout layer existed but still called the bare
 * global fetch — no SSRF walls, no circuit breaker, no network events, and a
 * cache that could have served authed responses across tokens had it been on.
 * This slice routes GitProvider._requestJson through network.fetch and fixes
 * two network.js contracts it exposed:
 *
 *   1. non-2xx rejections said `HTTP ${res.statusCode}` LITERALLY (escaped $)
 *      — the status code never reached the message;
 *   2. the sandbox capability gate inside network.fetch checks
 *      `typeof sb.can === 'function'` but the sandbox module has no top-level
 *      can() — dead code today, and the planned canX()/can() unification
 *      would have flipped it live and denied-by-default every provider call.
 *      The documented `system: true` fetch option is the bypass contract for
 *      system-initiated ops (sync providers) whose authorization happens at
 *      the entry point (escrow + recursion guard + per-provider circuits).
 *
 * Offline: loopback server only for the status-message bug; everything else
 * stubs lib/network's fetch (the module remote.js now calls through).
 */

const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '..');

const errors = require(path.join(ROOT, 'lib', 'error'));
const network = require(path.join(ROOT, 'lib', 'network'));
const { GitProvider } = require(path.join(ROOT, 'lib', 'remote'));

const results = { passed: 0, failed: 0 };
let _chain = Promise.resolve();

function test(name, fn) {
    _chain = _chain.then(() => {
        return Promise.resolve().then(fn).then(ok => {
            if (ok === true || (ok && ok.success)) {
                results.passed++;
                console.log(`  ✓ ${name}`);
            } else {
                results.failed++;
                const msg = (ok && ok.error) || 'failed';
                console.log(`  ✗ ${name}: ${msg}`);
            }
        }).catch(e => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        });
    });
}

console.log('\n🌐 PROVIDER NETWORK ROUTING TESTS\n');

// ---------- network.js: SSRF wall contract (pure, no sockets) ----------

test('network: isDomainAllowed blocks private/internal IP literals', () => {
    if (network.isDomainAllowed('http://169.254.169.254/latest/meta-data') !== false) {
        return { success: false, error: 'metadata IP allowed' };
    }
    if (network.isDomainAllowed('http://10.0.0.5/x') !== false) {
        return { success: false, error: 'private-range IP allowed' };
    }
    return true;
});

test('network: isDomainAllowed allows public hosts by default', () => {
    if (network.isDomainAllowed('https://api.github.com/x') !== true) {
        return { success: false, error: 'public host blocked' };
    }
    return true;
});

test('network: fetch accepts the documented system option (bypass contract pin)', () => {
    // Behavioral gate is inert today (sandbox module has no top-level can());
    // this pin exists so the canX()/can() migration cannot silently drop the
    // system-initiated bypass that sync providers rely on.
    const fs = require('fs');
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'network.js'), 'utf8');
    if (!/system\s*=\s*false/.test(src)) return { success: false, error: 'no `system = false` option destructure' };
    if (!/!system && sb/.test(src) && !/!system\s*&&/.test(src)) {
        return { success: false, error: 'sandbox gate not conditioned on !system' };
    }
    return true;
});

// ---------- network.js: non-2xx message bug (real loopback socket) ----------

test('network: non-2xx rejection carries the actual status code', async () => {
    const server = http.createServer((req, res) => { res.statusCode = 500; res.end('boom'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const { port } = server.address();
        let err = null;
        try {
            await network.fetch(`http://127.0.0.1:${port}/x`, {
                cache: false, circuit: false, skipDomainCheck: true, system: true
            });
        } catch (e) { err = e; }
        if (!err) return { success: false, error: 'no rejection on 500' };
        if (!/HTTP 500/.test(err.message)) {
            return { success: false, error: 'status missing from message: ' + err.message };
        }
        if (err.message.includes('${')) {
            return { success: false, error: 'uninterpolated placeholder leaked: ' + err.message };
        }
        return true;
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

// ---------- GitProvider._requestJson: routed through network.fetch ----------

test('provider: _requestJson calls network.fetch with system+cache-off', async () => {
    const realFetch = network.fetch;
    let sawOpts = null;
    network.fetch = async (url, opts) => { sawOpts = opts; return JSON.stringify({ routed: true }); };
    try {
        const p = new GitProvider({});
        const data = await p._requestJson('https://api.example.test/x', { headers: { Authorization: 'Bearer t' } });
        if (!data || data.routed !== true) return { success: false, error: 'bad payload: ' + JSON.stringify(data) };
        if (!sawOpts) return { success: false, error: 'network.fetch not called' };
        if (sawOpts.system !== true) return { success: false, error: 'system flag missing' };
        if (sawOpts.cache !== false) return { success: false, error: 'cache not disabled (auth leak risk)' };
        if (sawOpts.headers && sawOpts.headers.Authorization !== 'Bearer t') {
            return { success: false, error: 'headers dropped' };
        }
        return true;
    } finally {
        network.fetch = realFetch;
    }
});

test('provider: SSRF-walled requests surface as coded NETWORK_BLOCKED', async () => {
    const realFetch = network.fetch;
    network.fetch = async () => { throw new Error('Network: DNS rebinding blocked - resolved to internal IP 10.0.0.1'); };
    try {
        const p = new GitProvider({});
        let err = null;
        try { await p._requestJson('https://evil.example.test/x'); }
        catch (e) { err = e; }
        if (!err) return { success: false, error: 'no throw on blocked request' };
        if (err.code !== 'NETWORK_BLOCKED') return { success: false, error: 'wrong code: ' + err.code };
        if (err.retryable !== false) return { success: false, error: 'blocked marked retryable' };
        return true;
    } finally {
        network.fetch = realFetch;
    }
});

test('provider: HTTP error from network layer maps to coded NETWORK_HTTP_ERROR', async () => {
    const realFetch = network.fetch;
    network.fetch = async () => { throw new Error('HTTP 403 for https://api.example.test/x'); };
    try {
        const p = new GitProvider({});
        let err = null;
        try { await p._requestJson('https://api.example.test/x'); }
        catch (e) { err = e; }
        if (!err) return { success: false, error: 'no throw on 403' };
        if (err.code !== 'NETWORK_HTTP_ERROR') return { success: false, error: 'wrong code: ' + err.code };
        if (err.retryable !== false) return { success: false, error: '403 marked retryable' };
        if (!/403/.test(err.message)) return { success: false, error: 'status not in message' };
        return true;
    } finally {
        network.fetch = realFetch;
    }
});

test('provider: server 5xx mapped retryable', async () => {
    const realFetch = network.fetch;
    network.fetch = async () => { throw new Error('HTTP 503 for https://api.example.test/x'); };
    try {
        const p = new GitProvider({});
        let err = null;
        try { await p._requestJson('https://api.example.test/x'); }
        catch (e) { err = e; }
        if (!err || err.code !== 'NETWORK_HTTP_ERROR') return { success: false, error: 'wrong error: ' + (err && err.code) };
        if (err.retryable !== true) return { success: false, error: '503 not retryable' };
        return true;
    } finally {
        network.fetch = realFetch;
    }
});

test('provider: timeout race still fires over hung network.fetch', async () => {
    const realFetch = network.fetch;
    network.fetch = () => new Promise(() => {});
    try {
        const p = new GitProvider({});
        const t0 = Date.now();
        let err = null;
        try { await p._requestJson('https://api.example.test/slow', { timeoutMs: 40 }); }
        catch (e) { err = e; }
        const dt = Date.now() - t0;
        if (!err) return { success: false, error: 'no throw on hung network.fetch' };
        if (err.code !== 'NETWORK_TIMEOUT') return { success: false, error: 'wrong code: ' + err.code };
        if (dt > 3000) return { success: false, error: 'fired too late: ' + dt + 'ms' };
        return true;
    } finally {
        network.fetch = realFetch;
    }
});

test('provider: non-JSON success body passes through as text', async () => {
    const realFetch = network.fetch;
    network.fetch = async () => 'plain text body';
    try {
        const p = new GitProvider({});
        const out = await p._requestJson('https://api.example.test/text');
        if (out !== 'plain text body') return { success: false, error: 'body mangled: ' + JSON.stringify(out) };
        return true;
    } finally {
        network.fetch = realFetch;
    }
});

// ---------- summary ----------

(async () => {
    await _chain;
    console.log(`\nResults: ${results.passed} passed, ${results.failed} failed\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
