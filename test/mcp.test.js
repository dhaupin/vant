#!/usr/bin/env node
/**
 * MCP Module Unit Tests
 */

// (pass 253) the pass-215 budget matrix issues dozens of identities in one
// process — since MAX_GUESTS is now env-tunable (default 100, unchanged),
// the TEST process un-caps itself BEFORE any require touches the module.
process.env.VANT_GUESTS_MAX = '500';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n🔌 MCP MODULE TESTS\n');

test('mcp module loads', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: !!mcp };
});

test('mcp has start function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.start === 'function' };
});

test('mcp has stop function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.stop === 'function' };
});

test('mcp has listTools function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.listTools === 'function' };
});

test('mcp has methods', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.methods === 'object' };
});

test('mcp has addMethod function', () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    return { success: typeof mcp.addMethod === 'function' };
});

// ============================================
// EW1 BODY CAP PINS (#190) - live HTTP against the real door
// ============================================

async function asyncTest(name, fn) {
    try {
        const result = await fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

(async () => {
    console.log('\nEW1 MCP DOOR BODY-CAP TESTS\n');

    await asyncTest('oversized POST body answers 413, not OOM (EW1, #190)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const port = 13457 + (process.pid % 500);
        await mcp.start({ port, silent: true });
        try {
            // 2MB of junk exceeds the 1MB cap; the door must refuse early
            const junk = 'x'.repeat(2 * 1024 * 1024);
            const res = await fetch(`http://127.0.0.1:${port}/mcp/exec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: 'vant_health', args: {}, junk })
            });
            const status = res.status;
            const payload = await res.text();
            const ok = status === 413 && /too large/i.test(payload);
            return { success: ok, error: ok ? undefined : `status=${status} body=${payload.slice(0, 80)}` };
        } finally {
            await mcp.stop();
        }
    });

    await asyncTest('malformed JSON body answers 400 parse error (EW1, #190)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const port = 13457 + ((process.pid + 1) % 500);
        await mcp.start({ port, silent: true });
        try {
            const res = await fetch(`http://127.0.0.1:${port}/mcp/exec`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{not-json'
            });
            const status = res.status;
            const payload = await res.text();
            const ok = status === 400 && /invalid json/i.test(payload);
            return { success: ok, error: ok ? undefined : `status=${status} body=${payload.slice(0, 80)}` };
        } finally {
            await mcp.stop();
        }
    });

    await asyncTest('per-client fixed-window limiter answers 429 + Retry-After beyond the budget; env=0 disables (EW4, #190)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const port = 13457 + ((process.pid + 2) % 500);
        process.env.VANT_MCP_RATE_LIMIT = '3'; // tiny budget so the pin trips
        await mcp.start({ port, silent: true });
        try {
            const codes = [];
            for (let i = 0; i < 5; i++) {
                const res = await fetch(`http://127.0.0.1:${port}/health`, {
                    headers: { 'x-forwarded-for': '10.0.0.77' } // same client key
                });
                codes.push({ status: res.status, retry: res.headers.get('retry-after') });
                await res.text();
            }
            const firstThreeOk = codes.slice(0, 3).every(c => c.status === 200);
            const [fourth, fifth] = codes.slice(3);
            const limited = fourth && fourth.status === 429
                && fourth.retry && parseInt(fourth.retry, 10) >= 1
                && fifth && fifth.status === 429;
            if (!(firstThreeOk && limited)) {
                return { success: false, error: 'got ' + codes.map(c => c.status).join(',') };
            }
            // Budget disabled: a fresh door (new port) with limit=0 never 429s.
            process.env.VANT_MCP_RATE_LIMIT = '0';
            const port2 = 13457 + ((process.pid + 3) % 500);
            await mcp.start({ port: port2, silent: true });
            try {
                const codes2 = [];
                for (let i = 0; i < 5; i++) {
                    const res = await fetch(`http://127.0.0.1:${port2}/health`, {
                        headers: { 'x-forwarded-for': '10.0.0.78' }
                    });
                    codes2.push(res.status);
                    await res.text();
                }
                return { success: codes2.every(s => s === 200), error: 'disabled-mode codes: ' + codes2.join(',') };
            } finally {
                await mcp.stop();
            }
        } finally {
            delete process.env.VANT_MCP_RATE_LIMIT;
            await mcp.stop();
        }
    });

    // ==================== pass 212 H4 pins (#185 work_assign) ====================
    // The composed verb: ONE call = task + escrow budget hold + spawn-or-reuse
    // agent + task delegation + era fold. Refusal law: every failed leg is a
    // TYPED honest refusal, and refusals fire BEFORE side effects so a refused
    // work_assign leaves no orphan agents and no stranded budget.
    console.log('\nH4 WORK_ASSIGN PINS (pass 212, #185)\n');

    const _sb = require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox;

    await asyncTest('H4: missing task refuses through the schema gate (MCP_INPUT_INVALID)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const r = await mcp.execute('work_assign', {});
        const ok = r && r.error === 'MCP_INPUT_INVALID' && Array.isArray(r.problems) && r.problems.some(p => /task/.test(p));
        return { success: ok, error: JSON.stringify(r).slice(0, 140) };
    });

    await asyncTest('H4: absent explicit agent refuses E_AGENT_ABSENT — roster untouched (no silent spawn)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const agents = require(path.join(ROOT, 'lib', 'agents'));
        const before = (await agents.list()).length;
        const r = await mcp.execute('work_assign', { task: 'pin', agentId: 'agent_definitely_absent_pin' });
        const after = (await agents.list()).length;
        const ok = r && r.ok === false && r.code === 'E_AGENT_ABSENT' && /does not silently spawn/.test(r.error || '') && before === after;
        return { success: ok, error: JSON.stringify(r).slice(0, 140) + ' roster ' + before + '→' + after };
    });

    await asyncTest('H4: sandbox-denied spawn surfaces verbatim as E_SPAWN_REFUSED', async () => {
        _sb.setCapabilities({ canRead: true, canWrite: true, canSpawn: false });
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const r = await mcp.execute('work_assign', { task: 'pin spawn refusal' });
        const ok = r && r.ok === false && r.code === 'E_SPAWN_REFUSED' && /canSpawn/.test(r.error || '');
        return { success: ok, error: JSON.stringify(r).slice(0, 160) };
    });

    await asyncTest('H4: over-budget refusal fires BEFORE spawn (no orphan agent)', async () => {
        _sb.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const agents = require(path.join(ROOT, 'lib', 'agents'));
        const before = (await agents.list()).length;
        const r = await mcp.execute('work_assign', { task: 'pin budget refusal', budget: 999999999 });
        const after = (await agents.list()).length;
        const ok = r && r.ok === false && r.code === 'E_BUDGET_REFUSED' && r.agentId === undefined && r.gate && r.gate.allowed === false && before === after;
        return { success: ok, error: JSON.stringify(r).slice(0, 160) + ' roster ' + before + '→' + after };
    });

    await asyncTest('H4: composition LIVE — spawn + escrow hold + delegate + era fold in one call', async () => {
        _sb.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const era = require(path.join(ROOT, 'lib', 'era'));
        const escrow = require(path.join(ROOT, 'lib', 'escrow'));
        const agents = require(path.join(ROOT, 'lib', 'agents'));
        let cur = era.current();
        if (cur.open) await era.close({ next: 'H4 pin teardown' });
        await era.start('H4 composition pin');
        const r = await mcp.execute('work_assign', { task: 'H4 pin: fold me', name: 'PinBot', budget: 5 });
        try {
            const roster = await agents.list();
            const got = roster.find(a => a.id === r.agentId);
            const hold = escrow.checkHold(r.workId);
            const after = era.current();
            const foldHit = after.era && Array.isArray(after.era.threads)
                && after.era.threads.some(t => t.type === 'task:assigned' && t.data && t.data.workId === r.workId);
            const ok = r && r.ok === true && !!got && r.delegated === true && r.eraFolded === true
                && hold.held === true && hold.condition.amount === 5 && foldHit;
            return { success: ok, error: JSON.stringify({ r, got, hold, foldHit }).slice(0, 260) };
        } finally {
            // Leave no era/hold residue for later pins.
            cur = era.current();
            if (cur.open) await era.close({ next: 'H4 pin done' });
            escrow.release(r.workId);
            // (day-11 hygiene) and no ROSTER residue either: this pin spawns
            // PinBot every run; an unterminated spawn leaks a row into the
            // shared orgchart and eventually starves the 10-agent quota for
            // this very suite on the next run (the phantom-quota class the
            // agents/internal.js comment warns about).
            try { if (r && r.agentId) agents.terminate(r.agentId); } catch (e) { /* already gone */ }
        }
    });

    // ==================== pass 215: per-guest read-verb enumeration throttle ====================
    // The last #185 runway item. Read-class verbs behind the door are the
    // enumeration vector (a guest crawling lists learns the shape/size of
    // tenants it cannot see). The budget is per GUEST IDENTITY (not IP),
    // EW4-shaped, refusals charged only by the clock, and typed 429s carry
    // E_GUEST_THROTTLED + retryAfterMs.
    console.log('\nPASS 215 GUEST READ THROTTLE PINS\n');

    await asyncTest('pass 215: guest read budget trips typed (429 E_GUEST_THROTTLED + retryAfterMs); host unaffected', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const guests = require(path.join(ROOT, 'lib', 'guests'));
        process.env.VANT_GUESTS_READ_BUDGET = '3';
        process.env.VANT_GUESTS_READ_WINDOW_MS = '30000';
        guests._resetReadBudgets();
        const port = 13527 + ((process.pid + 4) % 500);
        await mcp.start({ port, silent: true });
        try {
            const gtok = guests.issue('pin-215-a', { role: 'human' }).token;
            const call = async (hdrs) => {
                const res = await fetch(`http://127.0.0.1:${port}/mcp/exec`, {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs || {}),
                    body: JSON.stringify({ tool: 'era_list', args: {} })
                });
                return { status: res.status, body: await res.json() };
            };
            const H = { Authorization: 'Bearer ' + gtok };
            const seq = [];
            for (let i = 0; i < 4; i++) seq.push(await call(H));
            const [a, b, c, d] = seq;
            const host4 = await call();
            const ok = a.status === 200 && b.status === 200 && c.status === 200
                && d.status === 429 && d.body.error && d.body.error.reasonCode === 'E_GUEST_THROTTLED'
                && typeof d.body.error.retryAfterMs === 'number' && d.body.error.retryAfterMs > 0
                && host4.status === 200;
            return { success: ok, error: JSON.stringify(seq.map(s => s.status)) + ' host4=' + host4.status };
        } finally {
            delete process.env.VANT_GUESTS_READ_BUDGET;
            delete process.env.VANT_GUESTS_READ_WINDOW_MS;
            guests._resetReadBudgets();
            await mcp.stop();
        }
    });

    await asyncTest('pass 215: budgets are PER IDENTITY (one exhausted guest never throttles a neighbor) and recharge by the clock', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const guests = require(path.join(ROOT, 'lib', 'guests'));
        process.env.VANT_GUESTS_READ_BUDGET = '2';
        process.env.VANT_GUESTS_READ_WINDOW_MS = '200';   // tuning seam: recovery observable fast
        guests._resetReadBudgets();
        const port = 13527 + ((process.pid + 5) % 500);
        await mcp.start({ port, silent: true });
        try {
            const tokA = guests.issue('pin-215-a2', { role: 'human' }).token;
            const tokB = guests.issue('pin-215-b2', { role: 'human' }).token;
            const call = async (hdrs) => {
                const res = await fetch(`http://127.0.0.1:${port}/mcp/exec`, {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs || {}),
                    body: JSON.stringify({ tool: 'era_list', args: {} })
                });
                return res.status;
            };
            const HA = { Authorization: 'Bearer ' + tokA }, HB = { Authorization: 'Bearer ' + tokB };
            await call(HA); await call(HA);
            const thirdA = await call(HA);                 // A exhausted
            const neighborB = await call(HB);              // B unaffected (per-identity)
            await new Promise(r => setTimeout(r, 260));     // window recharges A
            const recoveredA = await call(HA);
            const ok = thirdA === 429 && neighborB === 200 && recoveredA === 200;
            return { success: ok, error: 'thirdA=' + thirdA + ' neighborB=' + neighborB + ' recoveredA=' + recoveredA };
        } finally {
            delete process.env.VANT_GUESTS_READ_BUDGET;
            delete process.env.VANT_GUESTS_READ_WINDOW_MS;
            guests._resetReadBudgets();
            await mcp.stop();
        }
    });

    await asyncTest('pass 215: VANT_GUESTS_READ_BUDGET=0 disables the throttle cleanly', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const guests = require(path.join(ROOT, 'lib', 'guests'));
        process.env.VANT_GUESTS_READ_BUDGET = '0';
        guests._resetReadBudgets();
        const port = 13527 + ((process.pid + 6) % 500);
        await mcp.start({ port, silent: true });
        try {
            const tok = guests.issue('pin-215-off', { role: 'human' }).token;
            const H = { Authorization: 'Bearer ' + tok };
            const statuses = [];
            for (let i = 0; i < 6; i++) {
                const res = await fetch(`http://127.0.0.1:${port}/mcp/exec`, {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, H),
                    body: JSON.stringify({ tool: 'era_list', args: {} })
                });
                statuses.push(res.status);
            }
            const ok = statuses.every(s => s === 200);
            return { success: ok, error: 'statuses=' + statuses.join(',') };
        } finally {
            delete process.env.VANT_GUESTS_READ_BUDGET;
            guests._resetReadBudgets();
            await mcp.stop();
        }
    });

    // (pass 253, issue #205) the config door lane: secrets MASKED on
    // get, IMMUTABLE on set (key-replace auth bypass closed).
    await asyncTest('#205: vant_config_get masks secret keys (a raw value never crosses the door)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const config = require(path.join(ROOT, 'lib', 'config'));
        config.set('mcp.apiKey', 'skVantTEST1234567890abetic');   // operator-posture runtime flag
        const r = await mcp.execute('vant_config_get', { key: 'mcp.apiKey' });
        if (!r || r.value === undefined) return 'no value returned';
        if (String(r.value).includes('skVantTEST')) return 'RAW secret crossed the door: ' + String(r.value);
        return r.value === null || /\*\*\*\*/.test(String(r.value));
    });

    await asyncTest('#205: vant_config_set refuses secret keys (typed E_CONFIG_SECRET_IMMUTABLE, nothing persisted)', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const config = require(path.join(ROOT, 'lib', 'config'));
        const before = config.get('mcp.apiKey');
        try {
            await mcp.execute('vant_config_set', { key: 'mcp.apiKey', value: 'skVantATTACKERCHOICE' });
            return 'secret set sailed through — injection live';
        } catch (e) {
            const detail = (e && (e.reason || e.message)) || '';
            const unchanged = config.get('mcp.apiKey') === before;
            return detail.includes('E_CONFIG_SECRET_IMMUTABLE') || detail.includes('secret key') ? (unchanged || 'refused but value changed') : 'wrong refusal: ' + detail;
        }
    });

    await asyncTest('#205: non-secret set stays open through the door and internal get() stays raw', async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const config = require(path.join(ROOT, 'lib', 'config'));
        const r = await mcp.execute('vant_config_set', { key: 'qos.maxPerMinute', value: '120' });
        const rawGet = config.get('mcp.apiKey');   // internal lane: raw, unchanged
        return !!r && (rawGet === null || String(rawGet).includes('skVantTEST'));
    });

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();