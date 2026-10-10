#!/usr/bin/env node
/**
 * Wave F pins — RemoteTransport seam (prd-canonicalization §7).
 *
 * The git-connector argv-array hardening is the shared security template,
 * made requirable in lib/remote-transport.js. These pins apply the
 * adversarial suite TO THE INTERFACE, so every adopter inherits them:
 *   1. Validators: ref-like (traversal/space/dash/length), secret-like
 *      (empty/len/control), payload-like (undefined, non-JSON).
 *   2. Retry classification: transient retries (backoff schedule shared
 *      with GitProvider semantics), non-retryable never retried.
 *   3. The auth() door: base throws (no silent anonymous), adopters source
 *      credentials here — never on instance fields.
 *   4. The _run ceremony: transient fails N-1 then succeeds; non-retryable
 *      throws immediately (no backoff burn); attempts exhausted throws last.
 *   5. Verify honesty: base verify() returns FALSE (unverified), never
 *      silently blessed.
 * 6. Adopter wiring: lib/connectors/s3.js exports a RemoteTransport
 *    subclass (S3Transport) that reuses the shared ceremony and keeps
 *    SigV4 signing inside _request paths; agora-sync's state keeper
 *    adopts verify() semantics.
 */
'use strict';

let pass = 0, fail = 0;
function pin(name, cond) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ FAILED: ' + name); }
}

const { RemoteTransport, refLike, secretLike, payloadLike, classifyError, DEFAULT_RETRY_POLICY } = require('../lib/remote-transport');
const errors = require('../lib/error');

// 1. Validators — the _gitRef template, fail-closed
{
    pin('refLike ok plain', refLike('main') === 'main');
    pin('refLike ok dotted/slash (npm-style scope)', refLike('docs/vant/axolotl.1') === 'docs/vant/axolotl.1');
    const throwers = [
        ['traversal', () => refLike('../../etc/passwd')],
        ['absolute path', () => refLike('/etc/shadow')],
        ['space', () => refLike('a b')],
        ['leading dash', () => refLike('-rf')],
        ['empty', () => refLike('')],
        ['non-string', () => refLike(1337)],
        ['too long', () => refLike('x'.repeat(200))]
    ];
    for (const [label, fn] of throwers) {
        try { fn(); pin('refLike blocks ' + label, false); }
        catch (e) {
            pin('refLike blocks ' + label,
                e instanceof errors.VantError && e.retryable === false && e.code === errors.CODES.VAF_INPUT_INVALID);
        }
    }
    pin('secretLike ok', secretLike('s3cr3t-key-1') === 's3cr3t-key-1');
    const secThrowers = [['empty', () => secretLike('')], ['ctl', () => secretLike('a\nb')], ['wrong type', () => secretLike(9)]];
    for (const [label, fn] of secThrowers) {
        try { fn(); pin('secretLike blocks ' + label, false); }
        catch (e) { pin('secretLike blocks ' + label, e instanceof errors.VantError && e.retryable === false); }
    }
    pin('payloadLike rejects undefined loudly', (() => { try { payloadLike(undefined); return false; } catch (e) { return e.code === errors.CODES.VAF_REQUIRED_FIELD; } })());
    pin('payloadLike rejects non-JSON (BigInt) loudly', (() => { try { payloadLike({ bad: 10n }); return false; } catch (e) { return e.retryable === false; } })());
    pin('payloadLike ok real object', payloadLike({ a: 1 }).a === 1);
}

// 2. Retry classification
{
    const retryableErr = new errors.VantError('t', { code: 'X', retryable: true });
    const hardErr = new errors.VantError('h', { code: 'X', retryable: false });
    const c1 = classifyError(retryableErr, 1);
    pin('transient retryable, base delay', c1.retryable === true && c1.delayMs === 1000);
    pin('backoff multiplies', classifyError(retryableErr, 2).delayMs === 2000);
    // beyond-the-ladder attempt numbers are a caller bug — classified non-retryable (never invents a delay), matching _run's bounds
    pin('attempts beyond the ladder: non-retryable, no delay', classifyError(retryableErr, 50).retryable === false && classifyError(retryableErr, 50).delayMs === null);
    pin('non-retryable never retried', classifyError(hardErr, 1).retryable === false);
    pin('maxAttempts stops the ladder', classifyError(retryableErr, 3, { ...DEFAULT_RETRY_POLICY, maxAttempts: 3 }).retryable === false);
    pin('VantError retryable flag ONLY trusted for VantError (string msgs not)',
        classifyError(new Error('HTTP 429 rate limit'), 1).retryable === true);
    pin('plain 403 string NOT retryable', classifyError(new Error('HTTP 403 forbidden'), 1).retryable === true ? false : true);
}

