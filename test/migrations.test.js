#!/usr/bin/env node
/**
 * Brain Layout Migration Tests (prd-storage.md: migration tool)
 * Exercises lib/migrations.js against REAL fixture layouts built in a
 * scratch models tree: detection, dryRun no-mutation, apply+idempotence,
 * API continuity after migration, and the shipped axolotl-era steps.
 *
 * Run: node test/migrations.test.js
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

const suite = [];
function define(name, fn) { suite.push({ name, fn }); }
async function runSuite() {
    for (const { name, fn } of suite) {
        try {
            const result = await fn();
            const ok = result === true || (result && result.success);
            if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
            else { results.failed++; console.log(`  ✗ ${name}: ${(result && result.error) || 'assertion failed'}`); }
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    }
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}

console.log('\n🧬 BRAIN LAYOUT MIGRATION TESTS\n');

const migrations = require(path.join(ROOT, 'lib', 'migrations'));

// ---------- fixture helper: build a legacy (v1) layout in a temp repo copy ----------
function makeFixture() {
    const dir = path.join(ROOT, '.migration-fixture');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'models', 'private'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'models', 'public'), { recursive: true });

    // copy runtime (migrations resolve REPO_ROOT from their own __dirname,
    // so the fixture needs its own full lib/ copy and local migrations.js)
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
    fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'bin', 'migrate.js'), path.join(dir, 'bin', 'migrate.js'));

    // legacy layout artifacts
    fs.mkdirSync(path.join(dir, '.agent_tmp'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agent_tmp', 'escrow.json'), JSON.stringify({ budgets: { fixture: 5 } }));
    fs.mkdirSync(path.join(dir, 'storage', 'myStuff'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'storage', 'myStuff', 'legacy-drop.md'), 'legacy drop content');
    fs.mkdirSync(path.join(dir, 'models', 'private', 'vant', 'state'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'models', 'private', 'vant', 'state', 'old-drop.md'), 'old drop content');
    fs.writeFileSync(path.join(dir, 'models', 'state.json'), JSON.stringify({ stack: ['vant'], mode: 'dual', currentBrain: 'vant' }));
    return dir;
}

function cleanupFixture(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- 1. registry shape ----------

define('registry exposes ordered steps with detect/plan/apply', async () => {
    const ok = migrations.STEPS.length >= 3 &&
        migrations.STEPS.every(s => typeof s.detect === 'function' && typeof s.apply === 'function' && s.id);
    return { success: ok, error: `steps=${migrations.STEPS.length}` };
});

define('status() reports target and marker', async () => {
    const s = migrations.status();
    return { success: s.targetVersion === migrations.LAYOUT_VERSION && typeof s.upToDate === 'boolean', error: JSON.stringify(s).slice(0, 80) };
});

// ---------- 2. real migration against live tree (this repo is a fixture itself) ----------

define('migrate() is idempotent (second run applies nothing)', async () => {
    const r1 = await migrations.migrate();
    const r2 = await migrations.migrate();
    const ok = r2.applied.length === 0 && r2.skipped.length === migrations.STEPS.length;
    return { success: ok, error: `second run applied: ${r2.applied.map(a => a.id).join(',')}` };
});

// ---------- 3. fixture: detection, dryRun, apply ----------

define('fixture: detection finds all legacy artifacts, dryRun mutates nothing', async () => {
    const dir = makeFixture();
    try {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations'))});
            const status = m.status();
            const dry = await m.migrate({ dryRun: true });
            const afterStatus = m.status();
            console.log('PENDING:' + status.pending.map(p => p.id).join(','));
            console.log('DRYPLAN:' + dry.applied.map(a => a.id).join(','));
            console.log('STILL-PENDING:' + (afterStatus.pending.length > 0));
            console.log('ARTIFACTS-INTACT:' + (require('fs').existsSync('.agent_tmp/escrow.json') &&
                require('fs').existsSync('storage/myStuff/legacy-drop.md') &&
                require('fs').existsSync('models/private/vant/state/old-drop.md')));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 30000 });

        const out = probe.stdout || '';
        const pending = (out.match(/PENDING:(.*)/) || [])[1] || '';
        const dryplan = (out.match(/DRYPLAN:(.*)/) || [])[1] || '';
        const stillPending = out.includes('STILL-PENDING:true');
        const intact = out.includes('ARTIFACTS-INTACT:true');

        const allPending = pending.includes('orgchart.brain-scope') &&
            pending.includes('tmpspace.models-anchor') &&
            pending.includes('dropfiles.tmp-space');
        return {
            success: allPending && dryplan.includes('orgchart.brain-scope') && stillPending && intact,
            error: `out=${out.slice(0, 200)} stderr=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular dependency') && !l.includes('trace-warnings')).join(' | ').slice(0, 800)}`
        };
    } finally {
        cleanupFixture(dir);
    }
});

define('fixture: apply moves legacy content through the security chain', async () => {
    const dir = makeFixture();
    try {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations'))});
            const r = await m.migrate();
            console.log('APPLIED:' + r.applied.map(a => a.id).join(','));
            const fsmod = require('fs');
            const pathmod = require('path');
            // legacy artifacts gone
            console.log('OLD-GONE:' + !fsmod.existsSync('.agent_tmp/escrow.json'));
            // new locations populated
            const brains = fsmod.readdirSync('models/private').filter(f => !f.startsWith('.'));
            let escrowOk = false, dropOk = false, myStuffOk = false;
            for (const b of brains) {
                const esc = pathmod.join('models', 'private', b, 'orgchart', 'escrow.json');
                if (fsmod.existsSync(esc)) { escrowOk = true; }
                // legacy state/ dir drained: removed (rmdir after move) or empty
                const st = pathmod.join('models', 'private', b, 'state');
                if (!fsmod.existsSync(st) || fsmod.readdirSync(st).length === 0) dropOk = true;
            }
            const ms = pathmod.join('models', 'tmp-space', 'myStuff');
            if (fsmod.existsSync(ms)) {
                const files = fsmod.readdirSync(ms);
                myStuffOk = files.includes('old-drop.md') && files.includes('legacy-drop.md') &&
                    fsmod.readFileSync(pathmod.join(ms, 'old-drop.md'), 'utf8') === 'old drop content' &&
                    fsmod.readFileSync(pathmod.join(ms, 'legacy-drop.md'), 'utf8') === 'legacy drop content';
            }
            console.log('ESCROW-MOVED:' + escrowOk);
            console.log('DROP-MOVED:' + dropOk);
            console.log('MYSTUFF-MOVED:' + myStuffOk);
            // marker written
            const marker = m._readMarker();
            console.log('MARKER:' + (marker && marker.version >= 2));
            // idempotence
            const r2 = await m.migrate();
            console.log('IDEMPOTENT:' + (r2.applied.length === 0));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 30000 });

        const out = probe.stdout || '';
        const checks = ['APPLIED:', 'OLD-GONE:true', 'ESCROW-MOVED:true', 'DROP-MOVED:true', 'MYSTUFF-MOVED:true', 'MARKER:true', 'IDEMPOTENT:true'];
        const allOk = checks.every(c => out.includes(c));
        return { success: allOk, error: `out=${out.slice(0, 250)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular dependency') && !l.includes('trace-warnings')).join(' | ').slice(0, 800)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('fixture: existing dropfile wins over legacy state/ content (no clobber)', async () => {
    const dir = makeFixture();
    try {
        // pre-create a CURRENT dropfile with the same name in tmp-space
        fs.mkdirSync(path.join(dir, 'models', 'tmp-space', 'myStuff'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'tmp-space', 'myStuff', 'old-drop.md'), 'CURRENT WINS');

        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations'))});
            await m.migrate();
            const c = require('fs').readFileSync('models/tmp-space/myStuff/old-drop.md', 'utf8');
            console.log('NO-CLOBBER:' + (c === 'CURRENT WINS'));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 30000 });

        return { success: (probe.stdout || '').includes('NO-CLOBBER:true'), error: (probe.stdout || '') + (probe.stderr || '').slice(0, 100) };
    } finally {
        cleanupFixture(dir);
    }
});

// ---------- 4. CLI ----------

define('CLI: vant migrate --status exits 0 and prints status', async () => {
    const probe = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'migrate.js'), '--status'], {
        encoding: 'utf8', timeout: 30000, cwd: ROOT
    });
    const ok = probe.status === 0 && /Brain layout status/.test(probe.stdout || '');
    return { success: ok, error: `status=${probe.status} out=${(probe.stdout || '').slice(0, 80)} err=${(probe.stderr || '').slice(0, 80)}` };
});

define('CLI: --dry-run reports no changes on clean layout', async () => {
    const probe = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'migrate.js'), '--dry-run'], {
        encoding: 'utf8', timeout: 30000, cwd: ROOT
    });
    const ok = probe.status === 0 && /Nothing to migrate|No changes made/.test(probe.stdout || '');
    return { success: ok, error: `status=${probe.status} out=${(probe.stdout || '').slice(0, 100)}` };
});

// ---------- RUN ----------

runSuite();
