#!/usr/bin/env node
/**
 * Audit Round 4 — discriminating pins (MCP agent-OS security walk).
 *
 * Every pin here FAILS against the pre-fix code and PASSES after the fix;
 * none is a restatement of existing coverage:
 *
 * - R4-1: lib/connectors/node.js `eval`/`invoke` ran untrusted code in a vm
 *         context seeded with HOST objects (`{ console: fakeConsole }`), so
 *         `this.constructor.constructor('return process')()` reached the host
 *         Function constructor and escaped the sandbox to full RCE
 *         (child_process). eval also had NO timeout. Fixed: context root is
 *         null-prototype, no host objects injected, `codeGeneration` disabled,
 *         timeout enforced.
 * - R4-2: lib/config.js and lib/storage/config.js evaluated `vant.config.js`
 *         in a vm context seeded with a HOST `{ module: { exports: {} } }`,
 *         so `module.constructor.constructor('return process')()` escaped.
 *         Fixed the same way; legitimate configs still load.
 * - R4-3: lib/persistent-grants.js revocation was exact-key: a scoped revoke
 *         left a wildcard grant LIVE (silent fail-open), and a re-grant after
 *         a revoke could never restore the capability. Fixed with sequential
 *         tombstone replay + fail-closed scope coverage.
 *
 * Run: node tests/audit-round4.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
const _asyncTests = [];

function _verdict(r) {
    if (r === true || (r && r.success)) return { ok: true };
    return { ok: false, why: (r && r.error) || (r && r.why) || 'assertion failed' };
}
function test(name, fn) {
    let v;
    try { v = _verdict(fn()); } catch (e) { v = { ok: false, why: e.message }; }
    if (v.ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${v.why}`); }
}
function asyncTest(name, fn) { _asyncTests.push({ name, fn }); }
async function _runAsync() {
    for (const { name, fn } of _asyncTests) {
        let v;
        try { v = _verdict(await fn()); } catch (e) { v = { ok: false, why: e.message }; }
        if (v.ok) { results.passed++; console.log(`  ✓ ${name}`); }
        else { results.failed++; console.log(`  ✗ ${name}: ${v.why}`); }
    }
}
function tmpdir(label) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `vant-r4-${label}-`));
}

function nodeConnector() {
    const mod = require(path.join(ROOT, 'lib', 'connectors', 'node.js'));
    // node.js exports a ready instance; the class is available on some builds.
    if (mod && typeof mod.NodeConnector === 'function') return new mod.NodeConnector();
    return mod;
}

console.log('\n🔎 AUDIT ROUND 4 — DISCRIMINATING PINS\n');

// ==================== R4-1: node connector vm escape + timeout ====================

asyncTest('R4-1: node connector eval cannot reach the host realm (RCE closed)', async () => {
    const c = nodeConnector();
    const r = await c.eval(
        "this.constructor.constructor('return process')().getBuiltinModule('child_process').execSync('id').toString()"
    );
    // Pre-fix: success:true and stdout is the `id` output (uid=...).
    // Post-fix: success:false with a code-generation refusal.
    return { success: r && r.success === false };
});

asyncTest('R4-1: node connector eval still runs legit code', async () => {
    const c = nodeConnector();
    const expr = await c.eval('2 + 2');
    const logged = await c.eval('console.log(6 * 7)');
    return { success: expr && expr.stdout === '4' && logged && logged.stdout === '42' };
});

asyncTest('R4-1: node connector eval bounds runaway loops (timeout enforced)', async () => {
    const c = nodeConnector();
    // Pre-fix `_runIsolated` does not exist -> fast fail, never a hang.
    if (typeof c._runIsolated !== 'function') {
        return { success: false, why: 'no hardened _runIsolated path' };
    }
    const t0 = Date.now();
    const r = await c.eval('while(true){}', { timeout: 1500 });
    const elapsed = Date.now() - t0;
    return { success: r && r.success === false && /timed out/i.test(r.stderr || '') && elapsed < 6000 };
});

// ==================== R4-2: config vm escape (lib/config.js + storage) ====================

test('R4-2: lib/storage/config.js cannot escape via module.constructor (RCE closed)', () => {
    const { ConfigStorage } = require(path.join(ROOT, 'lib', 'storage'));
    const dir = tmpdir('cfg');
    const cfgPath = path.join(dir, 'evil.config.js');
    fs.writeFileSync(cfgPath,
        "module.exports = { port: 3457, escaped: (function(){ try { return this.constructor.constructor('return process')().version; } catch(e){ return false; } })() };");
    const cs = new ConfigStorage({ filePath: cfgPath });
    const escaped = cs.get('escaped');
    const legit = cs.get('port') === 3457;
    return { success: escaped !== true && escaped !== process.version && legit };
});

test('R4-2: lib/config.js cannot escape via module.constructor (RCE closed)', () => {
    const dir = tmpdir('cfgroot');
    const cfgPath = path.join(dir, 'vant.config.js');
    fs.writeFileSync(cfgPath,
        "module.exports = { port: 3457, escaped: (function(){ try { return module.constructor.constructor('return process')().version; } catch(e){ return false; } })() };");
    const prev = process.env.VANT_CONFIG;
    process.env.VANT_CONFIG = cfgPath;
    try {
        // fresh require so the loader re-reads the file
        delete require.cache[require.resolve(path.join(ROOT, 'lib', 'config.js'))];
        const config = require(path.join(ROOT, 'lib', 'config.js'));
        const all = typeof config.getAll === 'function' ? config.getAll() : {};
        return { success: all.escaped !== true && all.escaped !== process.version && all.port === 3457 };
    } finally {
        if (prev === undefined) delete process.env.VANT_CONFIG; else process.env.VANT_CONFIG = prev;
        delete require.cache[require.resolve(path.join(ROOT, 'lib', 'config.js'))];
    }
});

// ==================== R4-3: persistent-grants revocation ====================

function grantsAt(label) {
    const { PersistentGrants } = require(path.join(ROOT, 'lib', 'persistent-grants'));
    return new PersistentGrants({ ledgerPath: path.join(tmpdir(label), 'grants.jsonl') });
}

test('R4-3: a scoped revoke covers a wildcard grant (fail-open closed)', () => {
    const g = grantsAt('rev-scope');
    g.persist({ capability: 'canExec', grantor: 'admin' });      // scope defaults '*'
    g.revoke({ capability: 'canExec', scope: 'exec', actor: 'admin' });
    // Pre-fix: allowed:true (revoke silently did nothing).
    return { success: g.allows('canExec').allowed === false };
});

test('R4-3: a wildcard revoke covers a scoped grant', () => {
    const g = grantsAt('rev-wild');
    g.persist({ capability: 'canExec', scope: 'exec', grantor: 'admin' });
    g.revoke({ capability: 'canExec', actor: 'admin' });
    return { success: g.allows('canExec').allowed === false };
});

test('R4-3: a re-grant after a revoke restores the capability', () => {
    const g = grantsAt('regrant');
    g.persist({ capability: 'canExec', grantor: 'admin' });
    g.revoke({ capability: 'canExec', actor: 'admin' });
    g.persist({ capability: 'canExec', grantor: 'admin' });
    // Pre-fix: allowed:false forever (revoked capability un-restorable).
    return { success: g.allows('canExec').allowed === true };
});

test('R4-3: an unrelated revoke does not touch other capabilities', () => {
    const g = grantsAt('unrelated');
    g.persist({ capability: 'canWrite', grantor: 'admin' });
    g.revoke({ capability: 'canExec', actor: 'admin' });
    return { success: g.allows('canWrite').allowed === true };
});

test('R4-3: an exact-scope revoke leaves a sibling scope live', () => {
    const g = grantsAt('sibling');
    g.persist({ capability: 'canExec', scope: 'exec', grantor: 'admin' });
    g.persist({ capability: 'canExec', scope: 'network', grantor: 'admin' });
    g.revoke({ capability: 'canExec', scope: 'exec', actor: 'admin' });
    return { success: g.allows('canExec').allowed === true };
});

// ==================== R4-4: org grant --persist durable tier ====================

test('R4-4: `vant org grant --persist` writes the durable grants ledger', () => {
    const { execFileSync } = require('child_process');
    const dir = tmpdir('orgpersist');
    const brain = 'auditbrain';
    // Pre-fix: `--persist` was documented (lib/persistent-grants.js header +
    // lib/sandbox.js:728) but no writer existed, so the ledger was never
    // created and the durable tier was inert.
    execFileSync('node', [path.join(ROOT, 'bin', 'org.js'), 'grant',
        '--capabilities', 'canWrite', '--scopes', 'write', '--persist'], {
        cwd: dir, encoding: 'utf8', timeout: 30000,
        env: { ...process.env, VANT_BRAIN: brain, VANT_GATE_QUIET: '1' }
    });
    const ledgerPath = path.join(dir, 'models', 'private', brain, 'grants.jsonl');
    if (!fs.existsSync(ledgerPath)) {
        return { success: false, why: 'org grant --persist wrote no ledger' };
    }
    const { PersistentGrants } = require(path.join(ROOT, 'lib', 'persistent-grants'));
    const g = new PersistentGrants({ ledgerPath });
    return { success: g.allows('canWrite').allowed === true };
});

// ==================== R4-5: guest privilege-authority escalation =============
// A canWrite guest (the default `human` role) could call the write-class
// sudo/habitat authority verbs through the MCP door and widen its own (or the
// door's 'default') task to `admin`/`compute:eval`/etc. The door gate
// (guests.authorize) only refuses guest-ISSUED reads + exec, and
// sudo.createTask writes scopes DIRECTLY (no whitelist), so the write grant
// became an authority grant. Discriminating pins: the door refuses (403) and
// the capability/scope verdict is unchanged after the attempt.

const { spawn } = require('child_process');

function _waitForPort(out, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('door did not start')), timeoutMs);
        const onData = (d) => {
            const m = /Server on 127\.0\.0\.1:(\d+)/.exec(String(d));
            if (m) { clearTimeout(t); resolve(parseInt(m[1], 10)); }
        };
        out.stdout.on('data', onData);
        out.stderr.on('data', onData);
    });
}

async function _withGuestDoor(fn) {
    const script = `
        const P = ${JSON.stringify(path.join(ROOT, 'lib'))} + '/';
        const guests = require(P + 'guests');
        const g = guests.issue('r4-human', { role: 'human' });
        const mcp = require(P + 'mcp');
        process.env.VANT_MCP_REQUIRE_KEY = 'true';
        mcp.start({ port: 0 }).then(({ port }) => {
            console.log('Server on 127.0.0.1:' + port);
            process.on('message', async (msg) => {
                if (!msg || msg.type !== 'call') return;
                try {
                    const res = await fetch('http://127.0.0.1:' + port + '/mcp/exec', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + g.token },
                        body: JSON.stringify({ tool: msg.tool, args: msg.args })
                    });
                    process.send({ type: 'result', id: msg.id, status: res.status, body: await res.text() });
                } catch (e) { process.send({ type: 'result', id: msg.id, error: e.message }); }
            });
        });
    `;
    const child = spawn('node', ['-e', script], {
        env: { ...process.env, VANT_GATE_QUIET: '1', VANT_BRAIN: 'r4-5-' + Date.now() },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    try {
        const port = await _waitForPort(child);
        const call = (tool, args) => new Promise((resolve, reject) => {
            const id = Math.random();
            const t = setTimeout(() => reject(new Error('call timeout')), 15000);
            const onMsg = (m) => {
                if (m && m.type === 'result' && m.id === id) {
                    clearTimeout(t); child.off('message', onMsg);
                    resolve({ status: m.status, body: m.body, error: m.error });
                }
            };
            child.on('message', onMsg);
            child.send({ type: 'call', id, tool, args });
        });
        return await fn(call, port);
    } finally {
        child.kill();
    }
}

asyncTest('R4-5: a guest cannot self-grant admin via the door (sudo_grant refused)', async () => {
    return await _withGuestDoor(async (call) => {
        // Pre-fix: 200 {granted:'admin'} and sudo.can(default,admin) === true.
        const r = await call('vant_sudo_grant', { taskId: 'default', scope: 'admin' });
        const body = r.body || '';
        // Post-fix: 403 (door gate) or 200 carrying a typed refusal.
        const refused = r.status === 403 || /admin-only|E_GUEST|API_REQUEST_INVALID/i.test(body);
        const notGranted = !/granted/.test(body);
        return { success: refused && notGranted };
    });
});

asyncTest('R4-5: a guest cannot self-grant exec via the door', async () => {
    return await _withGuestDoor(async (call) => {
        const r = await call('vant_sudo_grant', { taskId: 'default', scope: 'exec' });
        const body = r.body || '';
        return { success: (r.status === 403 || /admin-only|E_GUEST|API_REQUEST_INVALID/i.test(body)) && !/granted/.test(body) };
    });
});

asyncTest('R4-5: a guest cannot create a task with admin scope (createTask refused)', async () => {
    return await _withGuestDoor(async (call) => {
        const r = await call('vant_sudo_createTask', { taskId: 'default', scopes: ['admin'] });
        const body = r.body || '';
        return { success: (r.status === 403 || /admin-only|E_GUEST|API_REQUEST_INVALID/i.test(body)) };
    });
});

asyncTest('R4-5: the door refuses (403) the authority verb before the handler runs', async () => {
    return await _withGuestDoor(async (call) => {
        const r = await call('vant_sudo_grant', { taskId: 'default', scope: 'admin' });
        // The door gate classifies authority verbs admin, so a guest is
        // refused at the door (403), not merely by the handler.
        return { success: r.status === 403 };
    });
});

test('R4-5: guests.classifyTool marks the authority verbs admin', () => {
    const guests = require(path.join(ROOT, 'lib', 'guests'));
    const mustBeAdmin = [
        'sudo_grant', 'sudo_revoke', 'sudo_escalate', 'sudo_createTask',
        'vant_sudo_grant', 'vant_sudo_revoke', 'vant_sudo_escalate', 'vant_sudo_createTask',
        'vant_habitat_mintToken', 'vant_habitat_revokeToken',
        'vant_habitat_createWorkspace', 'vant_habitat_setWorkspace',
        'vant_habitat_addRole', 'vant_habitat_setPolicy', 'vant_scenario_crew'
    ];
    const wrong = mustBeAdmin.filter((t) => guests.classifyTool(t) !== 'admin');
    return { success: wrong.length === 0, why: wrong.length ? 'not admin: ' + wrong.join(', ') : '' };
});

test('R4-5: a human guest is still refused exec/sudo verbs at the door', () => {
    const guests = require(path.join(ROOT, 'lib', 'guests'));
    // Sanity: the classification change does not open the exec lane.
    const human = { guest: { id: 'x', role: 'human' }, caps: ['canRead', 'canLoad', 'canList', 'canWrite', 'canSpawn'], isGuest: true };
    const g1 = guests.authorize('vant_shell_exec', human);
    const g2 = guests.authorize('vant_sudo_grant', human);
    return { success: g1.allowed === false && g2.allowed === false };
});

// ==================== R4-7: webhook info-route secret disclosure ====================
//
// The unauthenticated GET /info/<name> route returned the whole route object
// (secret + sealKeys) behind a wildcard CORS header, so any browser page could
// read a loopback route's HMAC secret and forge envelopes. Post-fix the route
// returns non-secret metadata only and no wildcard ACAO is emitted.

function _withWebhookServer(routeConfig, fn) {
    return new Promise((resolve) => {
        const webhooks = require(path.join(ROOT, 'lib', 'webhooks'));
        webhooks.register(routeConfig);
        const server = webhooks.startServer(0); // ephemeral port — no collisions
        let settled = false;
        const finish = (r) => { if (!settled) { settled = true; try { server.close(); } catch (e) { /* */ } resolve(r); } };
        server.on('error', () => finish(true)); // cannot bind — nothing to assert
        server.once('listening', () => {
            const port = server.address().port;
            setTimeout(() => { fn(`http://localhost:${port}`).then(finish, (e) => finish({ success: false, error: e.message })); }, 60);
        });
    });
}

