#!/usr/bin/env node
/**
 * Event tap — H2 of #185 (the event stream IS the dashboard).
 *
 * Pins: GET /mcp/events as a plain SSE stream (no SDK shapes), auth parity
 * with /mcp/exec (401 without a credential when requireKey is on; guest
 * tokens carry their identity), dashboard-family filtering + payload
 * sanitation (only shallow listed keys), internal ops never board the
 * stream, the 15s-adjustable beat (: beat comment), and the mid-stream
 * guest revocation kill (the issue's own enumeration-defense rule).
 */

const assert = require('assert');
const path = require('path');
const http = require('http');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function check(cond) { if (!cond) throw new Error('assert failed: ' + cond); }

console.log('\n📡 EVENT TAP TESTS (H2 of #185 — the stream is the dashboard)\n');

const BRAIN = 'taptest';
const OPT = { brain: BRAIN };

const mcp = require(path.join(ROOT, 'lib', 'mcp'));
const eventBus = require(path.join(ROOT, 'lib', 'event'));
let guests = require(path.join(ROOT, 'lib', 'guests'));

let prevRequireKey = null;
function requireKeyEnv(v) {
    if (prevRequireKey === null) prevRequireKey = process.env.VANT_MCP_REQUIRE_KEY;
    process.env.VANT_MCP_REQUIRE_KEY = v;
}
function configFreshRequireKey() {
    const c = require(path.join(ROOT, 'lib', 'config'));
    return c.mcpRequireKey();
}

// The dashboard board expects the FAMILY tuples to be honest: guest_* events
// are internal (never on the board) even for shared-key taps.
async function drainOnce(streamBody, msec) {
    return new Promise((resolve) => setTimeout(resolve, msec));
}

function sseFrames(buffer) {
    return buffer.split('\n\n').filter(f => f.trim() && !f.startsWith(':'))
        .map(f => {
            const evLine = f.split('\n').find(l => l.startsWith('event: '));
            const dataLine = f.split('\n').find(l => l.startsWith('data: '));
            return { event: evLine ? evLine.slice(7) : null, data: dataLine ? dataLine.slice(6) : null, raw: f };
        });
}

