#!/usr/bin/env node
/**
 * Brain-load circuit breaker tests (audit P3 #34)
 *
 * The audit flagged: repeated brain-load failures have no breaker. The three
 * real throw paths in load() are (1) a pipeline-CRITICAL handler crashing
 * (sandbox/vaf/qos/escrow — throws straight through executePipeline),
 * (2) storage-layer errors on the options.brain direct path, and (3) the
 * recursion guard trip. A wedged storage layer or a poisoned pipeline handler
 * therefore hammers every load call forever, and _metrics.errors was
 * reset-but-never-incremented (dead telemetry).
 *
 * Contract pinned here:
 *   1. load failures increment _metrics.errors (alive again) and feed a
 *      per-module circuit breaker.
 *   2. After `threshold` consecutive failures, load() short-circuits with a
 *      coded retryable VantError (BRAIN_CIRCUIT_OPEN) instead of invoking the
 *      failing machinery — fast-fail, no thundering herd.
 *   3. A SUCCESSFUL load closes the breaker (success-through check).
 *   4. Breaker state is exposed via getMetrics() and a dedicated
 *      getLoadCircuitStatus(); resettable via resetLoadCircuit().
 *   5. Tunables: VANT_BRAIN_CIRCUIT_THRESHOLD / _RESET_MS; test injection via
 *      _setLoadCircuitThreshold() (established _set* DI pattern).
 *   6. Breaker OPENS only on real failures — graceful null misses (brain not
 *      found) must NOT feed it (they're the dominant normal case).
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
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
                console.log(`  ✗ ${name}: ${msg}`);
            }
        }).catch(e => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        });
    });
}

console.log('\n🔌 BRAIN-LOAD CIRCUIT BREAKER TESTS (P3 #34)\n');

// ---------- setup ----------

const brain = require(path.join(ROOT, 'lib', 'brain.js'));
const errorsMod = require(path.join(ROOT, 'lib', 'error.js'));

// Grant sandbox caps like the other suites (orgflow pattern) — we're testing
// the breaker, not the gate.
const _sandbox = require(path.join(ROOT, 'lib', 'sandbox.js'));
try {
    _sandbox.setScopes(['read', 'write', 'spawn']);
    _sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
} catch (e) { /* older sandbox shape — fine, gate isn't under test */ }

// Isolate from the real models tree: point VANT_MODEL_PATH at a temp dir so
// breaker-failure fixtures never touch the repo brain files.
const os = require('os');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-brainbreaker-'));
fs.mkdirSync(path.join(tmpRoot, 'models', 'private', 'vant'), { recursive: true });
fs.mkdirSync(path.join(tmpRoot, 'models', 'public', 'vant'), { recursive: true });
fs.writeFileSync(path.join(tmpRoot, 'models', 'private', 'vant', 'identity.md'), 'NAME: vant\n');
const prevModelPath = process.env.VANT_MODEL_PATH;
process.env.VANT_MODEL_PATH = tmpRoot;
brain.invalidateCache();
brain.invalidateCorpusCache();

const cleanup = () => {
    if (prevModelPath === undefined) delete process.env.VANT_MODEL_PATH;
    else process.env.VANT_MODEL_PATH = prevModelPath;
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
};

// ---------- 1. Shape ----------

test('shape: getLoadCircuitStatus + resetLoadCircuit + threshold injection exist', () => {
    if (typeof brain.getLoadCircuitStatus !== 'function') return { success: false, error: 'getLoadCircuitStatus missing' };
    if (typeof brain.resetLoadCircuit !== 'function') return { success: false, error: 'resetLoadCircuit missing' };
    if (typeof brain._setLoadCircuitThreshold !== 'function') return { success: false, error: '_setLoadCircuitThreshold missing (test DI)' };
    return true;
});

test('shape: breaker starts closed', () => {
    brain.resetLoadCircuit();
    const st = brain.getLoadCircuitStatus();
    if (st.state !== 'CLOSED') return { success: false, error: `initial state ${st.state}` };
    if (st.failures !== 0) return { success: false, error: `initial failures ${st.failures}` };
    return true;
});