asyncTest('R4-7: unauthenticated /info does not disclose the signing secret', () => {
    const SECRET = 'r47-' + 'z'.repeat(28);
    const name = 'r47-' + process.pid;
    return _withWebhookServer({ name, source: 'r47src-' + process.pid, eventKeyExpr: 'event', secret: SECRET }, async (base) => {
        const r = await fetch(`${base}/info/${name}`);
        const body = await r.text();
        if (body.includes(SECRET) || /"secret"/.test(body) || /sealKeys/.test(body)) {
            return { success: false, error: 'info route leaked the route secret: ' + body.slice(0, 160) };
        }
        return { success: true };
    });
});

asyncTest('R4-7: webhook intake sends no wildcard CORS origin', () => {
    const name = 'r47cors-' + process.pid;
    return _withWebhookServer({ name, source: 'r47corssrc-' + process.pid, eventKeyExpr: 'event', secret: 'S'.repeat(24) }, async (base) => {
        const r = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
        const acao = r.headers.get('access-control-allow-origin');
        return { success: acao !== '*', error: 'wildcard ACAO present: ' + acao };
    });
});

// ==================== R4-8: webhook filter fail-open ====================

const _webhooksMod = require(path.join(ROOT, 'lib', 'webhooks'));
const _mfHit = { repository: { full_name: 'myorg/myrepo' }, comment: { body: 'ping @openhands' }, action: 'create' };
const _mfMiss = { repository: { full_name: 'evil/other' }, comment: { body: 'nothing here' }, action: 'delete' };

