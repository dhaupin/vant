#!/usr/bin/env node
/**
 * Audit Round 7 — discriminating pins (MCP auth + guest authority walk).
 *
 * Every pin here FAILS against the pre-fix code and PASSES after the fix;
 * none is a restatement of existing coverage:
 *
 * - R7-1: the `auth_create` door verb returned the LIVE `Auth` instance
 *         (`_auth.create(...)`). That object carries `options.tokenSecret`
 *         (the process token-signing key), so any caller of the verb could
 *         read the secret and forge a token for ANY identity — verified by
 *         the very `verifyToken` the door trusts. Fixed: the verb mints a
 *         token and returns `{token,userId,roles}`, never the instance; the
 *         verb is also classified an authority tool (guest-refused).
 * - R7-2: `auth_require` checked `if (!verified)`, but `verifyToken`
 *         RESOLVES to a verdict object (`{valid:false,...}`), never null —
 *         a truthy object — so an INVALID token answered `allowed:true`.
 *         Fixed: read `verified.valid !== true`.
 * - R7-3: `trust_record` / `trust_setRequired` and the `teams_create*` /
 *         `teams_assign` verbs are the SAME authority seam the R4-5
 *         blocklist exists to close, but were never listed. A default
 *         `human` guest (canWrite+canSpawn) could inflate its OWN trust
 *         score (0.5 -> 1.0 in one call — trust is the tally/can() currency)
 *         or drop a threshold to 0, and could create orgs/depts/teams/roles.
 *         Fixed: classified admin at the door AND guarded in the handlers.
 *
 * Run: node test/audit-round7.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

process.env.VANT_TOKEN_SECRET = process.env.VANT_TOKEN_SECRET || 'round7-signing-key-32-bytes-long!!!';

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

const SECRET = process.env.VANT_TOKEN_SECRET;

// ==================== R7-1: auth_create must not leak the Auth instance =====
// Pre-fix `auth_create` returned `_auth.create(userId, roles)` — the live
// instance, whose `options.tokenSecret` is the process signing key. These
// pins call the tool the same way the door does and assert the returned
// payload is a minted credential, not the object.

asyncTest('R7-1a: auth_create result never carries the token signing secret', async () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    const r = await mcp.execute('auth_create', { userId: 'r7-alice', roles: ['admin'] });
    const ser = JSON.stringify(r);
    // Pre-fix: ser contains "options":{"tokenSecret":"<SECRET>"...}
    if (ser.includes(SECRET)) return { success: false, error: 'the signing secret leaked in the result' };
    return { success: true };
});

asyncTest('R7-1b: auth_create result is a minted token, not a live instance', async () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    const r = await mcp.execute('auth_create', { userId: 'r7-bob', roles: ['user'] });
    // A live Auth instance would expose `options` / `_failedAttempts`.
    if (r && (r.options || r._failedAttempts)) return { success: false, error: 'returned a live Auth instance' };
    const hasToken = r && typeof r.token === 'string' && r.token.includes('.');
    return hasToken ? { success: true } : { success: false, error: 'no token minted: ' + JSON.stringify(r).slice(0, 80) };
});

asyncTest('R7-1c: the minted token verifies for the requested identity (no regression)', async () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    const r = await mcp.execute('auth_create', { userId: 'r7-carol', roles: ['admin'] });
    const v = auth.verifyToken(r && r.token);
    return (v && v.valid === true && v.payload && v.payload.userId === 'r7-carol')
        ? { success: true }
        : { success: false, error: 'token did not verify: ' + JSON.stringify(v) };
});

// ==================== R7-2: auth_require must not fail open ==================
// `verifyToken` resolves to `{valid:false,reason}` for a bad token — truthy —
// so the old `if (!verified)` answered `allowed:true`. Read the verdict field.

asyncTest('R7-2a: auth_require refuses a garbage token (no fail-open)', async () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    const r = await mcp.execute('auth_require', { token: 'not-a-real-token' });
    // Pre-fix: {allowed:true,userId:undefined}
    return (r && r.allowed === false)
        ? { success: true }
        : { success: false, error: 'failed open: ' + JSON.stringify(r) };
});

asyncTest('R7-2b: auth_require still allows a valid token (no over-block)', async () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    const auth = require(path.join(ROOT, 'lib', 'auth'));
    const inst = new auth.Auth();
    const tok = inst.generateToken('r7-dave', { role: 'user' });
    const r = await mcp.execute('auth_require', { token: tok });
    return (r && r.allowed === true && r.userId === 'r7-dave')
        ? { success: true }
        : { success: false, error: 'valid token refused: ' + JSON.stringify(r) };
});

// ==================== R7-3: guest authority seam (trust + teams) ===========
// The same authority class R4-5 closed for sudo/habitat, but never listed for
// trust/teams. Classified admin at the door AND guarded in the handlers.

const R7_AUTHORITY = [
    'trust_record', 'trust_setRequired',
    'teams_createOrg', 'teams_createDept', 'teams_createTeam', 'teams_createRole', 'teams_assign',
    'auth_create'
];

test('R7-3a: guests.classifyTool marks the trust/teams/auth authority verbs admin', () => {
    const guests = require(path.join(ROOT, 'lib', 'guests'));
    const wrong = R7_AUTHORITY.filter((t) => guests.classifyTool(t) !== 'admin');
    return wrong.length === 0 ? { success: true } : { success: false, error: 'not admin: ' + wrong.join(', ') };
});

test('R7-3b: a default human guest is refused the authority verbs at the door', () => {
    const guests = require(path.join(ROOT, 'lib', 'guests'));
    const human = { guest: { id: 'x', role: 'human' }, caps: ['canRead', 'canLoad', 'canList', 'canWrite', 'canSpawn'], isGuest: true };
    const opened = R7_AUTHORITY.filter((t) => guests.authorize(t, human).allowed === true);
    return opened.length === 0 ? { success: true } : { success: false, error: 'allowed: ' + opened.join(', ') };
});

test('R7-3c: trust_record is admin-classified (guest cannot self-inflate trust)', () => {
    const guests = require(path.join(ROOT, 'lib', 'guests'));
    return guests.classifyTool('trust_record') === 'admin'
        ? { success: true }
        : { success: false, error: 'trust_record is not admin' };
});

test('R7-3d: trust_setRequired is admin-classified (guest cannot drop a threshold)', () => {
    const guests = require(path.join(ROOT, 'lib', 'guests'));
    return guests.classifyTool('trust_setRequired') === 'admin'
        ? { success: true }
        : { success: false, error: 'trust_setRequired is not admin' };
});

// ==================== door-level guest reachability (end-to-end) ============
// Spawn a real door with a real `human` guest token and prove the authority
// verbs are refused (403) BEFORE the handler runs. Pre-fix these answered 200
// and mutated state (trust inflated / org created / secret leaked).

const { spawn } = require('child_process');

function _waitForPort(out, timeoutMs = 20000) {
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
        const g = guests.issue('r7-human', { role: 'human' });
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
        env: { ...process.env, VANT_GATE_QUIET: '1', VANT_BRAIN: 'r7-' + Date.now() },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    try {
        const port = await _waitForPort(child);
        const call = (tool, args) => new Promise((resolve, reject) => {
            const id = Math.random();
            const t = setTimeout(() => reject(new Error('call timeout')), 20000);
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

const _refused = (r) => r.status === 403 || /E_GUEST_ADMIN|admin-only|API_REQUEST_INVALID/i.test(r.body || '');

asyncTest('R7-3e: a guest cannot self-inflate trust via the door (trust_record refused)', async () => {
    return await _withGuestDoor(async (call) => {
        const r = await call('trust_record', { entityId: 'guest:x', type: 'selfboost', positive: true, value: 1.0 });
        // Pre-fix: 200 {"result":{"score":1,"delta":1}}
        return { success: _refused(r) };
    });
});

asyncTest('R7-3f: a guest cannot drop a trust threshold via the door (trust_setRequired refused)', async () => {
    return await _withGuestDoor(async (call) => {
        const r = await call('trust_setRequired', { permission: 'dangerous:exec', minTrust: 0 });
        return { success: _refused(r) };
    });
});

asyncTest('R7-3g: a guest cannot create an org via the door (teams_createOrg refused)', async () => {
    return await _withGuestDoor(async (call) => {
        const r = await call('teams_createOrg', { name: 'attacker-org' });
        return { success: _refused(r) };
    });
});

asyncTest('R7-3h: a guest cannot create a role via the door (teams_createRole refused)', async () => {
    return await _withGuestDoor(async (call) => {
        const r = await call('teams_createRole', { name: 'superuser', permissions: ['admin'] });
        return { success: _refused(r) };
    });
});

asyncTest('R7-1d: a guest cannot mint an auth credential via the door (auth_create refused)', async () => {
    return await _withGuestDoor(async (call) => {
        const r = await call('auth_create', { userId: 'attacker', roles: ['admin'] });
        // Pre-fix: 200 and the body carried the live Auth instance (secret leak).
        const leaked = (r.body || '').includes(SECRET);
        return { success: _refused(r) && !leaked };
    });
});

// ==================== RUN ====================

(async () => {
    await _runAsync();
    console.log(`\n--- RESULTS ---\n\n  Passed:  ${results.passed}\n  Failed:  ${results.failed}\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
