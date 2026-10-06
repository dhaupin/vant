#!/usr/bin/env node
/**
 * BIN-TRUTHFULNESS ESCAPE-HATCH GATE (pass 119) — the lint's documented
 * STATUS-FIELD-OK opt-out must actually WORK.
 *
 * History: scripts/check-bin-truthfulness.js documents an escape hatch
 * ("// STATUS-FIELD-OK: <reason> on the line opts out of (a)"), but the
 * tripwire checked the marker against the COMMENT-STRIPPED source — where
 * comments no longer exist. The hatch was dead code since pass 80, which
 * made bin/health.js's legitimate `lock.stats().held` mutex-counter read
 * a permanent unfixable red gate (carried since pass 117).
 *
 * The pass-119 repair checks the marker against the RAW lines (stripComments
 * is a 1:1 line map, so indexes align). These gates pin BOTH sides:
 *   A. a phantom-field read WITHOUT the marker still fails the gate
 *   B. the same read WITH the marker passes (the hatch is alive again)
 *   C. the hatch is line-scoped: an unmarked OTHER phantom line in the
 *      same file still fails
 *
 * (temp fixture bin/zz-gate-tmp.js, removed on exit)
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(ROOT, 'bin', 'zz-gate-tmp.js');
const results = { passed: 0, failed: 0 };
function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
function cleanup() {
    try { fs.rmSync(FIXTURE, { force: true }); } catch (e) { /* best effort */ }
}
process.on('exit', cleanup);

function writeFixture(lines) {
    fs.writeFileSync(FIXTURE, lines.join('\n') + '\n');
}
function runGate() {
    const r = spawnSync('node', ['scripts/check-bin-truthfulness.js'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('\n🚪 BIN-TRUTHFULNESS ESCAPE-HATCH GATE (pass 119)\n');

// The phantom read that started it: lock.stats() genuinely returns `held`
// (mutex counter: acquire refused by a live peer), but the file-granular
// tripwire cannot know that — this is exactly what the hatch is FOR.
const BASE = [
    "'use strict';",
    "const h = require('../lib/health');",
    "const s = h.getStatus();",
    "console.log('held=' + s.held);"
];

try {
    // Gate A — no marker: the tripwire must fire.
    writeFixture(BASE);
    let g = runGate();
    report('gate A: unmarked phantom field FAILS the gate',
        g.code === 1 && g.out.includes('BIN-TRUTHFULNESS GATE: FAIL')
        && g.out.includes('bin/zz-gate-tmp.js') && /\.held\b/.test(g.out),
        g.out.slice(0, 160));

    // Gate B — with the marker on the offending line: the hatch opts out.
    writeFixture([
        "'use strict';",
        "const h = require('../lib/health');",
        "const s = h.getStatus();",
        "console.log('held=' + s.held); // STATUS-FIELD-OK: real lock.stats() mutex counter, not ledger data"
    ]);
    g = runGate();
    report('gate B: marked phantom field PASSES (hatch alive)',
        g.code === 0 && g.out.includes('BIN-TRUTHFULNESS GATE: PASS'),
        g.out.slice(0, 160));

    // Gate C — the hatch is line-scoped, not file-scoped: a second,
    // unmarked phantom line must still fail.
    writeFixture([
        "'use strict';",
        "const h = require('../lib/health');",
        "const s = h.getStatus();",
        "console.log('held=' + s.held); // STATUS-FIELD-OK: real field",
        "console.log('budgets=' + s.budgets);"
    ]);
    g = runGate();
    const violLines = g.out.split('\n').filter(l => l.includes('zz-gate-tmp.js:'));
    report('gate C: unmarked OTHER phantom line in the same file still FAILS',
        g.code === 1 && violLines.some(l => l.includes('zz-gate-tmp.js:5'))
        && !violLines.some(l => l.includes('zz-gate-tmp.js:4')),
        g.out.slice(0, 160));
} catch (e) {
    report('harness', false, e.message);
} finally {
    cleanup();
}

console.log(`\n--- RESULTS ---`);
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
process.exit(results.failed > 0 ? 1 : 0);