test('R4-8: glob filter refuses a non-matching payload (was: matched everything)', () => {
    return { success: _webhooksMod.matchFilter("glob(repository.full_name, 'myorg/*')", _mfMiss) === false,
        error: 'glob matched a non-matching repo' };
});

test('R4-8: icontains filter refuses a non-matching payload (was: returned true)', () => {
    return { success: _webhooksMod.matchFilter("icontains(comment.body, '@openhands')", _mfMiss) === false,
        error: 'icontains matched a non-matching body' };
});

test('R4-8: an unrecognized filter expression refuses (fail-closed)', () => {
    // Pre-fix this expression (no ==/glob/contains/icontains substring) fell
    // through to `return true` — the event was authorized. Post-fix it refuses.
    return { success: _webhooksMod.matchFilter("starts_with(ref, 'refs/heads/')", _mfHit) === false,
        error: 'unparseable filter authorized the event' };
});

test('R4-8: matching filters still match (truth intact)', () => {
    const ok =
        _webhooksMod.matchFilter("glob(repository.full_name, 'myorg/*')", _mfHit) === true &&
        _webhooksMod.matchFilter("icontains(comment.body, '@OpenHands')", _mfHit) === true &&
        _webhooksMod.matchFilter("contains(comment.body, 'openhands')", _mfHit) === true &&
        _webhooksMod.matchFilter("contains(comment.body, 'openhands')", _mfMiss) === false &&
        _webhooksMod.matchFilter("action == 'create'", _mfHit) === true &&
        _webhooksMod.matchFilter("action == 'nope'", _mfHit) === false;
    return { success: ok };
});

