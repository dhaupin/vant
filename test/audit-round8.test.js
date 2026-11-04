#!/usr/bin/env node
/**
 * Audit Round 8 — durable webhook replay dedupe (the round-4 residual fixed).
 *
 * Every pin here FAILS against the pre-fix code and PASSES after the fix.
 *
 * - R8-1: pass-42's replay dedupe (`lib/webhooks.js` `replaySeen`) was a
 *         MODULE-ONLY Map. Any restart forgot every seen signature, so a
 *         captured signed request replayed cleanly (ok:true) after the
 *         process died. Pins A/B are two child processes sharing one ledger:
 *         A sees 26 envelopes, dies; B (fresh module) must refuse the same
 *         signature 409. Pre-fix: B accepted (no hydration).
 * - R8-2: ts-less sources had NO freshness half at all (the ts check skips
 *         them), and forgetting had no horizon beyond the 5000-pool. Now
 *         retained entries are remembered + RE-refused for a TTL from FIRST
 *         delivery (default 24h), and rows older than the TTL are forgotten
 *         (the tl;ds freshness horizon, TNTC the pre-fix forever-replay).
 *         Pin B reads a seeded ledger: a 1h-old stamp must 409, a 25h-old
 *         stamp may pass again. Pre-fix: both accepted (nothing hydrated).
 * - R8-3: the new config getters (webhookReplayLedger/webhookReplayTtlMs)
 *         — defaults, clamping, override plumbing. Pre-fix: getters absent.
 * - R8-4: hydration must not TRUST the ledger blindly — future-stamped
 *         entries are skipped, and swept-eligible (past-TTL) rows are never
 *         re-persisted at flush. Asserted against the flushed FILE contents.
 *
 * Run: node test/audit-round8.test.js
 */

const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');

process.env.VANT_TOKEN_SECRET = process.env.VANT_TOKEN_SECRET || 'round8-signing-key-32-bytes-long!!!';

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

function _child(scriptBody, env, waitMs = 12000) {
    const r = cp.spawnSync(process.execPath, ['-e', scriptBody], {
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: waitMs
    });
    if (r.status !== 0) throw new Error(`child exited ${r.status}: ${(r.stderr || '').slice(0, 300)}`);
    return r.stdout;
}

// ==== R8-1: the dedupe survives a restart via the durable ledger ============

asyncTest('R8-1a: restart pin — child A records, dies; fresh child B refuses the same signature 409', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r8-a-'));
    const ledger = path.join(tmp, 'webhook-replay.json');
    const route = 'r8-restart';
    // Child A: fresh module, 26 inserts (dirty>=25 forces the throttled flush), exit.
    _child(`
        process.env.VANT_WEBHOOK_REPLAY_LEDGER = ${JSON.stringify(ledger)};
        const webhooks = require(${JSON.stringify(path.join(ROOT, 'lib/webhooks.js'))});
        for (let i = 1; i <= 26; i++) {
            const r = webhooks._replayCheck(${JSON.stringify(route)}, {}, 'r8-sig-' + i);
            if (!r.ok) process.exit(3);
        }
        console.log('ok');`, {});
    // Child B: fresh module, hydrates from the ledger, same signature must 409.
    const out = _child(`
        process.env.VANT_WEBHOOK_REPLAY_LEDGER = ${JSON.stringify(ledger)};
        const webhooks = require(${JSON.stringify(path.join(ROOT, 'lib/webhooks.js'))});
        const r = webhooks._replayCheck(${JSON.stringify(route)}, {}, 'r8-sig-1');
        console.log(JSON.stringify({ ok: r.ok, code: r.code || null }));`, {});
    const verdict = JSON.parse(String(out).trim().split('\n').reverse()[0]);
    if (verdict.ok !== false || verdict.code !== 409) {
        return { success: false, error: 'replay ACCEPTED after restart (pre-fix behavior): ' + JSON.stringify(verdict) };
    }
    return true;
});

asyncTest('R8-1b: the ledger file actually exists in tmp (never the repo tree — hermeticity)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r8-b-'));
    const ledger = path.join(tmp, 'webhook-replay.json');
    _child(`
        process.env.VANT_WEBHOOK_REPLAY_LEDGER = ${JSON.stringify(ledger)};
        const webhooks = require(${JSON.stringify(path.join(ROOT, 'lib/webhooks.js'))});
        for (let i = 1; i <= 26; i++) {
            if (!webhooks._replayCheck('evt-r8-b', {}, 'r8b-sig-' + i).ok) process.exit(3);
        }
        console.log('ok');`, {});
    if (!fs.existsSync(ledger)) return { success: false, error: 'ledger was never flushed to the override path' };
    const nova = fs.readdirSync(process.cwd()).filter((f) => f.includes('webhook-replay'));
    if (nova.length) return { success: false, error: 'ledger leaked into the repo cwd: ' + nova.join(',') };
    return true;
});

// ==== R8-2: the TTL horizon for ts-less sources =============================

