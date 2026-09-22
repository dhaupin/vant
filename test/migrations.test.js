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
const { spawnSync, spawn } = require('child_process');
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

// ---------- fixture helper: build a PRE-MULTIBRAIN (main-style) layout ----------
// Mirrors origin/main's tree: flat models/public/*.md + dirs, empty/absent
// models/private, state.json with NO stack key.
function makeLegacyMainFixture() {
    const dir = path.join(ROOT, '.migration-fixture-legacy-main');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'models', 'public'), { recursive: true });
    // models/private NOT created (absent on main users' trees)

    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
    fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'bin', 'migrate.js'), path.join(dir, 'bin', 'migrate.js'));

    // flat public brain (the old single-public-brain style)
    fs.writeFileSync(path.join(dir, 'models', 'public', 'identity.md'), '# identity — legacy user');
    fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons.md'), '# lessons — legacy user');
    fs.writeFileSync(path.join(dir, 'models', 'public', 'goals.md'), '# goals — legacy user');
    fs.writeFileSync(path.join(dir, 'models', 'public', '_succession.json'), '{"trust":"high"}');
    fs.mkdirSync(path.join(dir, 'models', 'public', 'boot'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'models', 'public', 'boot', 'start.md'), '# start');
    fs.mkdirSync(path.join(dir, 'models', 'public', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'models', 'public', 'agents', 'claude.json'), '{"name":"claude"}');

    // old-style state.json: neurons only, NO stack
    fs.writeFileSync(path.join(dir, 'models', 'state.json'), JSON.stringify({ neurons: { attention: { identity: 0.2 } } }));
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
        return { success: allOk, error: `out=${out.slice(0, 600)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular dependency') && !l.includes('trace-warnings')).join(' | ').slice(0, 800)}` };
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

// ---------- 5. legacy main-style layout → multibrain (the merge-safety migration) ----------

