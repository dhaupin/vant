#!/usr/bin/env node
/**
 * Audit Round 5 — discriminating pins (relay/seal + envelope + token frontiers).
 *
 * Every pin here FAILS against the pre-fix code and PASSES after the fix;
 * none is a restatement of existing coverage:
 *
 * - R5-1: lib/encrypt.hmacSign threw a raw ERR_INVALID_ARG_TYPE on a missing
 *         /non-string key, and hmacVerify threw it on a non-string `data`.
 *         Every caller (crew-bus send, messaging signEnvelope, the relay
 *         seal lane) got an uncoded crash out of the HMAC canon. Fixed:
 *         hmacSign refuses typed (ENCRYPT_KEY_REQUIRED); hmacVerify is total
 *         (unverifiable input answers false, never throws).
 * - R5-2: lib/habitat.context() called encrypt.verifyToken(token) with NO
 *         secret, so verification always returned null and every token —
 *         even a legitimately signed one — silently resolved to anonymous.
 *         The token->identity path was dead code that looked live. Fixed:
 *         thread VANT_TOKEN_SECRET (the key lib/auth.js signs with) and fail
 *         closed to anonymous when no secret is configured.
 * - R5-3: lib/messaging.verifyEnvelope threw a raw TypeError on an envelope
 *         that cannot JSON-serialize (BigInt/cycle). The security-critical
 *         verifier must be total. Fixed: unverifiable envelope -> false;
 *         signEnvelope names its refusal typed.
 * - R5-4: lib/rls.middleware parsed the Authorization header with
 *         `.replace('Bearer ', '')`, which stripped the scheme ANYWHERE in
 *         the string (`Basic <tok>` -> `<tok>`) and left scheme-less values
 *         whole. Fixed: accept only the exact `Bearer <token>` form.
 *
 * Run: node tests/audit-round5.test.js
 */

const path = require('path');
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

const KEY = 'round5-key-32-bytes-long!!!!!!!!';

// ==================== R5-1: hmacSign/hmacVerify total ====================

test('R5-1a: hmacSign refuses a missing/empty/non-string key with a coded error', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt')).default;
    const cases = [undefined, null, '', 42];
    for (const k of cases) {
        let threw = null, code = null;
        try { E.hmacSign('data', k); } catch (e) { threw = e; code = e.code; }
        if (!threw) return { success: false, error: 'no throw for key=' + String(k) };
        if (code !== 'ENCRYPT_KEY_REQUIRED') return { success: false, error: 'key=' + String(k) + ' code=' + code };
    }
    return { success: true };
});

test('R5-1b: hmacVerify is total — a non-string data answers false (was: raw TypeError)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt')).default;
    let threw = null, r;
    try { r = E.hmacVerify({ a: 1 }, KEY, 'aabb'); } catch (e) { threw = e; }
    if (threw) return { success: false, error: 'threw ' + threw.constructor.name };
    if (r !== false) return { success: false, error: 'expected false, got ' + JSON.stringify(r) };
    return { success: true };
});

test('R5-1c: a legitimate hmacSign/hmacVerify round-trip still verifies (no regression)', () => {
    const E = require(path.join(ROOT, 'lib', 'encrypt')).default;
    const sig = E.hmacSign('payload', KEY);
    return E.hmacVerify('payload', KEY, sig) === true ? { success: true } : { success: false, error: 'valid sig rejected' };
});

// ==================== R5-3: verifyEnvelope total ====================

test('R5-3a: verifyEnvelope answers false on a non-serializable envelope (was: raw TypeError)', () => {
    const M = require(path.join(ROOT, 'lib', 'messaging'));
    let threw = null, r;
    try { r = M.verifyEnvelope({ payload: 1n }, KEY, 'deadbeef'); } catch (e) { threw = e; }
    if (threw) return { success: false, error: 'threw ' + threw.constructor.name };
    if (r !== false) return { success: false, error: 'expected false, got ' + JSON.stringify(r) };
    return { success: true };
});

test('R5-3b: signEnvelope names a non-serializable refusal (E_INPUT, not a raw TypeError)', () => {
    const M = require(path.join(ROOT, 'lib', 'messaging'));
    let threw = null, code = null;
    try { M.signEnvelope({ payload: 1n }, KEY); } catch (e) { threw = e; code = e.code; }
    if (!threw) return { success: false, error: 'did not throw' };
    return code === 'E_INPUT' ? { success: true } : { success: false, error: 'code=' + code };
});

test('R5-3c: a legitimate envelope sign/verify round-trip still verifies (no regression)', () => {
    const M = require(path.join(ROOT, 'lib', 'messaging'));
    const env = M.makeEnvelope('r5.topic', { hello: 'world' }, { from: 'node-a' });
    const sig = M.signEnvelope(env, KEY);
    return M.verifyEnvelope(env, KEY, sig) === true ? { success: true } : { success: false, error: 'valid envelope rejected' };
});

