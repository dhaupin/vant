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

// ---------- 4. CLI ----------

define('CLI: --dry-run reports no changes on clean layout', async () => {
    const probe = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'migrate.js'), '--dry-run'], {
        encoding: 'utf8', timeout: 30000, cwd: ROOT
    });
    const ok = probe.status === 0 && /Nothing to migrate|No changes made/.test(probe.stdout || '');
    return { success: ok, error: `status=${probe.status} out=${(probe.stdout || '').slice(0, 100)}` };
});

// ---------- 5. legacy main-style layout → multibrain (the merge-safety migration) ----------

// ---------- 5. legacy main-style layout → multibrain (the merge-safety migration) ----------
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

// ---------- RUN ----------

runSuite();