async function run() {
    try {
        const srv = require('net').createServer();
        const PORT = await new Promise((r) => srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => r(p)); }));
        await mcp.start({ port: PORT, bind: '127.0.0.1' });
        const base = 'http://127.0.0.1:' + PORT;

        // ---- tap 1: auth parity — requireKey of a shared env var with NO cred -> 401 ----
        requireKeyEnv('true');
        if (process.env.TAP_DEBUG) console.log('    [debug] mcpRequireKey inside test process:', configFreshRequireKey());
        const res401 = await fetch(base + '/mcp/events?beat=500');
        assert.strictEqual(res401.status, 401, 'no-credential tap = 401 when requireKey is on');

        const active = (() => { try { return require(path.join(ROOT, 'lib', 'brain')).getCurrentBrain(); } catch (e) { return 'vant'; } })();
        const prevActiveLedger = (() => { try { return fs.readFileSync(guests._ledgerPath(active), 'utf8'); } catch (e) { return null; } })();
        const DOPT = { brain: active };
        const guestIssue = guests.issue('board-watcher-' + Date.now().toString(36), { ...DOPT, role: 'observer' });
        // the guest tap rides the SAME requireKey posture: a valid token is a credential
        const guestGate401 = await fetch(base + '/mcp/events?beat=500', { headers: { Authorization: 'Bearer ' + guestIssue.token } });
        assert.strictEqual(guestGate401.status, 200, 'a valid guest token satisfies the requireKey boundary');
        try { await guestGate401.body.getReader().cancel(); } catch (e) { /* already closed */ }

        // Shared stream-pump helper: one reader per response, deadline respected.
        const pumpUntil = async (res2, wantedLen, msec) => {
            const reader = res2.body.getReader();
            const dec = new TextDecoder();
            let acc = '';
            const giveUp = setTimeout(async () => { try { await reader.cancel(); } catch (e) {} }, msec);
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    acc += dec.decode(value, { stream: true });
                    if (acc.length >= wantedLen && acc.includes('tap.target.done')) break;
                }
            } catch (e) { /* stream aborted */ }
            clearTimeout(giveUp);
            try { await reader.cancel(); } catch (e) { /* already closed */ }
            return acc;
        };

        // ---- tap 3: the guest tap receives dashboard-family events, sanitized ----
        const res2 = await fetch(base + '/mcp/events?beat=400', { headers: { Authorization: 'Bearer ' + guestIssue.token } });
        assert.strictEqual(res2.status, 200, 'guest tap connects with a valid vguest_ token');
        assert.strictEqual((res2.headers.get('content-type') || '').includes('text/event-stream'), true, 'SSE content-type');
        // let the tap renderer settle BEFORE emitting (the frames must all land)
        await new Promise(r => setTimeout(r, 350));
        const emitTimes = [0, 40, 40, 40, 40];
        eventBus.emit('agent:spawned', { name: 'dashboard-agent', secretInternalBlob: 'SHOULD-NOT-LEAK' });
        setTimeout(() => eventBus.emit('guest:issued', { id: 'nope', name: 'should-not-board' }), 40);
        setTimeout(() => eventBus.emit('mcp:auth:failed', { n: 1 }), 80);
        setTimeout(() => eventBus.emit('task:queue', { taskId: 'tt-1', status: 'queued' }), 120);
        setTimeout(() => eventBus.emit('tap.target.done', { marker: true }), 200);
        const buf2 = await pumpUntil(res2, 0, 2500);
        const frames = sseFrames(buf2);
        // (dashboard-board fix) Family frames are DEFAULT-message events with
        // the type embedded as `tapType` — a browser EventSource's bare
        // onmessage receives them (named frames are invisible to onmessage,
        // which is exactly how the board sat silent on its own wire).
        const agentFrame = frames.find(f => f.data && f.data.includes('"tapType":"agent:spawned"'));
        assert.ok(agentFrame, 'dashboard-family event rides the stream');
        assert.ok(agentFrame.data.includes('dashboard-agent'), 'sanitized payload keeps listed keys');
        assert.ok(!agentFrame.data.includes('SHOULD-NOT-LEAK'), 'unlisted keys NEVER board (sanitation)');
        assert.ok(!frames.some(f => f.data && f.data.includes('"tapType":"guest:issued"')), 'internal guest:* never boards');
        assert.ok(frames.some(f => f.data && f.data.includes('"tapType":"task:queue"')), 'task family rides the board');

        // ---- tap 4: mid-stream revocation kills at the next beat ----
        const revAbort = new AbortController();
        const res3 = await fetch(base + '/mcp/events?beat=400', { headers: { Authorization: 'Bearer ' + guestIssue.token }, signal: revAbort.signal });
        assert.strictEqual(res3.status, 200);
        let revBuf = '';
        // deferred promise split out of the executor (no async executor):
        // the reader loop is kicked off as its own IIFE and completes revDone.
        let revResolve;
        const revDone = new Promise((resolve) => { revResolve = resolve; });
        void (async () => {
            try {
                const reader = res3.body.getReader(); const dec = new TextDecoder();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    revBuf += dec.decode(value, { stream: true });
                    if (revBuf.includes('tap.revoked')) { try { await reader.cancel(); } catch (e) {} break; }
                }
            } catch (e) { /* aborted */ }
            revResolve(revBuf);
        })();
        await new Promise(r => setTimeout(r, 250));
        guests.revoke(guestIssue.guest.id, DOPT);
        // the next beat (<=400ms + margins) must carry tap.revoked
        const revFinal = await Promise.race([revDone, new Promise(r => setTimeout(r, 2000, ''))]);
        assert.ok(String(revFinal).includes('tap.revoked') || revBuf.includes('tap.revoked'), 'revoked guest stream announces the kill at the next beat');

        // heartbeat discipline: the FIRST beat rides the ?beat interval
        requireKeyEnv('true');
        const g2 = guests.issue('beat-probe-' + Date.now().toString(36), { ...DOPT, role: 'observer' });
        const beatStarted = Date.now();
        // deferred promise split out of the executor (no async executor):
        // resolve lands from the pump, the 3s loan, or a reader error.
        let beatResolve;
        const beatDone = new Promise((resolve) => { beatResolve = resolve; });
        void (async () => {
            let acc = '';
            let landed = 0;
            const loan = setTimeout(() => { beatResolve({ acc, landed }); }, 3000);
            const r = await fetch(base + '/mcp/events?beat=500', { headers: { Authorization: 'Bearer ' + g2.token } });
            const reader = r.body.getReader(); const dec = new TextDecoder();
            (function pump() {
                reader.read().then(async ({ done, value }) => {
                    if (done) return beatResolve({ acc, landed });
                    acc += dec.decode(value, { stream: true });
                    if (!landed && acc.includes(': beat')) { landed = Date.now() - beatStarted; clearTimeout(loan); try { await reader.cancel(); } catch (e) {} beatResolve({ acc, landed }); return; }
                    pump();
                }).catch(() => beatResolve({ acc, landed }));
            })();
        })();
        const beatResult = await beatDone;
        assert.ok(beatResult.acc.includes(': beat'), 'heartbeat comment lands on an adjusted ?beat');
        assert.ok(beatResult.landed > 0 && beatResult.landed < 5000, 'first beat rides the ?beat interval (' + beatResult.landed + 'ms), not the 15s default');
        requireKeyEnv(prevRequireKey === undefined ? '' : prevRequireKey || null);

        try { tapAbort.abort(); } catch (e) {}
        try { revAbort.abort(); } catch (e) {}
        try { await mcp.stop(); } catch (e) {}
        // restore whatever the active brain's ledger held (test hygiene) —
        // BUT drop this test's own rows from the restored snapshot
        if (prevActiveLedger !== null) {
            fs.writeFileSync(guests._ledgerPath(active), prevActiveLedger);
        }
        guests = require(path.join(ROOT, 'lib', 'guests'));
        guests._resetForTest();
    } catch (e) {
        failed++;
        console.log('  ✗ integration — ' + e.message);
    } finally {
        if (prevRequireKey === null || prevRequireKey === undefined) delete process.env.VANT_MCP_REQUIRE_KEY;
        else process.env.VANT_MCP_REQUIRE_KEY = prevRequireKey;
    }

    console.log('\n=== tap: ' + passed + ' passed, ' + failed + ' failed ===\n');
    process.exit(failed > 0 ? 1 : 0);
}

passed++; console.log('  ✓ (integrated live probes below)');

run();
