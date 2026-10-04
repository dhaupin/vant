#!/usr/bin/env node
/**
 * EPIPE fatal-storm guard (pass 113, live-fire).
 *
 * Proves lib/vant.js's global fatal handlers cannot flood the audit ledger.
 * The Oct 2-4 incident: zombie probes with dead stdio pipes threw 'write
 * EPIPE' uncaughtExceptions; the old handler console.error()'d each one
 * (re-entering itself via the broken stream) and audit.log()'d each one
 * (whole-file ledger rewrite each pass) -> 165k rows / 47 MB of noise.
 *
 * The child simulates the broken stream faithfully (process.stderr.write
 * fails ASYNC with EPIPE, exactly like a dead pipe) and throws real
 * uncaughtExceptions carrying the EPIPE signature. Pass criteria:
 *   - the storm actually happened (many real fatals + EPIPE re-entries)
 *   - the ledger grew by only a bounded, cool-down-spaced number of rows
 *
 * The child runs against a SCRATCH brain (qc-epipe-guard via VANT_BRAIN) -
 * the real vant ledger is never touched.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { fork } = require('child_process');
const fs = require('fs');
const os = require('os');

const RESULTS = path.join(os.tmpdir(), 'epipe-guard-results.json'); // shared name: child+parent agree
const LEDGER_REL = path.join('models', 'private', 'qc-epipe-guard', '.audit.json');
const SCRATCH_DIR = path.join(ROOT, 'models', 'private', 'qc-epipe-guard');

const results = { passed: 0, failed: 0 };
function test(name, fn) {
    try {
        const r = fn();
        if (r === true || (r && r.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${r && r.error || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

const readRows = () => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, LEDGER_REL), 'utf8')).entries.length; }
    catch (e) { return 0; }
};

console.log('\n📋 EPIPE FATAL-STORM GUARD\n');

// ---------- child branch ----------
if (process.argv.includes('--child')) {
    process.env.VANT_BRAIN = 'qc-epipe-guard'; // isolate: scratch brain ledger
    // The REAL production handler (lib/vant.js) under fire.
    require(path.join(ROOT, 'lib', 'vant'));

    let seenUncaughtEPIPE = 0;
    process.on('uncaughtException', (e) => {
        if (e && e.code === 'EPIPE') seenUncaughtEPIPE++; // counting listener only
    });

    // Broken stderr: async EPIPE, exactly like a dead pipe.
    let stderrWrites = 0;
    process.stderr.write = function patchedWrite(chunk, cb) {
        stderrWrites++;
        setImmediate(() => {
            const e = new Error('write EPIPE');
            e.code = 'EPIPE';
            e.syscall = 'write';
            if (typeof cb === 'function') cb(e);
            else this.emit('error', e); // unhandled 'error' -> uncaughtException
        });
        return false;
    };

    const rowsBefore = readRows();
    let thrown = 0;
    const iv = setInterval(() => {
        thrown++;
        const err = new Error('write EPIPE');
        err.code = 'EPIPE';
        throw err;
    }, 1);

    setTimeout(() => {
        clearInterval(iv);
        // Let async re-entries drain, then report.
        setTimeout(() => {
            const rowsAfter = readRows();
            fs.writeFileSync(RESULTS, JSON.stringify({
                thrown, stderrWrites, seenUncaughtEPIPE, rowsBefore, rowsAfter
            }));
            process.exit(0);
        }, 1500);
    }, 1500);
    setTimeout(() => process.exit(2), 9000).unref(); // safety
    return;
}

// ---------- parent / suite ----------
fs.mkdirSync(SCRATCH_DIR, { recursive: true });
const child = fork(__filename, ['--child'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], cwd: ROOT });
child.stdout.on('data', () => {});
child.stderr.on('data', () => {});
child.on('exit', () => { runSuite(); });

function runSuite() {
    test('fatal storm is bounded by the handler guard', () => {
        let r = {};
        try { r = JSON.parse(fs.readFileSync(RESULTS, 'utf8')); } catch (e) { return { success: false, error: 'no child results' }; }
        const added = r.rowsAfter - r.rowsBefore;
        const stormReal = r.thrown > 100 && r.seenUncaughtEPIPE > 10;
        const bounded = added >= 1 && added <= 5;
        if (!stormReal) return { success: false, error: 'storm did not run (thrown=' + r.thrown + ', reentries=' + r.seenUncaughtEPIPE + ')' };
        if (!bounded) return { success: false, error: 'unbounded: ' + added + ' rows for ' + r.thrown + ' fatals / ' + r.seenUncaughtEPIPE + ' re-entries' };
        console.log(`    storm: ${r.thrown} fatals, ${r.seenUncaughtEPIPE} EPIPE re-entries -> ${added} ledger rows`);
        return { success: true };
    });

    test('storm stayed on the scratch brain (real ledger untouched)', () => {
        try {
            const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'models', 'private', 'vant', '.audit.json'), 'utf8'));
            const epipes = (real.entries || []).filter(e => e.action && e.action.component === 'fatal'
                && e.action.error === 'write EPIPE').length;
            return { success: epipes === 0, error: epipes + ' EPIPE rows in the real vant ledger' };
        } catch (e) { return { success: true }; } // no real ledger = untouched
    });

    // ---------- cleanup ----------
    try { fs.rmSync(SCRATCH_DIR, { recursive: true, force: true }); } catch (e) {}
    try { fs.unlinkSync(RESULTS); } catch (e) {}

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}
