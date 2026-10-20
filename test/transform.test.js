#!/usr/bin/env node
/**
 * Transform module tests
 */

const path = require('path');
const _ROOT = path.resolve(__dirname, '..');

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

// (Cairn-gap close) testAsync used to be fire-and-forget: the module fell
// through to process.exit BEFORE any async pin resolved, so every async
// pin (including the #219 scopes below) was silently skipped — the suite
// printed "Passed: 11" while running 5. Queue the promises and drain the
// pool before the RESULTS block.
const _asyncPool = [];
function testAsync(name, fn) {
    _asyncPool.push((async () => {
        try {
            await fn();
            results.passed++;
            console.log(`  ✓ ${name}`);
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    })());
}

console.log('\n🔄 TRANSFORM TESTS\n');

const transform = require('../lib/transform');

test('transform has gather function', () => {
    return { success: typeof transform.gather === 'function' };
});

test('transform has toHorcrux function', () => {
    return { success: typeof transform.toHorcrux === 'function' };
});

test('transform has restore function', () => {
    return { success: typeof transform.restore === 'function' };
});

test('transform has inspectHorcrux function', () => {
    return { success: typeof transform.inspectHorcrux === 'function' };
});

testAsync('transform gather returns object', async () => {
    const data = await transform.gather();
    return { success: typeof data === 'object' };
});

testAsync('transform gather returns agents', async () => {
    const data = await transform.gather();
    return { success: 'agents' in data };
});

testAsync('transform gather returns islands', async () => {
    const data = await transform.gather();
    return { success: 'islands' in data };
});

testAsync('transform toHorcrux returns string', async () => {
    const json = await transform.toHorcrux();
    return { success: typeof json === 'string' };
});

testAsync('transform toHorcrux has valid JSON', async () => {
    const json = await transform.toHorcrux();
    const data = JSON.parse(json);
    return { success: data && data.type === 'vant-horcrux' };
});

testAsync('transform restore returns object', async () => {
    const data = {
        timestamp: Date.now(),
        version: '0.8.6',
        mode: { loaded: false },
        brainStorage: { loaded: false },
        neurons: { loaded: false },
        configStorage: { loaded: false },
        islandState: { loaded: false },
        agents: null,
        islands: { manifests: null },
        config: null,
        runtime: null,
        boot: null
    };
    const result = await transform.restore(data);
    return { success: typeof result === 'object' };
});

test('transform inspectHorcrux is function', () => {
    return { success: typeof transform.inspectHorcrux === 'function' };
});

// (Cairn/prestruct pin — the gather-all-brains gap, closed) The --brains
// allowlist must be END-TO-END: lib gather scopes the storage walk, the
// mode INVENTORY, and refueses an empty filter; the transform CLI face
// (bin/transform.js) exposes the flag on every gather verb (snapshot and
// horcrux already did — this face was the gap).
testAsync('gather --brains scopes the brainStorage walk to the filter', async () => {
    const data = await transform.gather({
        brains: ['vant'],
        agents: false, islands: false, runtime: false, boot: false,
        config: false, corpus: false, neurons: false, metrics: false,
        handlers: false, configStorage: false, islandState: false,
        memory: false, consensus: false, escrow: false, msg: false,
        agents2: false, teams2: false, cron: false, lineage: false,
        forum: false, governance: false, habitat: false, crewBus: false,
        rules: false, registry: false, trust2: false, market: false,
        trust: false, teams: false
    });
    const captured = data.brainStorage && data.brainStorage.brains
        ? Object.keys(data.brainStorage.brains)
        : [];
    const scoped = captured.length === 1 && captured[0] === 'vant';
    return { success: scoped, error: `captured brains: ${JSON.stringify(captured)}` };
});

testAsync('gather --brains scopes the mode INVENTORY and leaves identity truth unfiltered', async () => {
    const data = await transform.gather({
        brains: ['vant'],
        agents: false, islands: false, runtime: false, boot: false,
        config: false, corpus: false, neurons: false, metrics: false,
        handlers: false, configStorage: false, islandState: false,
        memory: false, consensus: false, escrow: false, msg: false,
        agents2: false, teams2: false, cron: false, lineage: false,
        forum: false, governance: false, habitat: false, crewBus: false,
        rules: false, registry: false, trust2: false, market: false,
        trust: false, teams: false
    });
    const inv = data.mode && Array.isArray(data.mode.stack) ? data.mode.stack : null;
    const idStack = data.mode && Array.isArray(data.mode.activeStack) ? data.mode.activeStack : null;
    // Inventory: stack ⊆ filter (only captured brains ride). Identity:
    // activeStack stays the LIVE truth (never scoped, never empty-clobbered
    // by the filter); restore-side mkdir/loadStack read the scoped stack.
    const ok = !!inv && inv.every((n) => n === 'vant')
        && Array.isArray(idStack) && idStack.length > 0
        && data.mode.currentBrain !== undefined;
    return { success: ok, error: `stack=${JSON.stringify(inv)} activeStack=${JSON.stringify(idStack)}` };
});

testAsync('gather refuses an EMPTY --brains filter (caller error, typed)', async () => {
    try {
        await transform.gather({ brains: ' ,' });
        return { success: false, error: 'an empty filter was accepted (gather nothing = lie)' };
    } catch (e) {
        return { success: /zero brain names/.test(e.message) };
    }
});

test('transform CLI refuser: empty --brains exits 1 with the refusal line', () => {
    const { spawnSync } = require('child_process');
    const ROOT = path.resolve(__dirname, '..');
    const r = spawnSync('node', [path.join(ROOT, 'bin', 'transform.js'), 'gather', '--brains', ''], {
        cwd: ROOT, encoding: 'utf8', timeout: 30000,
        env: { ...process.env, VANT_BRAIN: 'qc-transform-brains' }
    });
    const out = (r.stdout || '') + (r.stderr || '');
    return { success: r.status === 1 && /zero names/.test(out), error: `status=${r.status} out=${out.slice(-140)}` };
});

test('transform CLI help documents the --brains payload scope', () => {
    const { spawnSync } = require('child_process');
    const ROOT = path.resolve(__dirname, '..');
    const r = spawnSync('node', [path.join(ROOT, 'bin', 'transform.js'), '--help'], {
        cwd: ROOT, encoding: 'utf8', timeout: 20000,
        env: { ...process.env, VANT_BRAIN: 'qc-transform-brains' }
    });
    const out = (r.stdout || '') + (r.stderr || '');
    const ok = r.status === 0 && out.includes('--brains <a,b>') && out.includes('captures ONLY those');
    return { success: ok, error: `status=${r.status} out=${out.slice(0, 80)}` };
});

Promise.all(_asyncPool).then(() => {
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
});
