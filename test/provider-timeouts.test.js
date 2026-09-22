#!/usr/bin/env node
/**
 * Provider-op timeout tests (audit P2 #25 + follow-up)
 *
 * Audit P2 #25: "Add timeouts to all provider operations (sync.js, remote.js)".
 * Pre-fix reality: every git connector's _request() called the GLOBAL fetch()
 * — no timeout, no abort, no circuit breaker — and git CLI calls were bare
 * execSync with no kill timeout. A dead endpoint (or a hung SSH remote) hung
 * sync.pushAll()/pullAny()/rebase() forever.
 *
 * Fix contract (all testable OFFLINE — no real network anywhere):
 *   - GitProvider._requestJson(): routes through network.fetch (SSRF walls,
 *     circuit breaker, events; `system: true` bypass contract, cache off)
 *     with a wall-clock race; throws coded retryable NETWORK_TIMEOUT on
 *     expiry; maps 'HTTP <status>' rejections to coded NETWORK_HTTP_ERROR.
 *     (Stub target is lib/network's fetch — network.fetch owns its own
 *     http/https transport, so stubbing the global fetch is inert.)
 *   - GitProvider._gitOpts(): returns execSync options with a numeric
 *     `timeout` (default 60s, env VANT_GIT_TIMEOUT_MS) + stdio:'pipe'.
 *   - sync._capOp(): wall-clock cap around ANY provider op (even ones that
 *     never touch HTTP); rejects with coded NETWORK_TIMEOUT VantError.
 *
 * Offline technique: network.fetch stubbed with a never-resolving promise
 * (and controllable resolutions for happy paths); sync's provider DI
 * (_setTestProvider) for the pushAll wall-clock test. No sockets opened.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const errors = require(path.join(ROOT, 'lib', 'error'));
const network = require(path.join(ROOT, 'lib', 'network'));
const { GitProvider } = require(path.join(ROOT, 'lib', 'remote'));
const sync = require(path.join(ROOT, 'lib', 'sync'));

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

console.log('\n⏱  PROVIDER OP TIMEOUT TESTS (P2 #25)\n');

// ---------- GitProvider._requestJson contract ----------

test('base: _requestJson + _gitOpts exist on GitProvider prototype', () => {
    if (typeof GitProvider.prototype._requestJson !== 'function') return { success: false, error: '_requestJson missing' };
    if (typeof GitProvider.prototype._gitOpts !== 'function') return { success: false, error: '_gitOpts missing' };
    return true;
});

test('base: _requestJson resolves parsed JSON from network.fetch string', async () => {
    const real = network.fetch;
    network.fetch = async () => JSON.stringify({ ok: 1 });
    try {
        const p = new GitProvider({});
        const data = await p._requestJson('https://api.example.test/x', { headers: { Authorization: 'Bearer t' } });
        if (data.ok !== 1) return { success: false, error: 'bad payload: ' + JSON.stringify(data) };
        return true;
    } finally {
        network.fetch = real;
    }
});

test('base: _requestJson times out a hung network.fetch with coded NETWORK_TIMEOUT', async () => {
    const real = network.fetch;
    let sawTimeoutOpt = null;
    network.fetch = (url, opts) => new Promise(() => { sawTimeoutOpt = opts && opts.timeout; });
    try {
        const p = new GitProvider({});
        const t0 = Date.now();
        let err = null;
        try { await p._requestJson('https://api.example.test/slow', { timeoutMs: 40 }); }
        catch (e) { err = e; }
        const dt = Date.now() - t0;
        if (!err) return { success: false, error: 'no throw on hung fetch' };
        if (err.code !== 'NETWORK_TIMEOUT') return { success: false, error: 'wrong code: ' + err.code };
        if (err.retryable !== true) return { success: false, error: 'timeout not marked retryable' };
        if (sawTimeoutOpt !== 40) return { success: false, error: 'timeout not forwarded to network layer: ' + sawTimeoutOpt };
        if (dt > 3000) return { success: false, error: 'timeout fired too late: ' + dt + 'ms' };
        return true;
    } finally {
        network.fetch = real;
    }
});

test('base: _requestJson throws coded error on HTTP error status', async () => {
    const real = network.fetch;
    network.fetch = async () => { throw new Error('HTTP 403 for https://api.example.test/denied'); };
    try {
        const p = new GitProvider({});
        let err = null;
        try { await p._requestJson('https://api.example.test/denied'); }
        catch (e) { err = e; }
        if (!err) return { success: false, error: 'no throw on 403' };
        if (err.code !== 'NETWORK_HTTP_ERROR') return { success: false, error: 'wrong code: ' + err.code };
        if (!/403/.test(err.message)) return { success: false, error: 'status not in message: ' + err.message };
        return true;
    } finally {
        network.fetch = real;
    }
});

test('base: _gitOpts returns numeric timeout + stdio pipe', () => {
    const p = new GitProvider({});
    const opts = p._gitOpts();
    if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) return { success: false, error: 'bad timeout: ' + opts.timeout };
    if (opts.stdio !== 'pipe') return { success: false, error: 'stdio not pipe' };
    return true;
});

test('base: _gitOpts honors VANT_GIT_TIMEOUT_MS', () => {
    process.env.VANT_GIT_TIMEOUT_MS = '1234';
    try {
        const p = new GitProvider({});
        const opts = p._gitOpts();
        if (opts.timeout !== 1234) return { success: false, error: 'env not honored: ' + opts.timeout };
        return true;
    } finally {
        delete process.env.VANT_GIT_TIMEOUT_MS;
    }
});

// ---------- Connector wiring ----------

// Every git connector's HTTP ops must ride the base timeout path. Structural
// pin: source must route through this._requestJson — a raw global fetch in a
// provider file is the exact regression class this slice closes.
test('connectors: no provider _request bypasses the timeout layer', () => {
    const fs = require('fs');
    const files = ['github', 'gitlab', 'bitbucket', 'gitea', 'selfhosted'];
    for (const f of files) {
        const src = fs.readFileSync(path.join(ROOT, 'lib', 'connectors', f + '.js'), 'utf8');
        if (/fetch\(/.test(src)) return { success: false, error: f + '.js calls bare fetch() instead of _requestJson' };
    }
    return true;
});

test('connectors: github _request returns parsed data with auth headers', async () => {
    const { GitHubProvider } = require(path.join(ROOT, 'lib', 'connectors', 'github'));
    const real = network.fetch;
    let gotAuth = null;
    network.fetch = async (url, opts) => {
        gotAuth = opts && opts.headers && opts.headers.Authorization;
        return JSON.stringify({ default_branch: 'main' });
    };
    try {
        const p = new GitHubProvider({ token: 'tok', repo: 'o/r' });
        const data = await p._request('/repos/o/r');
        if (data.default_branch !== 'main') return { success: false, error: 'bad payload' };
        if (gotAuth !== 'Bearer tok') return { success: false, error: 'missing auth header: ' + gotAuth };
        return true;
    } finally {
        network.fetch = real;
    }
});

test('connectors: gitea _request parses JSON from text bodies', async () => {
    const { GiteaProvider } = require(path.join(ROOT, 'lib', 'connectors', 'gitea'));
    const real = network.fetch;
    network.fetch = async () => JSON.stringify({ default_branch: 'master' });
    try {
        const p = new GiteaProvider({ token: 'tok', repo: 'o/r', url: 'https://gitea.example.test' });
        const data = await p._request('/repos/o/r');
        if (data.default_branch !== 'master') return { success: false, error: 'bad payload' };
        return true;
    } finally {
        network.fetch = real;
    }
});

// ---------- sync._capOp: wall-clock cap around provider ops ----------

test('sync: _capOp exists (wall-clock provider-op cap)', () => {
    if (typeof sync._capOp !== 'function') return { success: false, error: '_capOp missing' };
    return true;
});

test('sync: _capOp resolves passthrough values untouched', async () => {
    const out = await sync._capOp(Promise.resolve({ v: 7 }), 1000, 'test:op');
    if (!out || out.v !== 7) return { success: false, error: 'bad passthrough: ' + JSON.stringify(out) };
    return true;
});

test('sync: _capOp rejects hung op with coded NETWORK_TIMEOUT', async () => {
    const t0 = Date.now();
    let err = null;
    try { await sync._capOp(new Promise(() => {}), 40, 'test:hung'); }
    catch (e) { err = e; }
    const dt = Date.now() - t0;
    if (!err) return { success: false, error: 'no rejection on hang' };
    if (err.code !== 'NETWORK_TIMEOUT') return { success: false, error: 'wrong code: ' + err.code };
    if (err.retryable !== true) return { success: false, error: 'not marked retryable' };
    if (dt > 3000) return { success: false, error: 'fired too late: ' + dt + 'ms' };
    return true;
});

test('sync: _capOp caps op from test provider inside pushAll', async () => {
    const real = network.fetch;
    network.fetch = async () => { throw new Error('no network in tests'); };
    const fake = {
        getType: () => 'fakegit',
        isConfigured: () => true,
        commit: () => new Promise(() => {}),   // hung provider op
        push: () => Promise.resolve(true)
    };
    sync._setTestProvider('fakegit', fake);
    try {
        const r = await sync.pushAll({ commitMessage: 'p2-25 cap test', opTimeoutMs: 100 });
        const res = r.results && r.results.fakegit;
        if (!res) return { success: false, error: 'no per-provider result' };
        if (res.success !== false) return { success: false, error: 'hung op reported success' };
        if (!/timed out/i.test(res.error || '')) return { success: false, error: 'error not a timeout: ' + res.error };
        return true;
    } finally {
        sync._clearTestProviders();
        network.fetch = real;
    }
});

// ---------- network.withTimeout sanity (borrowed infra stays healthy) ----------

test('network: withTimeout still exported and rejects on deadline', async () => {
    if (typeof network.withTimeout !== 'function') return { success: false, error: 'withTimeout missing' };
    let err = null;
    try { await network.withTimeout(new Promise(() => {}), 30); }
    catch (e) { err = e; }
    if (!err) return { success: false, error: 'no rejection' };
    return true;
});

// ---------- summary ----------

(async () => {
    await _chain;
    console.log(`\nResults: ${results.passed} passed, ${results.failed} failed\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