asyncTest('R8-2: hydration re-refuses a durably-stamped ts-less signature; past-TTL stamps are forgotten', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r8-c-'));
    const route = 'r8-ttl';
    const nowMs = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    fs.writeFileSync(path.join(tmp, 'webhook-replay.json'), JSON.stringify({
        [route]: { 'r8-fresh-sig': nowMs - (1 * 60 * 60 * 1000), 'r8-ancient-sig': nowMs - (25 * DAY) }
    }));
    // fresh require; BOTH probed new-signature style in one child (separate routes
    // would collide with hydration; one route, two sigs, two calls is honest here).
    const out = _child(`
        process.env.VANT_WEBHOOK_REPLAY_LEDGER = ${JSON.stringify(path.join(tmp, 'webhook-replay.json'))};
        const webhooks = require(${JSON.stringify(path.join(ROOT, 'lib/webhooks.js'))});
        const fresh = webhooks._replayCheck(${JSON.stringify(route)}, {}, 'r8-fresh-sig');
        const ancient = webhooks._replayCheck(${JSON.stringify(route)}, {}, 'r8-ancient-sig');
        console.log('RES ' + JSON.stringify({
            freshRefused: !fresh.ok,
            ancientAllowed: ancient.ok === true
        }));`, {});
    const res = JSON.parse(String(out).trim().split('\n').reverse()[0].replace('RES ', ''));
    if (!res.freshRefused) return { success: false, error: 'TTL-stamped ts-less signature ACCEPTED (pre-fix forever-replay)' };
    if (!res.ancientAllowed) return { success: false, error: 'past-TTL stamp still blocked?? (retention law broke)' };
    return true;
});

// ==== R8-3: config getters (module read of record wired honestly) ===========

test('R8-3a: webhookReplayTtlMs defaults to 24h and clamps garbage/<=0 to it', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    const def = 24 * 60 * 60 * 1000;
    delete process.env.VANT_WEBHOOK_REPLAY_TTL_MS;
    if (config.webhookReplayTtlMs() !== def) return { success: false, error: 'default is not 24h' };
    process.env.VANT_WEBHOOK_REPLAY_TTL_MS = 'garbage';
    if (config.webhookReplayTtlMs() !== def) return { success: false, error: 'garbage did not fall back' };
    process.env.VANT_WEBHOOK_REPLAY_TTL_MS = '-5';
    if (config.webhookReplayTtlMs() !== def) return { success: false, error: 'negative did not fall back' };
    process.env.VANT_WEBHOOK_REPLAY_TTL_MS = '3600000';
    if (config.webhookReplayTtlMs() !== 3600000) return { success: false, error: 'explicit value not honored' };
    process.env.VANT_WEBHOOK_REPLAY_TTL_MS = '99999999999';
    if (config.webhookReplayTtlMs() !== 7 * 24 * 60 * 60 * 1000) return { success: false, error: 'one-week ceiling not clamped' };
    delete process.env.VANT_WEBHOOK_REPLAY_TTL_MS;
    return true;
});

test('R8-3b: webhookReplayLedger override plumbing (unset → null, set → path)', () => {
    const config = require(path.join(ROOT, 'lib', 'config'));
    delete process.env.VANT_WEBHOOK_REPLAY_LEDGER;
    if (config.webhookReplayLedger() !== null) return { success: false, error: 'unset must be null' };
    process.env.VANT_WEBHOOK_REPLAY_LEDGER = '/tmp/r8/ledger.json';
    const v = config.webhookReplayLedger();
    delete process.env.VANT_WEBHOOK_REPLAY_LEDGER;
    if (v !== '/tmp/r8/ledger.json') return { success: false, error: 'override not honored: ' + v };
    return true;
});

// ==== R8-4: hydration never BLINDLY trusts the ledger =======================

asyncTest('R8-4: future-stamped ledger rows are skipped, and past-TTL rows are never re-persisted', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r8-d-'));
    const route = 'r8-trust';
    const nowMs = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    fs.writeFileSync(path.join(tmp, 'ledger.json'), JSON.stringify({
        [route]: { 'r8-future-sig': nowMs + (2 * 60 * 60 * 1000), 'r8-stale-sig': nowMs - (2 * DAY) }
    }));
    _child(`
        process.env.VANT_WEBHOOK_REPLAY_LEDGER = ${JSON.stringify(path.join(tmp, 'ledger.json'))};
        const webhooks = require(${JSON.stringify(path.join(ROOT, 'lib/webhooks.js'))});
        // A future-stamped sig must be treated as NEVER-SEEN (skipped): blind
        // hydration would 409 it as "already processed". First delivery must
        // pass, and the flush must re-stamp it from NOW, not the forged stamp.
        const first = webhooks._replayCheck(${JSON.stringify(route)}, {}, 'r8-future-sig');
        console.log('FIRST ' + (first.ok ? '1' : '0'));
        for (let i = 1; i <= 26; i++) {
            if (!webhooks._replayCheck(${JSON.stringify(route)}, {}, 'r8-carrier-' + i).ok) process.exit(3);
        }
        console.log('ok');`, {});
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'ledger.json'), 'utf8'));
    const routeRows = onDisk[route] || {};
    const stamp = Number(routeRows['r8-future-sig']);
    const acceptedNow = Number.isFinite(stamp) && stamp <= nowMs + 60000 && stamp >= nowMs - 60000;
    if (!acceptedNow) {
        return { success: false, error: 'future-stamped row was hydrated as seen (409), or re-persisted with a stamp the ledger claims: ' + routeRows['r8-future-sig'] };
    }
    if (routeRows['r8-stale-sig']) return { success: false, error: 'past-TTL row re-persisted (retention cache turned archive)' };
    if (!routeRows['r8-carrier-1']) return { success: false, error: 'legit rows not persisted — flush died' };
    return true;
});

// ==== main ==============================================================

(async () => {
    await _runAsync();
    console.log(`\n  R8: ${results.passed} passed, ${results.failed} failed`);
    process.exit(results.failed ? 1 : 0);
})();
