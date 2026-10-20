#!/usr/bin/env node
/**
 * Test-slate isolation tests (pass 292 — the sweep-order seam pin)
 *
 * The law a sweep needs (live-fire round 2, 2026-10-20): every suite must
 * start from the same baseline whatever ran before it, and a sweep must
 * leave the workspace exactly as it found it. run-all.js restores the slate
 * before EVERY suite and after the loop. These pins exercise the seam
 * itself against a REAL files tree (temp dir, never the repo's own brain):
 *
 *   1. capture mirrors the shared surfaces (state.json + active brain trees)
 *   2. restore reinstalls byte-exact content after a suite rewrote it
 *   3. restore deletes suite-created files under the baseline trees
 *   4. restore deletes a baseline file the suite deleted (suite-stealth)
 *   5. absent-baseline surfaces: state.json added by a suite is removed on
 *      restore (the shared pointer must not adopt a suite's write)
 *   6. scratch brains (gstest-shaped) are NOT touched — suites own them
 *   7. restore is idempotent (repeat restore lands the same bytes)
 *
 * Run: node test/slate.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const slate = require(path.join(ROOT, 'test', 'slate.js'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function makeTree(cwd) {
    fs.mkdirSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart'), { recursive: true });
    fs.mkdirSync(path.join(cwd, 'models', 'public', 'vant'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'models', 'state.json'), JSON.stringify({ stack: ['vant'], currentBrain: 'vant' }));
    fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'agents.json'), '[[\"agent_baseline\",{\"id\":\"agent_baseline\",\"name\":\"BASE\"}]]');
    fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'teams.json'), '{"orgs":[],"depts":[],"teams":[],"roles":[],"assignments":[]}');
    fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'store.md'), '# baseline brain file\n');
    fs.writeFileSync(path.join(cwd, 'models', 'public', 'vant', 'identity.md'), 'PUB-BASELINE\n');
}

console.log('\n🧱 TEST-SLATE ISOLATION (pass 292)\n');

test('capture + restore reinstalls byte-exact content the suite rewrote', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-t1-'));
    try {
        makeTree(cwd);
        const s = slate.captureSlate(cwd);
        // suite "rewrites" the shared surfaces
        fs.writeFileSync(path.join(cwd, 'models', 'state.json'), JSON.stringify({ stack: ['hijack'], currentBrain: 'hijack' }));
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'agents.json'), '[[\"agent_zombie\",{\"id\":\"agent_zombie\",\"name\":\"Z\"}]]');
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'store.md'), '# suite overwrote\n');

        slate.restoreSlate(null, s);

        assert(JSON.parse(fs.readFileSync(path.join(cwd, 'models', 'state.json'), 'utf8')).currentBrain === 'vant', 'state.json core did not reinstall the baseline pointer');
        assert(fs.readFileSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'agents.json'), 'utf8').includes('agent_baseline'), 'baseline roster row did not come back');
        assert(!fs.readFileSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'agents.json'), 'utf8').includes('agent_zombie'), 'suite zombie roster row survived restore');
        assert(fs.readFileSync(path.join(cwd, 'models', 'private', 'vant', 'store.md'), 'utf8').includes('baseline brain file'), 'brain file did not reinstall');
        assert(fs.readFileSync(path.join(cwd, 'models', 'public', 'vant', 'identity.md'), 'utf8') === 'PUB-BASELINE\n', 'public brain file did not reinstall');
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('restore deletes suite-created files under the baseline trees', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-t2-'));
    try {
        makeTree(cwd);
        const s = slate.captureSlate(cwd);
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'pollution.json'), '{"residue":true}');
        fs.mkdirSync(path.join(cwd, 'models', 'private', 'vant', 'state'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'state', 'residue.json'), 'x');

        slate.restoreSlate(null, s);

        assert(!fs.existsSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'pollution.json')), 'suite-created residue file survived');
        assert(!fs.existsSync(path.join(cwd, 'models', 'private', 'vant', 'state', 'residue.json')), 'suite-created state residue survived');
        // baseline files still there
        assert(fs.existsSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'teams.json')), 'restore ate a baseline file');
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('restore deletes a baseline file the suite removed (no stealth deletions)', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-t3-'));
    try {
        makeTree(cwd);
        const s = slate.captureSlate(cwd);
        fs.rmSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'agents.json'));

        slate.restoreSlate(null, s);
        assert(fs.existsSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'agents.json')), 'suite stealth-deletion survived');
        assert(JSON.parse(fs.readFileSync(path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'agents.json'), 'utf8')).length === 1, 'reinstalled roster wrong');
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('a suite-created state.json is removed when the baseline had none (fresh-install shape)', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-t4-'));
    try {
        fs.mkdirSync(path.join(cwd, 'models'), { recursive: true });
        // No state.json, no active brain trees — the fresh-install baseline.
        const s = slate.captureSlate(cwd);
        fs.writeFileSync(path.join(cwd, 'models', 'state.json'), JSON.stringify({ stack: ['sneaky'], currentBrain: 'sneaky' }));
        fs.mkdirSync(path.join(cwd, 'models', 'private', 'vant'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'leak.md'), 'leak');

        slate.restoreSlate(null, s);
        assert(!fs.existsSync(path.join(cwd, 'models', 'state.json')), 'suite state.json was adopted (the pointer leak that bit teams-refresh)');
        assert(!fs.existsSync(path.join(cwd, 'models', 'private', 'vant', 'leak.md')), 'suite-created active brain survived');
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('scratch brains the suite created are NOT touched (suites own their throwaway brains)', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-t5-'));
    try {
        makeTree(cwd);
        const s = slate.captureSlate(cwd);
        fs.mkdirSync(path.join(cwd, 'models', 'private', 'gstest', 'orgchart'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'gstest', 'orgchart', 'agents.json'), '[[\"agent_x\",{}]]');

        slate.restoreSlate(null, s);
        assert(fs.existsSync(path.join(cwd, 'models', 'private', 'gstest', 'orgchart', 'agents.json')), 'restore deleted a scratch brain it must not own');
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('restore is idempotent — twice lands the same bytes once', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-t6-'));
    try {
        makeTree(cwd);
        const s = slate.captureSlate(cwd);
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'store.md'), '# suite junk\n');
        slate.restoreSlate(null, s);
        const once = fs.readFileSync(path.join(cwd, 'models', 'private', 'vant', 'store.md'), 'utf8');
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'vant', 'store.md'), '# second pollution\n');
        slate.restoreSlate(null, s);
        assert(fs.readFileSync(path.join(cwd, 'models', 'private', 'vant', 'store.md'), 'utf8') === once, 'restore is not byte-stable across calls');
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test('capture honors VANT_BRAIN env (the path-active seam, not hardcoded vant)', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-t7-'));
    const prev = process.env.VANT_BRAIN;
    try {
        makeTree(cwd);
        fs.mkdirSync(path.join(cwd, 'models', 'private', 'envbrain'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'envbrain', 'own.md'), 'ENV-BRAIN\n');
        process.env.VANT_BRAIN = 'envbrain';
        const s = slate.captureSlate(cwd);
        assert(s.active === 'envbrain', 'capture ignored VANT_BRAIN: ' + JSON.stringify(s.active));
        fs.writeFileSync(path.join(cwd, 'models', 'private', 'envbrain', 'own.md'), 'ENV-SUITE-JUNK\n');
        slate.restoreSlate(null, s);
        assert(fs.readFileSync(path.join(cwd, 'models', 'private', 'envbrain', 'own.md'), 'utf8') === 'ENV-BRAIN\n', 'env-scoped brain did not reinstall');
        // the non-active brain tree stays untouched by restore
        assert(fs.readFileSync(path.join(cwd, 'models', 'private', 'vant', 'store.md'), 'utf8').includes('baseline'), 'restore weirdly touched a non-active brain');
    } finally {
        if (prev === undefined) delete process.env.VANT_BRAIN; else process.env.VANT_BRAIN = prev;
        fs.rmSync(cwd, { recursive: true, force: true });
    }
});

console.log(`\n=== Test-slate isolation: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