// ---------- 2. The breaker opens on repeated failures ----------

test('breaker: threshold consecutive load failures open it; calls short-circuit with BRAIN_CIRCUIT_OPEN', () => {
    brain.resetLoadCircuit();
    brain._setLoadCircuitThreshold(3);

    // Poison the pipeline with a critical handler that always throws —
    // failure path #1 (critical handler crash), real production shape.
    // (register() takes the HANDLER; addMiddleware's first arg is the MODE.)
    const boom = () => { throw new Error('handler wedged'); };
    brain.setPipeline(['sandbox', 'vaf', 'qos', 'escrow']);
    brain.register('sandbox', boom);

    const attempt = () => brain.load('identity-probe-breaker').then(
        v => ({ resolved: v }),
        e => ({ rejected: e })
    );

    return attempt().then(r1 => {
        if (!r1.rejected) return { success: false, error: 'poisoned pipeline did not throw' };
        return attempt().then(r2 =>
            attempt().then(r3 => {
                const st = brain.getLoadCircuitStatus();
                if (st.state !== 'OPEN') return { success: false, error: `state after 3 failures: ${st.state} (failures=${st.failures})` };
                // Next call must SHORT-CIRCUIT with the coded error
                return attempt().then(r4 => {
                    const e = r4.rejected;
                    if (!e) return { success: false, error: 'open breaker did not short-circuit' };
                    if (e.code !== 'BRAIN_CIRCUIT_OPEN') return { success: false, error: `code ${e.code}` };
                    if (e.retryable !== true) return { success: false, error: 'short-circuit error not retryable' };
                    if (!(e instanceof errorsMod.VantError)) return { success: false, error: 'not a VantError' };
                    return true;
                });
            })
        );
    }).finally(() => {
        brain._clearHandlerOverride('sandbox');
        brain.setPipeline(['sandbox', 'vaf', 'qos', 'escrow']);
    });
});

test('telemetry: _metrics.errors increments on load failures (was dead)', () => {
    brain.resetLoadCircuit();
    brain._setLoadCircuitThreshold(50); // keep closed for this test
    brain.resetMetrics();
    const before = brain.getMetrics().errors;

    const boom = () => { throw new Error('telemetry probe'); };
    brain.register('sandbox', boom);
    return brain.load('identity-probe-telemetry').catch(() => {}).then(() => {
        brain._clearHandlerOverride('sandbox');
        const after = brain.getMetrics().errors;
        if (after <= before) return { success: false, error: `errors did not increment (${before} → ${after})` };
        return true;
    });
});

// ---------- 3. Recovery ----------

test('shape: resetMs exposed in status', () => {
    const st = brain.getLoadCircuitStatus();
    if (!('resetMs' in st)) return { success: false, error: 'resetMs missing from status' };
    return true;
});

test('recovery: half-open probe after reset window; success closes the breaker', () => {
    brain.resetLoadCircuit();
    brain._setLoadCircuitThreshold(2);
    brain._setLoadCircuitResetMs(30); // probe window: 30ms

    const boom = () => { throw new Error('flap probe'); };
    brain.register('sandbox', boom);
    return brain.load('identity-probe-flap').catch(() => {})
        .then(() => brain.load('identity-probe-flap').catch(() => {}))
        .then(() => {
            if (brain.getLoadCircuitStatus().state !== 'OPEN') {
                return { success: false, error: 'breaker did not open after 2 failures' };
            }
            // Heal the pipeline; the NEXT load after the reset window is the
            // half-open probe — its success closes the breaker.
            brain._clearHandlerOverride('sandbox');
            return new Promise(r => setTimeout(r, 60)).then(() => brain.load('identity')).then(res => {
                const st = brain.getLoadCircuitStatus();
                if (st.state !== 'CLOSED') return { success: false, error: `after probe success state=${st.state}` };
                if (!res || !res.content) return { success: false, error: 'probe load returned nothing' };
                return true;
            }, e => ({ success: false, error: `probe load threw: ${e.message}` }));
        })
        .finally(() => {
            brain.resetLoadCircuit();
            brain._setLoadCircuitResetMs(null);
        });
});

