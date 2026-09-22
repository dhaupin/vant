#!/usr/bin/env node
/**
 * Sudo health-check revalidation tests (prd-sudo.md §12 — Slice F)
 *
 * "Automated revalidation with service health checks": services can register
 * an async health probe via sudo.registerHealthCheck(). When a
 * revalidate:true grant expires, the revalidation loop consults the probe:
 *   - probe healthy  → grant extended (revalidated)
 *   - probe failing / throwing / timing out → grant revoked with reason
 *     'health_check_failed'
 *   - no probe registered → plain TTL revalidation (backward compatible)
 *
 * Run: node test/sudo-health.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const sudo = require(path.join(ROOT, 'lib', 'sudo'));
const event = require(path.join(ROOT, 'lib', 'event'));

const results = { passed: 0, failed: 0, tests: [] };
const _asyncTests = [];

function _verdict(r) {
    if (r === true || (r && r.success)) return { ok: true };
    return { ok: false, why: (r && r.error) || 'assertion failed' };
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
        try {
            v = _verdict(await fn());
        } catch (e) { v = { ok: false, why: e.message }; }
        if (v.ok) { results.passed++; console.log(`  ✓ ${name}`); }
        else { results.failed++; console.log(`  ✗ ${name}: ${v.why}`); }
    }
}

function freshDefaultTask() {
    sudo.reset();
    sudo.createTask('default', ['read']);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function onEvent(type, handler) { event.on(type, handler); }
function offEvent(type, handler) { event.off(type, handler); }

async function run() {
    console.log('\n🏥 SUDO HEALTH-CHECK REVALIDATION TESTS\n');

    // ==================== REGISTRY API (sync) ====================

    test('registerHealthCheck validates input', () => {
        freshDefaultTask();
        const bad1 = sudo.registerHealthCheck('', () => true);
        const bad2 = sudo.registerHealthCheck('svc', 'not-a-function');
        const ok = sudo.registerHealthCheck('registry-svc', async () => true, { description: 'test probe' });
        const listed = sudo.getHealthChecks();
        const out = bad1.registered === false && bad2.registered === false &&
                    ok.registered === true &&
                    listed['registry-svc'] && listed['registry-svc'].hasCheck === true;
        sudo.unregisterHealthCheck('registry-svc');
        return out || { error: `bad1=${JSON.stringify(bad1)} bad2=${JSON.stringify(bad2)} ok=${JSON.stringify(ok)}` };
    });

    test('unregisterHealthCheck removes a registered probe', () => {
        freshDefaultTask();
        sudo.registerHealthCheck('doomed-svc', async () => true);
        const r = sudo.unregisterHealthCheck('doomed-svc');
        return r.removed === true && !sudo.getHealthChecks()['doomed-svc'] ? true : { error: 'not removed' };
    });

    // ==================== runHealthChecks() (async) ====================

    asyncTest('runHealthChecks reports healthy / failing / throwing probes', async () => {
        freshDefaultTask();
        sudo.registerHealthCheck('up-svc', async () => true, { description: 'fine' });
        sudo.registerHealthCheck('down-svc', async () => false);
        sudo.registerHealthCheck('throw-svc', async () => { throw new Error('boom'); });
        const rs = await sudo.runHealthChecks();
        const by = Object.fromEntries(rs.map(r => [r.service, r]));
        const ok = by['up-svc'].healthy === true &&
                   by['down-svc'].healthy === false &&
                   by['throw-svc'].healthy === false && /boom/.test(by['throw-svc'].detail);
        sudo.reset();
        return ok || { error: JSON.stringify(by) };
    });

    // ==================== LOOP GATING (async) ====================

    asyncTest('loop extends expired revalidatable grant when probe is healthy', async () => {
        freshDefaultTask();
        sudo.registerHealthCheck('storage', async () => true);
        await sudo.escalate(null, 'write', { service: 'storage', ttl: 30 });
        let revalidated = 0;
        const h = () => { revalidated++; };
        onEvent('sudo:escalation_revalidated', h);
        sudo.startRevalidationLoop(40);
        await sleep(150);
        sudo.stopRevalidationLoop();
        offEvent('sudo:escalation_revalidated', h);
        const g = sudo.getGrants('default').write;
        const canWrite = sudo.can('default', 'write');
        sudo.reset();
        return (!!g && g.revalidations >= 1 && revalidated >= 1 && canWrite === true) ||
               { error: `g=${JSON.stringify(g)} revalidated=${revalidated} can=${canWrite}` };
    });

    asyncTest('loop revokes expired grant with health_check_failed when probe fails', async () => {
        freshDefaultTask();
        sudo.registerHealthCheck('storage', async () => false);
        await sudo.escalate(null, 'write', { service: 'storage', ttl: 30 });
        const events = [];
        const h = (d) => { events.push(d); };
        onEvent('sudo:escalation_expired', h);
        sudo.startRevalidationLoop(40);
        await sleep(150);
        sudo.stopRevalidationLoop();
        offEvent('sudo:escalation_expired', h);
        const g = sudo.getGrants('default').write;
        const canWrite = sudo.can('default', 'write');
        const ev = events.find(e => e.reason === 'health_check_failed');
        const ok = g === undefined && canWrite === false &&
                   !!ev && ev.service === 'storage' && ev.taskId === 'default';
        sudo.reset();
        return ok || { error: `g=${JSON.stringify(g)} can=${canWrite} events=${JSON.stringify(events)}` };
    });

    asyncTest('loop revokes when probe throws', async () => {
        freshDefaultTask();
        sudo.registerHealthCheck('storage', async () => { throw new Error('wired wrong'); });
        await sudo.escalate(null, 'write', { service: 'storage', ttl: 30 });
        sudo.startRevalidationLoop(40);
        await sleep(150);
        sudo.stopRevalidationLoop();
        const gone = sudo.getGrants('default').write === undefined;
        sudo.reset();
        return gone || { error: 'grant survived throwing probe' };
    });

    asyncTest('loop revokes when probe exceeds the timeout', async () => {
        freshDefaultTask();
        // Default timeout is 1000ms (VANT_SUDO_HEALTH_TIMEOUT); the probe hangs
        // for 3000ms, so the grant must be revoked AT the timeout (~1s), long
        // before the probe would resolve at ~3s.
        sudo.registerHealthCheck('storage', () => new Promise(resolve => setTimeout(() => resolve(true), 3000)));
        await sudo.escalate(null, 'write', { service: 'storage', ttl: 30 });
        const t0 = Date.now();
        sudo.startRevalidationLoop(40);
        await sleep(1400); // > timeout (1s), < probe resolution (3s)
        sudo.stopRevalidationLoop();
        const elapsed = Date.now() - t0;
        const g = sudo.getGrants('default').write;
        const canWrite = sudo.can('default', 'write');
        sudo.reset();
        return (g === undefined && canWrite === false && elapsed < 3000) ||
               { error: `g=${JSON.stringify(g)} can=${canWrite} elapsed=${elapsed}` };
    });

    asyncTest('non-revalidatable (mcp) grant still revoked without consulting the probe', async () => {
        freshDefaultTask();
        sudo.registerHealthCheck('mcp', async () => true);
        await sudo.escalate(null, 'write', { service: 'mcp', callback: (e, ok) => ok(true), ttl: 25 });
        const events = [];
        const h = (d) => { events.push(d); };
        onEvent('sudo:escalation_expired', h);
        sudo.startRevalidationLoop(40);
        await sleep(150);
        sudo.stopRevalidationLoop();
        offEvent('sudo:escalation_expired', h);
        const g = sudo.getGrants('default').write;
        const plain = events.find(e => e.service === 'mcp' && !e.reason);
        const ok = g === undefined && !!plain;
        sudo.reset();
        return ok || { error: `g=${JSON.stringify(g)} events=${JSON.stringify(events)}` };
    });

    asyncTest('no probe registered → plain TTL revalidation (backward compatible)', async () => {
        freshDefaultTask();
        await sudo.escalate(null, 'write', { service: 'storage', ttl: 30 });
        sudo.startRevalidationLoop(40);
        await sleep(150);
        sudo.stopRevalidationLoop();
        const g = sudo.getGrants('default').write;
        const ok = !!g && g.revalidations >= 1;
        sudo.reset();
        return ok || { error: `g=${JSON.stringify(g)}` };
    });

    // ==================== RESET ISOLATION ====================

    asyncTest('reset() clears registered health checks', async () => {
        freshDefaultTask();
        sudo.registerHealthCheck('storage', async () => true);
        sudo.reset();
        const cleared = Object.keys(sudo.getHealthChecks()).length === 0;
        // And a subsequent revalidation with a grant behaves default-healthy
        sudo.createTask('default', ['read']);
        await sudo.escalate(null, 'write', { service: 'storage', ttl: 30 });
        sudo.startRevalidationLoop(40);
        await sleep(150);
        sudo.stopRevalidationLoop();
        const g = sudo.getGrants('default').write;
        sudo.reset();
        return cleared && !!g && g.revalidations >= 1 ? true : { error: `cleared=${cleared} g=${JSON.stringify(g)}` };
    });

    // ==================== TIMING SAFETY ====================

    asyncTest('expired-while-probing guard: extension not applied after revoke wins', async () => {
        freshDefaultTask();
        // Slow-but-healthy probe: while it runs, revoke() removes the grant.
        let release;
        sudo.registerHealthCheck('storage', () => new Promise(resolve => { release = () => resolve(true); }));
        await sudo.escalate(null, 'write', { service: 'storage', ttl: 30 });
        sudo.startRevalidationLoop(40);
        await sleep(80); // tick fires, probe now in flight
        sudo.revoke('default', 'write');
        if (typeof release === 'function') release();
        await sleep(80);
        sudo.stopRevalidationLoop();
        const g = sudo.getGrants('default').write;
        sudo.reset();
        return g === undefined || { error: `grant resurrected: ${JSON.stringify(g)}` };
    });

    await _runAsync();

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    results.tests = { passed: results.passed, failed: results.failed };
    process.exit(results.failed > 0 ? 1 : 0);
}

run().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