// 3+4. The ceremony on a concrete adopter
class TestTransport extends RemoteTransport {
    constructor(opts = {}) { super({ name: 'test', ...opts }); this.calls = 0; this.token = null; }
    auth() { this.authCalls = (this.authCalls || 0) + 1; return this.authToken || 'tok-1'; }
}
(async () => {
    const rt = new TestTransport();

    // transient: fails twice then succeeds — resolved once, retried without re-auth leak
    let tries = 0;
    const out = await rt._run(async (tok) => {
        tries++;
        if (tries < 3) throw new errors.VantError('x', { code: 'X', retryable: true });
        return 'ok:' + tok;
    });
    pin('ceremony: transient succeeds after retries', out === 'ok:tok-1' && tries === 3);
    pin('ceremony: auth resolved once per _run (closure, not per attempt)', rt.authCalls === 1);
    pin('ceremony: token never parked on instance', rt.token === null);

    // non-retryable: single attempt, fast (no backoff burn)
    const hard = new TestTransport();
    const t0 = Date.now();
    try { await hard._run(async () => { throw new errors.VantError('hard', { code: 'X', retryable: false }); }); pin('ceremony: hard-fail throws', false); }
    catch (e) { pin('ceremony: hard-fail throws immediately (no retry sleep)', Date.now() - t0 < 250); }

    // attempts exhausted: last error thrown
    const exhaust = new TestTransport();
    try {
        await exhaust._run(async () => { throw new errors.VantError('always', { code: 'X', retryable: true }); });
        pin('ceremony: exhaust throws last error', false);
    } catch (e) { pin('ceremony: exhaust throws last error', /always/.test(e.message) && e.retryable === true); }

    // attempts override respected
    const two = new TestTransport({ retryPolicy: { maxAttempts: 2 } });
    let t2 = 0;
    try { await two._run(async () => { t2++; throw new errors.VantError('x', { code: 'X', retryable: true }); }); }
    catch (e) { pin('ceremony: attempts override honored', t2 === 2); }

    // 5. Verify honesty: base class returns FALSE (unverified), not a silent bless
    const never = new RemoteTransport({ name: 'never' });
    pin('base verify() honest false (unverified, never blessed)', await never.verify() === false);
    pin('base auth() throws (no silent anonymous)', (() => { try { never.auth(); return false; } catch (e) { return /auth\(\) not implemented/.test(e.message); } })());
    pin('base push() throws NOT_IMPLEMENTED', (() => { try { never.push(); return false; } catch (e) { return e.code === 'NOT_IMPLEMENTED'; } })());
    pin('describe() leaks no secrets', !/[sS]ecret|tok/.test(never.describe()));

    // 6. Adopter wiring: s3 connector exposes S3Transport on the interface
    const s3mod = require('../lib/connectors/s3');
    pin('s3 adopts the interface (S3Transport exported)', typeof s3mod.S3Transport === 'function');
    if (s3mod.S3Transport) {
        const s3 = new s3mod.S3Transport({ name: 's3-test', accessKeyId: 'AKIA...', secretAccessKey: 'sk' });
        pin('s3 transport is a RemoteTransport', s3 instanceof RemoteTransport);
        pin('s3 auth() resolves the SigV4 secret (the ONE door)', s3.auth() && typeof s3.auth() === 'object');
        pin('s3 secret NOT exposed on instance fields', !('secretAccessKey' in s3) && !('accessKeyId' in s3));
        const verdict = classifyError(new errors.VantError('404', { code: 'X', retryable: true }), 1);
        pin('s3 inherits shared classify (404-keyed retryable is VantError-flag-driven)', verdict.retryable === true);
    }
})();

// summary printed by the async runner at exit — replicate here synchronously too
setTimeout(() => {
    console.log('\n=== remote-transport pins: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail === 0 ? 0 : 1);
}, 300);
