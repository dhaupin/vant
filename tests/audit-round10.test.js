#!/usr/bin/env node
/**
 * Audit Round 10 — the swallowed-throw capability-gate class.
 *
 * Every pin here FAILS against the pre-fix code and PASSES after the fix.
 *
 * Background: lib/vaf.js, lib/security.js, lib/webhooks.js, lib/sync.js and
 * lib/storage/shared.js each probed the sandbox with an inline clone of:
 *
 *     if (sandbox && sandbox.canX) {
 *         try {
 *             if (!sandbox.canX()) { throw new VantError(...); }
 *         } catch (e) {}   // <-- swallows the refusal it just raised
 *     }
 *
 * The refusal `throw` lived INSIDE the try, so the empty catch swallowed it:
 * an explicitly configured canX:false sandbox was never enforced. The same
 * shape had already been corrected for trust/market/memory (and storage's
 * _checkReadSafe/_checkWriteSafe) by routing through lib/gate.js — these five
 * sites were missed. Routing through gate.checkCapability() consults
 * sandbox.can() (the union of static caps + sudo task scope + durable
 * grants), allows the untouched default stub with one advisory, and ENFORCES
 * once the sandbox is explicitly configured.
 *
 * A second, subtler fault: the old probes called sandbox.canX() — the STATIC
 * verdict, which is false-by-default for canWrite — so a naive "just move the
 * throw out of the try" would deny every write in a stock install. The pins
 * below therefore also assert the untouched stub still ALLOWS (degraded
 * standalone preserved), which a naive hoist would break.
 *
 * Run: node tests/audit-round10.test.js
 */

const path = require('path');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
const _asyncTests = [];

function _verdict(r) {
    if (r === true || (r && r.success)) return { ok: true };
    return { ok: false, why: (r && r.error) || (r && r.why) || 'assertion failed' };
}
function asyncTest(name, fn) { _asyncTests.push({ name, fn }); }
async function _runAsync() {
    for (const { name, fn } of _asyncTests) {
        let v;
        try { v = _verdict(await fn()); } catch (e) { v = { ok: false, why: e.message }; }
        if (v.ok) { results.passed++; console.log(`  \u2713 ${name}`); }
        else { results.failed++; console.log(`  \u2717 ${name}: ${v.why}`); }
    }
}

// Run one scenario in a FRESH process (so each sandbox posture is isolated and
// the untouched-stub case is genuinely untouched). Returns the parsed JSON the
// script prints on its last stdout line.
function _child(body, env = {}) {
    const r = cp.spawnSync(process.execPath, ['-e', body], {
        cwd: ROOT,
        env: { ...process.env, VANT_GATE_QUIET: '1', VANT_BRAIN: 'r10-scratch', ...env },
        encoding: 'utf8',
        timeout: 30000
    });
    if (r.status !== 0) throw new Error(`child exited ${r.status}: ${(r.stderr || '').slice(0, 400)}`);
    const lines = String(r.stdout).trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
}

const SB = JSON.stringify(path.join(ROOT, 'lib', 'sandbox.js'));
const SEC = JSON.stringify(path.join(ROOT, 'lib', 'security.js'));
const WH = JSON.stringify(path.join(ROOT, 'lib', 'webhooks.js'));
const SHARED = JSON.stringify(path.join(ROOT, 'lib', 'storage', 'shared.js'));
const VAF = JSON.stringify(path.join(ROOT, 'lib', 'vaf.js'));

// ==== R10-1: the READ gate enforces a configured deny ======================

asyncTest('R10-1: configured canRead:false REFUSES security.checkBrainHealth (was swallowed)', async () => {
    const out = _child(`
        const sb = require(${SB});
        sb.defaultSandbox.setCapabilities({ canRead: false });
        const security = require(${SEC});
        (async () => {
            let code = null, threw = false;
            try { await security.checkBrainHealth(); } catch (e) { threw = true; code = e.code || e.message; }
            console.log(JSON.stringify({ threw, code }));
        })();`);
    if (!out.threw) return { success: false, error: 'read gate did not fire under canRead:false (pre-fix swallow)' };
    if (out.code !== 'STORAGE_READ_DENIED') return { success: false, error: 'wrong code: ' + out.code };
    return true;
});

// ==== R10-2: the untouched stub still ALLOWS (no naive-hoist regression) ====

asyncTest('R10-2: untouched default stub still ALLOWS reads (degraded standalone preserved)', async () => {
    const out = _child(`
        const security = require(${SEC});
        (async () => {
            let threw = false, code = null;
            try { await security.checkBrainHealth(); } catch (e) { threw = true; code = e.code || e.message; }
            console.log(JSON.stringify({ threw, code }));
        })();`);
    if (out.threw) return { success: false, error: 'untouched stub wrongly DENIED (naive hoist would brick stock installs): ' + out.code };
    return true;
});

// ==== R10-3: the STORAGE WRITE gate enforces a configured deny =============