test('recovery: half-open probe FAILURE re-opens the breaker', () => {
    brain.resetLoadCircuit();
    brain._setLoadCircuitThreshold(1);
    brain._setLoadCircuitResetMs(30);

    const boom = () => { throw new Error('still wedged'); };
    brain.register('sandbox', boom);
    return brain.load('identity-probe-reopen').catch(() => {})
        .then(() => {
            if (brain.getLoadCircuitStatus().state !== 'OPEN') return { success: false, error: 'did not open' };
            // Wait past the window; the probe is still poisoned → must re-open
            return new Promise(r => setTimeout(r, 60)).then(() => brain.load('identity-probe-reopen').catch(e => e));
        })
        .then(firstProbe => {
            if (!firstProbe || firstProbe.message !== 'still wedged') return { success: false, error: `probe did not execute: ${firstProbe && firstProbe.message}` };
            const st = brain.getLoadCircuitStatus();
            if (st.state !== 'OPEN') return { success: false, error: `failed probe left ${st.state}` };
            // and the NEXT call short-circuits again (probing flag consumed)
            return brain.load('identity-probe-reopen').catch(e => e);
        })
        .then(secondCall => {
            if (!secondCall || secondCall.code !== 'BRAIN_CIRCUIT_OPEN') return { success: false, error: `post-probe call: ${secondCall && secondCall.message}` };
            return true;
        })
        .finally(() => {
            brain._clearHandlerOverride('sandbox');
            brain.resetLoadCircuit();
            brain._setLoadCircuitResetMs(null);
        });
});

test('reset: resetLoadCircuit() clears state + failures', () => {
    brain._setLoadCircuitThreshold(1);
    const boom = () => { throw new Error('reset probe'); };
    brain.register('sandbox', boom);
    return brain.load('identity-probe-reset').catch(() => {}).then(() => {
        if (brain.getLoadCircuitStatus().state !== 'OPEN') return { success: false, error: 'did not open at threshold 1' };
        brain.resetLoadCircuit();
        const st = brain.getLoadCircuitStatus();
        if (st.state !== 'CLOSED' || st.failures !== 0) return { success: false, error: `reset left ${st.state}/${st.failures}` };
        return true;
    }).finally(() => {
        brain._clearHandlerOverride('sandbox');
        brain.resetLoadCircuit();
        brain._setLoadCircuitThreshold(null); // back to env/default
    });
});

// ---------- 4. Nulls are NOT failures ----------

test('graceful misses: load of a nonexistent brain returns null WITHOUT feeding the breaker', () => {
    brain.resetLoadCircuit();
    brain._setLoadCircuitThreshold(2);
    return brain.load('definitely-not-a-real-brain-xyz').then(miss => {
        if (miss !== null) return { success: false, error: 'expected graceful null' };
        const st = brain.getLoadCircuitStatus();
        if (st.failures !== 0 || st.state !== 'CLOSED') {
            return { success: false, error: `null miss fed breaker: ${st.state}/${st.failures}` };
        }
        return true;
    }).finally(() => {
        brain.resetLoadCircuit();
        brain._setLoadCircuitThreshold(null);
    });
});

test('status shape: exposes threshold, failures, state, lastError', () => {
    brain.resetLoadCircuit();
    const st = brain.getLoadCircuitStatus();
    for (const k of ['state', 'failures', 'threshold', 'lastError']) {
        if (!(k in st)) return { success: false, error: `status missing ${k}` };
    }
    return true;
});

// ---------- done ----------

_chain.then(() => {
    brain.resetLoadCircuit();
    brain._setLoadCircuitThreshold(null);
    cleanup();
    console.log(`\n${results.passed} passed, ${results.failed} failed\n`);
    process.exit(results.failed === 0 ? 0 : 1);
});