// ==================== R5-2: habitat.context token path ====================

asyncTest('R5-2a: habitat.context verifies a token signed with VANT_TOKEN_SECRET (was: always anonymous)', () => {
    process.env.VANT_TOKEN_SECRET = KEY;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'config'))];
    const E = require(path.join(ROOT, 'lib', 'encrypt')).default;
    const habitat = require(path.join(ROOT, 'lib', 'habitat'));
    const h = habitat.getShared();
    // A token minted under the CONFIGURED secret must resolve to its identity.
    const tok = E.signToken({ userId: 'r5-alice', roles: ['admin'], workspace: 'r5-ws' }, KEY);
    return h.context(tok).then((ctx) => {
        if (ctx.userId !== 'r5-alice') return { success: false, error: 'userId=' + ctx.userId + ' (token path dead)' };
        if (!ctx.roles.includes('admin')) return { success: false, error: 'roles=' + JSON.stringify(ctx.roles) };
        return { success: true };
    });
});

asyncTest('R5-2b: habitat.context fails CLOSED — a wrong-secret forgery and garbage stay anonymous', () => {
    process.env.VANT_TOKEN_SECRET = KEY;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'config'))];
    const E = require(path.join(ROOT, 'lib', 'encrypt')).default;
    const habitat = require(path.join(ROOT, 'lib', 'habitat'));
    const h = habitat.getShared();
    const forged = E.signToken({ userId: 'r5-mallory', roles: ['admin'] }, 'attacker-secret-000000000000000000');
    return Promise.all([h.context(forged), h.context('not-a-token')]).then(([f, g]) => {
        if (f.userId !== 'anonymous') return { success: false, error: 'forgery accepted as ' + f.userId };
        if (g.userId !== 'anonymous') return { success: false, error: 'garbage accepted as ' + g.userId };
        return { success: true };
    });
});

// ==================== R5-4: rls.middleware Bearer parse ====================
//
// Observed through the REAL middleware + REAL habitat.context (a signed token
// under VANT_TOKEN_SECRET), so the assertion is on authentication, not on an
// intercepted argument.

function _bearerReq(headerValue) {
    const rls = require(path.join(ROOT, 'lib', 'rls'));
    // rls.context() short-circuits to anonymous while its habitat singleton is
    // unclaimed (the first request through a fresh process). Claim it first so
    // the middleware actually reaches habitat.context() — otherwise every
    // header would read anonymous and the pin would not discriminate.
    rls.getHabitat();
    const handler = rls.middleware({ resource: 'r5', mode: 'read' });
    const req = { headers: headerValue === undefined ? {} : { authorization: headerValue } };
    const res = { status: () => ({ json: () => {} }), json: () => {} };
    // checkRead may 403 (RLS) but req.userCtx is attached first — we read that.
    return handler(req, res, () => {}).then(() => req);
}

asyncTest('R5-4a: a scheme-less Authorization value does NOT authenticate (was: treated as a Bearer token)', async () => {
    process.env.VANT_TOKEN_SECRET = KEY;
    const E = require(path.join(ROOT, 'lib', 'encrypt')).default;
    const tok = E.signToken({ userId: 'r5-schemeless', roles: ['admin'] }, KEY);
    const req = await _bearerReq(tok); // raw token, NO scheme
    const id = req.userCtx && req.userCtx.userId;
    if (id === 'r5-schemeless') return { success: false, error: 'scheme-less token authenticated as ' + id };
    if (id !== 'anonymous') return { success: false, error: 'unexpected ctx ' + id };
    return { success: true };
});

asyncTest('R5-4b: a lowercase `bearer` scheme still extracts the token (RFC: scheme is case-insensitive)', async () => {
    process.env.VANT_TOKEN_SECRET = KEY;
    const E = require(path.join(ROOT, 'lib', 'encrypt')).default;
    const tok = E.signToken({ userId: 'r5-lower', roles: ['admin'] }, KEY);
    const req = await _bearerReq('bearer ' + tok);
    const id = req.userCtx && req.userCtx.userId;
    return id === 'r5-lower' ? { success: true } : { success: false, error: 'ctx=' + id };
});

asyncTest('R5-4c: an exact `Bearer <token>` header still authenticates (no regression)', async () => {
    process.env.VANT_TOKEN_SECRET = KEY;
    const E = require(path.join(ROOT, 'lib', 'encrypt')).default;
    const tok = E.signToken({ userId: 'r5-exact', roles: ['admin'] }, KEY);
    const req = await _bearerReq('Bearer ' + tok);
    const id = req.userCtx && req.userCtx.userId;
    return id === 'r5-exact' ? { success: true } : { success: false, error: 'ctx=' + id };
});

// ==================== RUN ====================

(async () => {
    await _runAsync();
    console.log(`\n--- RESULTS ---\n\n  Passed:  ${results.passed}\n  Failed:  ${results.failed}\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