asyncTest('R10-3: configured canWrite:false REFUSES storage _checkWrite (was swallowed)', async () => {
    const out = _child(`
        const sb = require(${SB});
        sb.defaultSandbox.setCapabilities({ canWrite: false });
        const shared = require(${SHARED});
        let code = null, threw = false;
        try { shared._checkWrite(); } catch (e) { threw = true; code = e.code || e.message; }
        console.log(JSON.stringify({ threw, code }));`);
    if (!out.threw) return { success: false, error: 'write gate did not fire under canWrite:false (pre-fix swallow)' };
    if (out.code !== 'STORAGE_WRITE_DENIED') return { success: false, error: 'wrong code: ' + out.code };
    return true;
});

// ==== R10-4: the STORAGE READ gate enforces + carries a single clean code ====

asyncTest('R10-4: configured canRead:false REFUSES storage _checkRead with a single clean code', async () => {
    const out = _child(`
        const sb = require(${SB});
        sb.defaultSandbox.setCapabilities({ canRead: false });
        const shared = require(${SHARED});
        let code = null, threw = false;
        try { shared._checkRead(); } catch (e) { threw = true; code = e.code || e.message; }
        console.log(JSON.stringify({ threw, code }));`);
    if (!out.threw) return { success: false, error: 'read gate did not fire under canRead:false (pre-fix swallow)' };
    // pre-fix the (dead) throw carried a malformed double-code object; the
    // routed gate emits exactly STORAGE_READ_DENIED.
    if (out.code !== 'STORAGE_READ_DENIED') return { success: false, error: 'wrong code: ' + out.code };
    return true;
});

// ==== R10-5: the VAF WRITE gate enforces a configured deny =================

asyncTest('R10-5: configured canWrite:false REFUSES vaf write-path (audit) (was swallowed)', async () => {
    const out = _child(`
        const sb = require(${SB});
        sb.defaultSandbox.setCapabilities({ canWrite: false });
        const vaf = require(${VAF});
        let code = null, threw = false;
        try { vaf.recordFailedAttempt('203.0.113.250', 'r10'); } catch (e) { threw = true; code = e.code || e.message; }
        console.log(JSON.stringify({ threw, code }));`);
    if (!out.threw) return { success: false, error: 'vaf write gate did not fire under canWrite:false (pre-fix swallow)' };
    if (out.code !== 'WRITE_PERMISSION_REQUIRED') return { success: false, error: 'wrong code: ' + out.code };
    return true;
});

// ==== R10-6: the WEBHOOK network gate enforces a configured deny ==========

asyncTest('R10-6: configured canNetwork:false REFUSES webhooks.send before any fetch (was swallowed)', async () => {
    const out = _child(`
        const sb = require(${SB});
        sb.defaultSandbox.setCapabilities({ canNetwork: false });
        const webhooks = require(${WH});
        (async () => {
            let code = null, resolved = null, threw = false;
            try { resolved = await webhooks.send('http://127.0.0.1:9/r10-pin', { x: 1 }); }
            catch (e) { threw = true; code = e.code || e.message; }
            console.log(JSON.stringify({ threw, code, resolved }));
        })();`);
    if (!out.threw) return { success: false, error: 'network gate did not fire under canNetwork:false (pre-fix swallow); resolved=' + JSON.stringify(out.resolved) };
    if (out.code !== 'CAPABILITY_NOT_ALLOWED') return { success: false, error: 'wrong code: ' + out.code };
    return true;
});

// ==== R10-7: no source still carries the dead gate shape ===================

asyncTest('R10-7: no lib module keeps a refusal-throw inside an empty catch (class closure)', async () => {
    const fs = require('fs');

    // Brace-matching scan: a regex cannot cross the nested `if (...) {` that
    // wraps the throw in every real instance, so walk the source manually.
    // Returns [lineNo] of every `try { ...throw... } catch (e) {}`.
    function _deadGateLines(src) {
        const hits = [];
        const re = /\btry\s*\{/g;
        let m;
        while ((m = re.exec(src))) {
            const open = src.indexOf('{', m.index);
            let depth = 0, j = open;
            for (; j < src.length; j++) {
                if (src[j] === '{') depth++;
                else if (src[j] === '}') { depth--; if (depth === 0) break; }
            }
            const body = src.slice(open + 1, j);
            const rest = src.slice(j + 1);
            const cm = rest.match(/^\s*catch\s*(\([^)]*\))?\s*\{/);
            if (!cm) continue;
            const cOpen = rest.indexOf('{', cm.index);
            let d2 = 0, k = cOpen;
            for (; k < rest.length; k++) {
                if (rest[k] === '{') d2++;
                else if (rest[k] === '}') { d2--; if (d2 === 0) break; }
            }
            const cbody = rest.slice(cOpen + 1, k).trim();
            if (cbody === '' && /\bthrow\b/.test(body)) {
                hits.push({ line: src.slice(0, m.index).split('\n').length, body });
            }
        }
        return hits;
    }

    const offenders = [];
    const scan = (dir) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, ent.name);
            if (ent.isDirectory()) { scan(p); continue; }
            if (!ent.name.endsWith('.js')) continue;
            const rel = path.relative(ROOT, p);
            for (const h of _deadGateLines(fs.readFileSync(p, 'utf8'))) {
                // The documented deliberate fail-open in sync.js _checkNetwork is
                // the ONE allowed survivor; anything else is the r10 bug.
                if (rel === path.join('lib', 'sync.js') && /canNetwork/.test(h.body)) continue;
                offenders.push(rel + ':' + h.line);
            }
        }
    };
    scan(path.join(ROOT, 'lib'));
    if (offenders.length) return { success: false, error: 'dead gate shape survives in: ' + offenders.join(', ') };
    return true;
});