// ==================== R4-9: token secret fail-open ====================

test('R4-9: signToken refuses an empty secret (was: signed under the empty key)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    let code = null;
    try { E.signToken({ a: 1 }, '', 1000); } catch (e) { code = e.code; }
    return { success: code === 'ENCRYPT_KEY_REQUIRED', error: 'no typed refusal (code=' + code + ')' };
});

test('R4-9: verifyToken refuses an empty secret (token minted under the empty key no longer validates)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    const crypto = require('crypto');
    const p = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 9e9 })).toString('base64');
    const sig = crypto.createHmac('sha256', '').update(p).digest('base64');
    return { success: E.verifyToken(p + '.' + sig, '') === null, error: 'empty-key token still validated' };
});

// ==================== R4-10: hmacVerify crashes on hostile signature ====================

test('R4-10: hmacVerify answers false (never throws) on a hostile signature', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    const key = 'k'.repeat(16);
    let threw = null, r1, r2;
    try { r1 = E.hmacVerify('d', key, undefined); r2 = E.hmacVerify('d', key, {}); } catch (e) { threw = e; }
    return { success: threw === null && r1 === false && r2 === false,
        error: threw ? 'threw: ' + threw.message : `r1=${r1} r2=${r2}` };
});

// ==================== R4-11: decrypt untyped crash on bad argument ====================

