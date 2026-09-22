#!/usr/bin/env node
/**
 * Error Module Unit Tests
 */

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

console.log('\n⚠️  ERROR MODULE TESTS\n');

test('error module loads', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: !!err };
});

test('error has Error class', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: !!err.Error };
});

test('error has CODES object', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.CODES === 'object' };
});

test('error has handle function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.handle === 'function' };
});

test('error has retry function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.retry === 'function' };
});

test('error has wrap function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.wrap === 'function' };
});

test('error has sleep function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.sleep === 'function' };
});

test('error has ErrorHandler class', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: !!err.ErrorHandler };
});

test('error has createErrorHandler function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.createErrorHandler === 'function' };
});

test('error has onError function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.onError === 'function' };
});

// Stack tests
test('error has getStackErrorStats function', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    return { success: typeof err.getStackErrorStats === 'function' };
});

test('getStackErrorStats returns object with source stack', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    const stats = err.getStackErrorStats();
    return { success: stats && stats.source === 'stack' };
});

// ---------- BEHAVIORAL (added after the latent-bug finds) ----------
// These three functions referenced BARE identifiers that don't exist in
// module scope (vaf/logger/audit/errors vs the real _getVaf/_getLogger and
// module-local VantError/CODES). Every shape test above passed while the
// first real call threw ReferenceError. Behavior is now pinned.

test('handle: plain Error does not throw (bare-vaf bug)', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    const out = err.handle(new Error('behavior probe'));
    return { success: out instanceof Error };
});

test('handle: VantError warn path (statusCode < 500) does not throw (bare-logger bug)', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    const ve = new err.VantError('warn-path probe', { code: 'UNKNOWN', statusCode: 404 });
    const out = err.handle(ve, 'behavior');
    return { success: out === ve };
});

test('CODES: no duplicate keys (NETWORK_TIMEOUT and SUDO_DENIED were defined twice)', () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'lib', 'error.js'), 'utf8');
    const start = src.indexOf('const CODES = {');
    const end = src.indexOf('};', start);
    const block = src.slice(start, end);
    const keys = (block.match(/^\s{4}[A-Z][A-Z0-9_]*:/gm) || []).map(k => k.trim().replace(':', ''));
    const seen = new Set();
    const dupes = [];
    for (const k of keys) { if (seen.has(k)) dupes.push(k); seen.add(k); }
    if (dupes.length) return { success: false, error: `duplicate CODES keys: ${dupes.join(', ')}` };
    return true;
});

console.log('\n--- SYNC RESULTS ---');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);

// ---------- ASYNC BEHAVIORAL (serialized chain) ----------
let _chain = Promise.resolve();

function atest(name, fn) {
    _chain = _chain.then(() => {
        return Promise.resolve().then(fn).then(ok => {
            if (ok === true || (ok && ok.success)) {
                results.passed++;
                console.log(`  ✓ ${name}`);
            } else {
                results.failed++;
                console.log(`  ✗ ${name}: ${(ok && ok.error) || 'failed'}`);
            }
        }).catch(e => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        });
    });
}

console.log('\n⚠️  ERROR MODULE ASYNC BEHAVIOR\n');

atest('retry: retryable failure takes the retry path without throwing (bare-audit bug)', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    let n = 0;
    return err.retry(async () => {
        n++;
        if (n < 3) { const e = new Error('flaky'); e.retryable = true; throw e; }
        return 'done';
    }, 5, 1).then(r => {
        if (r !== 'done') return { success: false, error: 'did not resolve' };
        if (n !== 3) return { success: false, error: `expected 3 attempts, got ${n}` };
        return true;
    });
});

atest('retry: non-retryable failure throws through immediately', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    let n = 0;
    return err.retry(async () => { n++; throw new Error('fatal'); }, 5, 1).then(
        () => ({ success: false, error: 'should have thrown' }),
        e => (n === 1 && e.message === 'fatal') ? true : { success: false, error: `attempts=${n} msg=${e.message}` }
    );
});

atest('circuitBreaker: open-state rejection is VantError CIRCUIT_BREAKER_OPEN (bare-errors bug)', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    const wrapped = err.circuitBreaker(async () => { throw new Error('boom'); }, 1, 30);
    return wrapped().catch(() => {/* first failure arms the breaker */}).then(() =>
        wrapped().then(
            () => ({ success: false, error: 'open breaker let a call through' }),
            e => (e instanceof err.VantError && e.code === err.CODES.CIRCUIT_BREAKER_OPEN)
                ? true
                : { success: false, error: `got ${e.constructor.name}:${e.code || e.message}` }
        )
    );
});

atest('circuitBreaker: recovers via half-open after resetTimeout', () => {
    const err = require(path.join(ROOT, 'lib', 'error'));
    const wrapped = err.circuitBreaker(async (v) => { if (!v) throw new Error('boom'); return v; }, 1, 30);
    return wrapped(false).catch(() => {}).then(() => wrapped())
        .catch(() => ({ success: false, error: 'open-state broke before recovery' }))
        .then(() => new Promise(r => setTimeout(r, 60)))
        .then(() => wrapped(true))
        .then(v => (v === true) ? true : { success: false, error: 'half-open recovery failed' });
});

_chain.then(() => {
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
});