define('legacy-main: detection fires only on the true flat layout', async () => {
    const dir = makeLegacyMainFixture();
    try {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations'))});
            console.log('PENDING:' + m.status().pending.map(p => p.id).join(','));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 30000 });
        const pending = (probe.stdout || '').match(/PENDING:(.*)/);
        return { success: !!pending && pending[1].includes('legacy.multibrain-import'),
                 error: `out=${(probe.stdout || '').slice(0, 150)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 500)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: no false positive on multibrain trees', async () => {
    // The LIVE tree is multibrain (models/private/<brain> exists, stack in state) —
    // detection must not fire here.
    const probe = spawnSync(process.execPath, ['-e', `
        (async () => {
        process.chdir(${JSON.stringify(ROOT)});
        const m = require(${JSON.stringify(path.join(ROOT, 'lib', 'migrations'))});
        console.log('PENDING:' + m.status().pending.map(p => p.id).join(','));
        })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
    `], { encoding: 'utf8', timeout: 30000 });
    const pending = (probe.stdout || '').match(/PENDING:(.*)/);
    return { success: !!pending && !pending[1].includes('legacy.multibrain-import'),
             error: `false positive: ${pending ? pending[1] : 'no output'}` };
});

define('legacy-main: dry-run plans moves into <name>, mutates nothing', async () => {
    const dir = makeLegacyMainFixture();
    try {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations'))});
            const dry = await m.migrate({ dryRun: true });
            const step = dry.applied.find(a => a.id === 'legacy.multibrain-import');
            const fsmod = require('fs');
            console.log('PLAN-FILES:' + (step ? step.plan.filter(p => p.to.includes('/vant/')).length : 0));
            console.log('STILL-FLAT:' + fsmod.existsSync('models/public/identity.md'));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 30000 });
        const out = probe.stdout || '';
        const planFiles = parseInt((out.match(/PLAN-FILES:(\d+)/) || [])[1] || '0', 10);
        return { success: planFiles >= 5 && out.includes('STILL-FLAT:true'),
                 error: `out=${out.slice(0, 200)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: apply nests brain under models/{public,private}/vant, synthesizes stack', async () => {
    const dir = makeLegacyMainFixture();
    try {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations'))});
            const r = await m.migrate();
            const fsmod = require('fs');
            const pathmod = require('path');
            console.log('APPLIED:' + r.applied.map(a => a.id).join(','));
            // flat content gone from public root
            console.log('FLAT-GONE:' + (!fsmod.existsSync('models/public/identity.md') && !fsmod.existsSync('models/public/lessons.md')));
            // nested under the named brain
            console.log('NESTED:' + fsmod.readFileSync('models/public/vant/identity.md', 'utf8').includes('legacy user'));
            console.log('BOOT-NESTED:' + fsmod.existsSync('models/public/vant/boot/start.md'));
            console.log('SUCCESSION-NESTED:' + fsmod.existsSync('models/public/vant/_succession.json'));
            // state.json synthesized with stack
            const state = JSON.parse(fsmod.readFileSync('models/state.json', 'utf8'));
            console.log('STACK:' + JSON.stringify({ s: state.stack, c: state.currentBrain, n: !!(state.neurons && state.neurons.attention) }));
            // marker at v3
            console.log('MARKER-V3:' + (m._readMarker() || {}).version);
            // idempotence
            const r2 = await m.migrate();
            console.log('IDEMPOTENT:' + (r2.applied.filter(a => a.id === 'legacy.multibrain-import').length === 0));
            // apply() self-verifies through the real loader (resync + invalidate
            // + corpus) — the AUTHORITATIVE in-process check
            const stepResult = r.applied.find(a => a.id === 'legacy.multibrain-import');
            console.log('VERIFIED:' + (stepResult && stepResult.result && stepResult.result.verified === true));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 45000 });
        const out = probe.stdout || '';
        const stderrClean = (probe.stderr || '')
            .split('\n')
            .filter(l => !l.includes('circular') && !l.includes('trace-warnings'))
            .join('|')
            .slice(0, 900);
        const checks = ['APPLIED:', 'FLAT-GONE:true', 'NESTED:true', 'BOOT-NESTED:true', 'SUCCESSION-NESTED:true',
                        'STACK:', 'MARKER-V3:3', 'IDEMPOTENT:true', 'VERIFIED:true'];
        const missing = checks.filter(c => !out.includes(c));
        if (missing.length > 0) {
            return { success: false,
                     error: `missing=${missing.join(',')} out=${out.slice(0, 600)} err=${stderrClean}` };
        }

        // THE USER EXPERIENCE: a FRESH process (next vant command) must read
        // the migrated brain. Assert in a second, clean node process.
        const readProbe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const brain = require(${JSON.stringify(path.join(dir, 'lib', 'brain.js'))});
            brain.setMode('dual');
            const id = await brain.read('identity');
            console.log('BRAIN-READS:' + (id && (id.content || '').includes('legacy user')));
            const c = brain.loadCorpus({ sync: true });
            console.log('CORPUS-N:' + c.length);
            })().catch(e => { console.error('READ-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 45000 });
        const readOut = readProbe.stdout || '';
        return { success: readOut.includes('BRAIN-READS:true') && /CORPUS-N:[1-9]/.test(readOut),
                 error: `readOut=${readOut.slice(0, 300)} readErr=${(readProbe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: private-brain content imports under the same chosen name (both scopes)', async () => {
    const dir = makeLegacyMainFixture();
    try {
        // main's model: ONE user, TWO scopes — public brain flat in
        // models/public, private brain flat in models/private (with
        // category subdirs like state/, canvas/). Both must land under the
        // SAME chosen name, categories nested, state store NOT hijacked by
        // the dropfiles step (which is why this import runs LAST).
        fs.mkdirSync(path.join(dir, 'models', 'private'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'private', 'journal.md'), '# private journal');
        fs.mkdirSync(path.join(dir, 'models', 'private', 'state'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'private', 'state', 'session.json'), '{"k":1}');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');

        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            await m.migrate({ brainName: 'mybrain' });
            const f = require('fs');
            console.log('PRIV-JOURNAL:' + f.readFileSync('models/private/mybrain/journal.md', 'utf8').includes('private journal'));
            console.log('PRIV-STATE:' + f.readFileSync('models/private/mybrain/state/session.json', 'utf8'));
            console.log('PUB-ID:' + f.readFileSync('models/public/mybrain/identity.md', 'utf8').includes('legacy user'));
            const st = JSON.parse(f.readFileSync('models/state.json', 'utf8'));
            console.log('STACK:' + JSON.stringify(st.stack));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000, cwd: dir });
        const out = probe.stdout || '';
        return { success: out.includes('PRIV-JOURNAL:true') && out.includes('PRIV-STATE:{"k":1}') &&
                        out.includes('PUB-ID:true') && out.includes('STACK:["mybrain"]'),
                 error: `out=${out.slice(0, 300)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: fresh-process reads span both scopes after import', async () => {
    const dir = makeLegacyMainFixture();
    try {
        fs.mkdirSync(path.join(dir, 'models', 'private'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'private', 'journal.md'), '# private journal');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
        // migrate in proc 1
        spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            await m.migrate({ brainName: 'mybrain' });
            })().catch(e => { console.error(e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000, cwd: dir });
        // fresh proc 2: plain reads find both scopes (private current brain + public fallback)
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const brain = require(${JSON.stringify(path.join(dir, 'lib', 'brain.js'))});
            brain.setMode('dual');
            const j = await brain.read('journal');
            console.log('READ-PRIV:' + (j && /private journal/.test(j.content || '')));
            const id = await brain.read('identity');
            console.log('READ-PUB:' + (id && /legacy user/.test(id.content || '')));
            })().catch(e => { console.error('READ-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000, cwd: dir });
        const out = probe.stdout || '';
        return { success: out.includes('READ-PRIV:true') && out.includes('READ-PUB:true'),
                 error: `out=${out.slice(0, 250)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: --brain-name flag names the imported brain', async () => {
    const dir = makeLegacyMainFixture();
    try {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations'))});
            await m.migrate({ brainName: 'nova' });
            const fsmod = require('fs');
            console.log('NOVA-NESTED:' + fsmod.existsSync('models/public/nova/identity.md'));
            console.log('NO-DEFAULT-DIR:' + !fsmod.existsSync('models/public/vant'));
            const state = JSON.parse(fsmod.readFileSync('models/state.json', 'utf8'));
            console.log('NOVA-STACK:' + JSON.stringify(state.stack));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 30000 });
        const out = probe.stdout || '';
        // NOTE: no 'vant dir must not exist' assertion — brain initialization
        // may legitimately materialize its default public brain dir; the
        // contract is that the IMPORTED content + stack use the chosen name.
        const errClean = (probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 500);
        return { success: out.includes('NOVA-NESTED:true') && out.includes('NOVA-STACK:["nova"]'),
                 error: `out=${out.slice(0, 700)} err=${errClean}` };
    } finally {
        cleanupFixture(dir);
    }
});

// ---------- 6. alert surfaces (CLI banner + MCP tool) ----------

define('CLI: start auto-migrate shows friendly legacy banner on a main-style tree', async () => {
    const dir = makeLegacyMainFixture();
    try {
        // start.js needs the full bin/runtime; copy what it spawns
        fs.copyFileSync(path.join(ROOT, 'bin', 'start.js'), path.join(dir, 'bin', 'start.js'));
        fs.copyFileSync(path.join(ROOT, 'bin', 'health.js'), path.join(dir, 'bin', 'health.js'));
        fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
        const probe = spawnSync(process.execPath, ['-e', `
            const { spawn } = require('child_process');
            const p = spawn(process.execPath, ['bin/start.js'], { stdio: ['ignore','pipe','inherit'] });
            let out = '';
            p.stdout.on('data', d => out += d);
            p.on('close', () => console.log('BANNER:' + /BRAIN MIGRATED/.test(out)));
        `], { encoding: 'utf8', timeout: 120000, cwd: dir });
        const out = (probe.stdout || '').match(/BANNER:(\w+)/);
        return { success: !!out && out[1] === 'true',
                 error: `out=${(probe.stdout || '').slice(0, 200)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 300)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('CLI: second start shows no banner (idempotent, no re-alert)', async () => {
    const dir = makeLegacyMainFixture();
    try {
        fs.copyFileSync(path.join(ROOT, 'bin', 'start.js'), path.join(dir, 'bin', 'start.js'));
        fs.copyFileSync(path.join(ROOT, 'bin', 'health.js'), path.join(dir, 'bin', 'health.js'));
        fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
        const run = () => new Promise(resolve => {
            const p = spawn(process.execPath, ['bin/start.js'], { stdio: ['ignore', 'pipe', 'ignore'] });
            let out = '';
            p.stdout.on('data', d => out += d);
            p.on('close', () => resolve(out));
        });
        await run(); // migrates
        const second = await run(); // no-op
        return { success: !/BRAIN MIGRATED/.test(second) && /Brain layout OK/.test(second),
                 error: `second-run-out=${second.slice(0, 200)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('MCP: brain_migration_status reports legacy + guidance on a legacy tree', async () => {
    const dir = makeLegacyMainFixture();
    try {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const mcp = require(${JSON.stringify(path.join(dir, 'lib', 'mcp.js'))});
            const r = await mcp.execute('brain_migration_status', {});
            console.log('LEGACY:' + r.legacy);
            console.log('GUIDANCE-HAS-MIGRATE:' + /vant migrate/.test(r.guidance || ''));
            console.log('GUIDANCE-HAS-NAME:' + /--brain-name/.test(r.guidance || ''));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000, cwd: dir });
        const out = probe.stdout || '';
        return { success: out.includes('LEGACY:true') && out.includes('GUIDANCE-HAS-MIGRATE:true') && out.includes('GUIDANCE-HAS-NAME:true'),
                 error: `out=${out.slice(0, 250)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('MCP: brain_migration_status reports up-to-date on migrated tree', async () => {
    const dir = makeLegacyMainFixture();
    try {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const migrations = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            await migrations.migrate();
            const mcp = require(${JSON.stringify(path.join(dir, 'lib', 'mcp.js'))});
            const r = await mcp.execute('brain_migration_status', {});
            console.log('LEGACY:' + r.legacy);
            console.log('UPTODATE:' + r.upToDate);
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000, cwd: dir });
        const out = probe.stdout || '';
        return { success: out.includes('LEGACY:false') && out.includes('UPTODATE:true'),
                 error: `out=${out.slice(0, 250)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('read(): dual-mode public fallback finds migrated content (default type path)', async () => {
    const dir = makeLegacyMainFixture();
    try {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const migrations = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            await migrations.migrate();
            const brain = require(${JSON.stringify(path.join(dir, 'lib', 'brain.js'))});
            brain.setMode('dual');
            // Plain read() must find the migrated content: either via the
            // current-brain root (which resolves to the public brain on a
            // legacy tree — brain type detection) or via the dual-mode
            // public fallback. Either way the USER sees their old brain.
            const id = await brain.read('identity');
            console.log('FALLBACK:' + (id && /legacy user/.test(id.content || '')));
            const pub = await brain.read('identity', { type: 'public' });
            console.log('EXPLICIT-PUBLIC:' + (pub && /legacy user/.test(pub.content || '')));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000, cwd: dir });
        const out = probe.stdout || '';
        return { success: out.includes('FALLBACK:true') && out.includes('EXPLICIT-PUBLIC:true'),
                 error: `out=${out.slice(0, 250)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

// ---------- 7. adversarial edges (QC wave 2) ----------

define('legacy-main: dest-dir-equals-brain-name does not self-nest (no <name>/<name> wiping)', async () => {
    const dir = makeLegacyMainFixture();
    try {
        // Brain boot artifacts can pre-create the destination dir on a legacy
        // tree BEFORE migration. The dir must never be planned as a source.
        fs.mkdirSync(path.join(dir, 'models', 'public', 'vant'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'public', 'vant', 'runtime-note.md'), 'boot artifact');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');

        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            const r = await m.migrate();
            const f = require('fs');
            console.log('NO-SELF-NEST:' + !f.existsSync('models/public/vant/vant'));
            // content intact: both the artifact and the imported brain file
            console.log('ARTIFACT-OK:' + f.readFileSync('models/public/vant/runtime-note.md', 'utf8'));
            console.log('IMPORT-OK:' + f.readFileSync('models/public/vant/identity.md', 'utf8').includes('legacy user'));
            const step = r.applied.find(a => a.id === 'legacy.multibrain-import');
            console.log('VERIFIED:' + (step && step.result && step.result.verified === true));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000 });
        const out = probe.stdout || '';
        return { success: out.includes('NO-SELF-NEST:true') && out.includes('ARTIFACT-OK:boot artifact') &&
                        out.includes('IMPORT-OK:true') && out.includes('VERIFIED:true'),
                 error: `out=${out.slice(0, 400)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: default-only stack is rewritten to the chosen brain name', async () => {
    const dir = makeLegacyMainFixture();
    try {
        // Health/first-load auto-persists ['vant'] onto legacy trees before
        // migration. apply() must REPLACE it, not preserve it, or a
        // --brain-name import strands the user behind a dead default stack.
        const statePath = path.join(dir, 'models', 'state.json');
        fs.writeFileSync(statePath, JSON.stringify({ stack: ['vant'], currentBrain: 'vant', mode: 'dual', neurons: { attention: { identity: 0.2 } } }));

        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            const r = await m.migrate({ brainName: 'mybrain' });
            const st = JSON.parse(require('fs').readFileSync('models/state.json', 'utf8'));
            console.log('STACK:' + JSON.stringify(st.stack));
            console.log('NEURONS:' + !!(st.neurons && st.neurons.attention));
            const step = r.applied.find(a => a.id === 'legacy.multibrain-import');
            console.log('REPORTED:' + JSON.stringify(step.result.stack));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000 });
        const out = probe.stdout || '';
        return { success: out.includes('STACK:["mybrain"]') && out.includes('NEURONS:true') && out.includes('REPORTED:["mybrain"]'),
                 error: `out=${out.slice(0, 300)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: existing multibrain files win over same-named flat files (no clobber)', async () => {
    const dir = makeLegacyMainFixture();
    try {
        // A multibrain tree with stray legacy flat files: the LIVE brain file
        // must never be overwritten by flat content of the same name.
        fs.mkdirSync(path.join(dir, 'models', 'public', 'vant'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'public', 'vant', 'identity.md'), '# LIVE MULTIBRAIN IDENTITY');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');

        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            const r = await m.migrate();
            const f = require('fs');
            console.log('NO-CLOBBER:' + f.readFileSync('models/public/vant/identity.md', 'utf8').includes('LIVE MULTIBRAIN'));
            const step = r.applied.find(a => a.id === 'legacy.multibrain-import');
            console.log('SKIPPED-N:' + (step && step.result ? step.result.skippedExisting : 'no-step'));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000 });
        const out = probe.stdout || '';
        return { success: out.includes('NO-CLOBBER:true') && /SKIPPED-N:(\d)/.test(out),
                 error: `out=${out.slice(0, 300)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: unverified import withholds marker (failed migration is retryable)', async () => {
    const dir = makeLegacyMainFixture();
    try {
        // Sabotage verification so apply() reports verified:false: point the
        // brain loader at an impossible root via an env the resync honors...
        // simplest reliable sabotage: make state.json unreadable post-write is
        // too invasive; instead corrupt the corpus source AFTER moves by
        // deleting the imported dir between moves and verify — done here via
        // a require hook that wipes models/public/vant once moves complete.
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const fsmod = require('fs');
            const Module = require('module');
            const origLoad = Module._load;
            let sabotaged = false;
            Module._load = function (request, parent, isMain) {
                const mod = origLoad.apply(this, arguments);
                if (!sabotaged && request.endsWith('brain') && mod && mod.loadCorpus) {
                    sabotaged = true;
                    const orig = mod.loadCorpus.bind(mod);
                    mod.loadCorpus = function (opts) {
                        // wipe content AFTER the file pass so verify sees empty
                        fsmod.rmSync('models/public/vant', { recursive: true, force: true });
                        return orig(opts);
                    };
                }
                return mod;
            };
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            const r = await m.migrate();
            console.log('OK:' + r.ok);
            console.log('FAILED-VERIFY:' + (r.failedVerify === true));
            console.log('MARKER:' + JSON.stringify(m._readMarker()));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000 });
        const out = probe.stdout || '';
        return { success: out.includes('OK:false') && out.includes('FAILED-VERIFY:true') && out.includes('MARKER:null'),
                 error: `out=${out.slice(0, 300)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: walker does not follow symlinks out of models/', async () => {
    const dir = makeLegacyMainFixture();
    try {
        fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
        // A symlinked dir + file pointing OUTSIDE models/ must be skipped,
        // not followed (content copy is safe; deletes must never route out).
        const outside = path.join(dir, 'outside-canary');
        fs.mkdirSync(outside, { recursive: true });
        fs.writeFileSync(path.join(outside, 'canary.md'), 'DO NOT TOUCH');
        fs.symlinkSync(outside, path.join(dir, 'models', 'public', 'linked-dir'), 'dir');
        fs.symlinkSync(path.join(outside, 'canary.md'), path.join(dir, 'models', 'public', 'linked-file.md'), 'file');

        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            const r = await m.migrate();
            const f = require('fs');
            console.log('CANARY-INTACT:' + f.readFileSync('outside-canary/canary.md', 'utf8'));
            console.log('IMPORT-OK:' + f.readFileSync('models/public/vant/identity.md', 'utf8').includes('legacy user'));
            const step = r.applied.find(a => a.id === 'legacy.multibrain-import');
            console.log('VERIFIED:' + (step && step.result && step.result.verified === true));
            })().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });
        `], { encoding: 'utf8', timeout: 60000 });
        const out = probe.stdout || '';
        return { success: out.includes('CANARY-INTACT:DO NOT TOUCH') && out.includes('IMPORT-OK:true') && out.includes('VERIFIED:true'),
                 error: `out=${out.slice(0, 300)} err=${(probe.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 400)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('legacy-main: migrate.js --status prints loud legacy notice; apply-failure exits 1', async () => {
    const dir = makeLegacyMainFixture();
    try {
        // Notice on --status (legacy tree)
        const s = spawnSync(process.execPath, [path.join(dir, 'bin', 'migrate.js'), '--status'], {
            encoding: 'utf8', timeout: 30000, cwd: dir
        });
        // Failed-verify apply exits 1 (same sabotage trick as above)
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const fsmod = require('fs');
            const Module = require('module');
            const origLoad = Module._load;
            let sabotaged = false;
            Module._load = function (request, parent, isMain) {
                const mod = origLoad.apply(this, arguments);
                if (!sabotaged && request.endsWith('brain') && mod && mod.loadCorpus) {
                    sabotaged = true;
                    const orig = mod.loadCorpus.bind(mod);
                    mod.loadCorpus = function (opts) {
                        fsmod.rmSync('models/public/vant', { recursive: true, force: true });
                        return orig(opts);
                    };
                }
                return mod;
            };
            })().catch(e => process.exit(0));
        `], { encoding: 'utf8', timeout: 30000, cwd: dir });
        // Simpler: run the real CLI with the sabotage via NODE_OPTIONS preload
        const preload = path.join(dir, 'sabotage.js');
        fs.writeFileSync(preload, `
            const fsmod = require('fs');
            const Module = require('module');
            const origLoad = Module._load;
            let sabotaged = false;
            Module._load = function (request, parent, isMain) {
                const mod = origLoad.apply(this, arguments);
                if (!sabotaged && request.endsWith('brain') && mod && mod.loadCorpus) {
                    sabotaged = true;
                    const orig = mod.loadCorpus.bind(mod);
                    mod.loadCorpus = function (opts) {
                        fsmod.rmSync('models/public/vant', { recursive: true, force: true });
                        return orig(opts);
                    };
                }
                return mod;
            };
        `);
        const fail = spawnSync(process.execPath, [path.join(dir, 'bin', 'migrate.js')], {
            encoding: 'utf8', timeout: 60000, cwd: dir,
            env: { ...process.env, NODE_OPTIONS: '--require ' + JSON.stringify(preload) }
        });
        const out = (s.stdout || '') + (probe.stdout || '');
        return { success: /OLD-STYLE BRAIN/.test(s.stdout || '') && s.status === 0 &&
                        fail.status === 1 && /could not verify/.test(fail.stdout || ''),
                 error: `statusOut=${(s.stdout || '').slice(0, 200)} failCode=${fail.status} failOut=${(fail.stdout || '').slice(0, 200)} failErr=${(fail.stderr || '').slice(0, 150)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('health: checkMigration warns on legacy tree, silent on migrated tree', async () => {
    const dir = makeLegacyMainFixture();
    try {
        fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
        fs.copyFileSync(path.join(ROOT, 'bin', 'health.js'), path.join(dir, 'bin', 'health.js'));
        const before = spawnSync(process.execPath, [path.join(dir, 'bin', 'health.js')], {
            encoding: 'utf8', timeout: 60000, cwd: dir
        });
        spawnSync(process.execPath, ['-e', `
            (async () => {
            process.chdir(${JSON.stringify(dir)});
            const m = require(${JSON.stringify(path.join(dir, 'lib', 'migrations.js'))});
            await m.migrate();
            })().catch(e => process.exit(1));
        `], { encoding: 'utf8', timeout: 60000, cwd: dir });
        const after = spawnSync(process.execPath, [path.join(dir, 'bin', 'health.js')], {
            encoding: 'utf8', timeout: 60000, cwd: dir
        });
        const warnBefore = /OLD-STYLE BRAIN/.test(before.stdout || '');
        const warnAfter = /OLD-STYLE BRAIN/.test(after.stdout || '');
        return { success: warnBefore && !warnAfter && before.status === 0 && after.status === 0,
                 error: `warnBefore=${warnBefore} warnAfter=${warnAfter} beforeOut=${(before.stdout || '').slice(0, 150)} beforeErr=${(before.stderr || '').split('\n').filter(l => !l.includes('circular') && !l.includes('trace-warnings')).join('|').slice(0, 250)}` };
    } finally {
        cleanupFixture(dir);
    }
});

define('start banner: no banner when the import moves 0 files (existing-wins)', async () => {
    const dir = makeLegacyMainFixture();
    try {
        fs.copyFileSync(path.join(ROOT, 'bin', 'start.js'), path.join(dir, 'bin', 'start.js'));
        fs.copyFileSync(path.join(ROOT, 'bin', 'health.js'), path.join(dir, 'bin', 'health.js'));
        // Legacy evidence fires (flat public .md) but EVERY flat file already
        // exists inside models/public/vant/ → apply() imports 0 files. That
        // is a no-op migration: no celebration banner.
        fs.mkdirSync(path.join(dir, 'models', 'public', 'vant'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'public', 'vant', 'identity.md'), 'LIVE');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'vant', 'lessons.md'), 'LIVE');
        fs.writeFileSync(path.join(dir, 'models', 'public', 'vant', 'goals.md'), 'LIVE');

        const out1 = await new Promise(resolve => {
            const p = spawn(process.execPath, ['bin/start.js'], { stdio: ['ignore', 'pipe', 'ignore'] });
            let out = '';
            p.stdout.on('data', d => out += d);
            p.on('close', () => resolve(out));
        });
        const zeroBanner = /BRAIN MIGRATED/.test(out1);
        const zeroOk = /Brain layout OK/.test(out1);
        return { success: !zeroBanner && zeroOk,
                 error: `banner=${zeroBanner} ok=${zeroOk} out1=${out1.slice(0, 250)}` };
    } finally {
        cleanupFixture(dir);
    }
});

// ---------- RUN ----------

runSuite();