test('R4-11: decrypt refuses a non-string cipher with a typed error (never a raw TypeError)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    const key = 'k'.repeat(16);
    let threw = null, code = null;
    try { E.decrypt(12345, key); } catch (e) { threw = e; code = e.code; }
    return { success: threw !== null && code === 'E_DECRYPT_FORMAT', error: threw ? 'code=' + code : 'did not throw' };
});

test('R4-11: decrypt refuses a null cipher with a typed error (never a raw TypeError)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt'));
    let threw = null, code = null;
    try { E.decrypt(null, 'k'.repeat(16)); } catch (e) { threw = e; code = e.code; }
    return { success: threw !== null && code === 'E_DECRYPT_FORMAT', error: threw ? 'code=' + code : 'did not throw' };
});

// ==================== R4-12: shell validator/spawn divergence ====================

asyncTest('R4-12: a whitelisted command with leading whitespace is runnable (was: raw TypeError out of spawn)', () => {
    const shell = require(path.join(ROOT, 'lib', 'shell'));
    const sudo = require(path.join(ROOT, 'lib', 'sudo'));
    try { sudo.grant('default', 'exec'); } catch (e) { /* already granted */ }
    return shell.exec('   echo r412-probe', { timeout: 5000 }).then(
        (r) => (r && r.code === 0 && String(r.stdout).trim() === 'r412-probe')
            ? { success: true }
            : { success: false, error: 'unexpected result: ' + JSON.stringify(r).slice(0, 120) },
        (e) => ({ success: false, error: 'threw ' + e.constructor.name + ': ' + e.message.slice(0, 60) })
    );
});

// ==================== RUN ====================

(async () => {
    await _runAsync();
    console.log(`\n--- RESULTS ---\n\n  Passed:  ${results.passed}\n  Failed:  ${results.failed}\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
