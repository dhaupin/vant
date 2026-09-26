#!/usr/bin/env node
/**
 * Security-chain consolidation tests (B-2, prd-security follow-up)
 *
 * ONE chain to rule them all: pipeline.runChain(ctx, opts) implements the
 * canonical sequence — sandbox capability (safe-by-default) → vaf → qos →
 * rls → escrow (writes) — with code-based rejections and fail-open ONLY for
 * infrastructure unavailability (never for configured denials).
 *
 * Fixes two live fail-open bugs found in brain.js's hand-rolled chain:
 *  - vaf.check THROWS security rejections (VAF_CONTENT_BLOCKED etc); brain
 *    only rethrew INPUT_VALIDATION_FAILED, so malicious content passed.
 *  - escrow canWrite returns {allowed:false} OBJECTS; brain tested
 *    `if (!canWrite)` so object denials were truthy and passed.
 *
 * brain.js keeps its chain function but delegates to runChain; agents.js's
 * never-called hand-rolled chain is removed.
 */

const pipeline = require('../lib/pipeline');
const errors = require('../lib/error');

const results = { passed: 0, failed: 0 };
const failures = [];
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
                failures.push(`${name}: ${msg}`);
                console.log(`  ✗ ${name}: ${msg}`);
            }
        }).catch(e => {
            results.failed++;
            failures.push(`${name}: ${e.message}`);
            console.log(`  ✗ ${name}: ${e.message}`);
        });
    });
}

// Sandbox flip helper (restore in finally — shared defaultSandbox!)
const sandboxMod = require('../lib/sandbox');
function withSandbox(caps, fn) {
    const sb = sandboxMod.defaultSandbox;
    if (!sb || typeof sb.setCapabilities !== 'function') throw new Error('sandbox unavailable');
    const was = { ...sb.capabilities };
    const wasFlag = sb._explicitlyConfigured;
    sb.setCapabilities(caps);
    return Promise.resolve()
        .then(fn)
        .finally(() => { sb.capabilities = was; sb._explicitlyConfigured = wasFlag; });
}

console.log('\n🔗 SECURITY-CHAIN CONSOLIDATION TESTS (B-2)\n');

test('pipeline.runChain is a function (the one chain exists)', () => {
    if (typeof pipeline.runChain !== 'function') return { success: false, error: 'pipeline.runChain missing' };
    return true;
});

test('benign write with unconfigured sandbox: allowed, returns cleanup callable', async () => {
    const res = await pipeline.runChain(
        'test.write',
        { write: true, scope: 'test', category: 'notes', key: 'k1', content: 'hello world' }
    );
    if (!res || typeof res !== 'object') return { success: false, error: 'no result object' };
    if (typeof res.cleanup !== 'function') return { success: false, error: 'cleanup not a function' };
    res.cleanup(); // idempotent-safe
    return true;
});

test('vaf rejection: {{constructor}}-class content blocked (VAF_CONTENT_BLOCKED, not swallowed)', async () => {
    let threw = null;
    try {
        await pipeline.runChain(
            'test.write',
            { write: true, scope: 'test', category: 'c', key: 'k', content: 'x {{constructor}} y' }
        );
    } catch (e) { threw = e; }
    if (!threw) return { success: false, error: 'malicious content NOT blocked (fail-open)' };
    if (threw.code !== errors.CODES.VAF_CONTENT_BLOCKED) {
        return { success: false, error: 'wrong code: ' + (threw.code || threw.message) };
    }
    return true;
});

test('configured canWrite:false BLOCKS writes (CAPABILITY_NOT_ALLOWED)', async () => {
    return withSandbox({ canWrite: false }, async () => {
        let threw = null;
        try {
            await pipeline.runChain(
                'test.write',
                { write: true, scope: 'test', category: 'c', key: 'k', content: 'fine content' }
            );
        } catch (e) { threw = e; }
        if (!threw) return { success: false, error: 'write allowed under canWrite:false' };
        if (threw.code !== errors.CODES.CAPABILITY_NOT_ALLOWED) {
            return { success: false, error: 'wrong code: ' + (threw.code || threw.message) };
        }
        return true;
    });
});

test('configured canRead:false BLOCKS reads', async () => {
    return withSandbox({ canRead: false }, async () => {
        let threw = null;
        try {
            await pipeline.runChain(
                'test.read',
                { scope: 'test', category: 'c', key: 'k' }
            );
        } catch (e) { threw = e; }
        if (!threw) return { success: false, error: 'read allowed under canRead:false' };
        if (threw.code !== errors.CODES.CAPABILITY_NOT_ALLOWED) {
            return { success: false, error: 'wrong code: ' + (threw.code || threw.message) };
        }
        return true;
    });
});

test('read-allowed sandbox still permits reads (gate does not over-block)', async () => {
    return withSandbox({ canRead: true, canWrite: false }, async () => {
        const res = await pipeline.runChain(
            'test.read',
            { scope: 'test', category: 'c', key: 'k' }
        );
        if (!res || typeof res.cleanup !== 'function') return { success: false, error: 'no cleanup on read path' };
        res.cleanup();
        return true;
    });
});

test('qos throttling surfaces CIRCUIT_BREAKER_OPEN (not swallowed)', async () => {
    const qos = require('../lib/qos');
    while (qos.getActiveCount() < qos.MAX_CONCURRENT) qos.incrementActive();
    try {
        let threw = null;
        try {
            await pipeline.runChain(
                'test.write',
                { write: true, scope: 'test', category: 'c', key: 'k', content: 'hi' }
            );
        } catch (e) { threw = e; }
        if (!threw) return { success: false, error: 'throttled write allowed' };
        if (threw.code !== errors.CODES.CIRCUIT_BREAKER_OPEN) {
            return { success: false, error: 'wrong code: ' + (threw.code || threw.message) };
        }
        return true;
    } finally {
        while (qos.getActiveCount() > 0) qos.decrementActive();
    }
});

test('wiring: brain.js chain delegates to runChain (no hand-rolled vaf/qos/rls/escrow)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').resolve(__dirname, '..', 'lib', 'brain.js'), 'utf8');
    if (!src.includes('runChain')) return { success: false, error: 'brain.js does not call runChain' };
    const start = src.indexOf('async function _runBrainSecurityChain');
    if (start === -1) return { success: false, error: 'brain chain fn missing (renamed without wiring test update?)' };
    const body = src.slice(start, start + 600);
    if (body.includes("require('./qos')")) return { success: false, error: 'brain chain still hand-rolls qos' };
    if (body.includes("require('./rls')")) return { success: false, error: 'brain chain still hand-rolls rls' };
    if (body.includes("require('./escrow')")) return { success: false, error: 'brain chain still hand-rolls escrow' };
    return true;
});

test('wiring: agents.js dead hand-rolled chain removed (message-sniffing gone)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').resolve(__dirname, '..', 'lib', 'agents.js'), 'utf8');
    if (src.includes('_runAgentSecurityChain')) return { success: false, error: 'dead chain fn still present' };
    if (src.includes("e.message.includes('validation failed')")) return { success: false, error: 'message sniffing still present' };
    if (src.includes("e.message.includes('Rate limit')")) return { success: false, error: 'message sniffing still present' };
    return true;
});

(async () => {
    await _chain;
    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    if (results.failed > 0) {
        console.log('\n  FAILURES:');
        failures.forEach(f => console.log('   - ' + f));
    }
    process.exit(results.failed > 0 ? 1 : 0);
})();