// ==== R10-8: the public audit-ledger read enforces a configured deny ======
// (corroborating, not discriminating: the downstream storage chain ALSO
//  refuses this read, so it passes pre-fix too. It guards against a future
//  refactor that drops the module gate without the storage backstop.)

asyncTest('R10-8: configured canRead:false REFUSES audit.getLedger (public entry)', async () => {
    const out = _child(`
        const sb = require(${SB});
        sb.defaultSandbox.setCapabilities({ canRead: false });
        const audit = require(${JSON.stringify(path.join(ROOT, 'lib', 'audit.js'))});
        let code = null, threw = false;
        try { audit.getLedger(); } catch (e) { threw = true; code = e.code || e.message; }
        console.log(JSON.stringify({ threw, code }));`);
    if (!out.threw) return { success: false, error: 'audit.getLedger did not refuse under canRead:false (pre-fix swallow)' };
    if (out.code !== 'STORAGE_READ_DENIED') return { success: false, error: 'wrong code: ' + out.code };
    return true;
});

// ==== R10-9: the public succession write enforces a configured deny =======
// (corroborating, not discriminating — the downstream storage chain also
//  refuses this write; it guards the module gate against future refactors.)

asyncTest('R10-9: configured canWrite:false REFUSES succession.setTrustLevel (public entry)', async () => {
    const out = _child(`
        const sb = require(${SB});
        sb.defaultSandbox.setCapabilities({ canWrite: false });
        const succ = require(${JSON.stringify(path.join(ROOT, 'lib', 'succession.js'))});
        let code = null, threw = false;
        try { succ.setTrustLevel('high'); } catch (e) { threw = true; code = e.code || e.message; }
        console.log(JSON.stringify({ threw, code }));`);
    if (!out.threw) return { success: false, error: 'succession.setTrustLevel did not refuse under canWrite:false (pre-fix swallow)' };
    if (out.code !== 'STORAGE_WRITE_DENIED') return { success: false, error: 'wrong code: ' + out.code };
    return true;
});

// ==== R10-10/11: the sweep gate's BROKEN heuristic ========================
// A passing test that merely MENTIONS "TypeError" in a pin description (e.g.
// audit-round2/round3: "...never a TypeError") used to be flagged BROKEN and
// fail the whole sweep. The authoritative signal is the exit code. These pins
// run a COPY of the real bin/sweep.sh against a throwaway tests/ dir so the
// genuine shell logic is exercised, not a reimplementation.

function _runSweepWithFixtures(fixtures) {
    const fs = require('fs');
    const os = require('os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r10-sweep-'));
    fs.mkdirSync(path.join(root, 'bin'));
    fs.mkdirSync(path.join(root, 'tests'));
    fs.copyFileSync(path.join(ROOT, 'bin', 'sweep.sh'), path.join(root, 'bin', 'sweep.sh'));
    for (const [name, body] of Object.entries(fixtures)) {
        fs.writeFileSync(path.join(root, 'tests', name), body);
    }
    const r = cp.spawnSync('bash', [path.join(root, 'bin', 'sweep.sh')], {
        cwd: root, encoding: 'utf8', timeout: 60000
    });
    fs.rmSync(root, { recursive: true, force: true });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

asyncTest('R10-10: a passing test that mentions "TypeError" is OK, not BROKEN', async () => {
    const r = _runSweepWithFixtures({
        // no "Passed:/Failed:" summary — the branch that used to grep the body
        'mention.test.js': "console.log('  \\u2713 pin: returns a typed error, never a TypeError'); process.exit(0);\n"
    });
    if (r.status !== 0) return { success: false, error: 'sweep exited ' + r.status + ' on a green suite; out=' + r.out.slice(0, 200) };
    if (/BROKEN/.test(r.out)) return { success: false, error: 'false-positive BROKEN: ' + r.out.slice(0, 200) };
    if (!/mention\.test\.js\s+OK/.test(r.out)) return { success: false, error: 'fixture not reported OK: ' + r.out.slice(0, 200) };
    return true;
});

asyncTest('R10-11: a genuinely broken test (non-zero exit, no keyword) IS flagged', async () => {
    const r = _runSweepWithFixtures({
        'reallybroken.test.js': "console.error('assertion exploded'); process.exit(2);\n"
    });
    if (r.status === 0) return { success: false, error: 'sweep passed a test that exited 2 (silent broken)' };
    if (!/BROKEN/.test(r.out)) return { success: false, error: 'broken test not flagged: ' + r.out.slice(0, 200) };
    return true;
});

// ==== main ==============================================================

(async () => {
    await _runAsync();
    console.log(`\n  R10: ${results.passed} passed, ${results.failed} failed`);
    process.exit(results.failed ? 1 : 0);
})();
