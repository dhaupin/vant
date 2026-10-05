#!/usr/bin/env node
/**
 * Migration + Onboard Journey Tests (pass 120)
 *
 * Drives the REAL user path an old-main (single-brain, pre-multibrain)
 * tree takes after pulling the multibrain code — through the shipped
 * CLIs, not lib calls:
 *
 *   1.  vant onboard status          -> LEGACY + "run vant migrate" hint
 *   2.  vant onboard wake            -> survives a not-yet-migrated brain
 *   3.  vant migrate --brain-name    -> imports + names the brain (9 files)
 *   4.  vant onboard status          -> CURRENT
 *   5.  vant onboard files           -> sees public AND private files
 *   6.  vant onboard read            -> legacy file content intact
 *   7.  vant onboard search          -> finds migrated content
 *   8.  vant migrate (re-run)        -> "Nothing to migrate" (settled tree;
 *       the imported brain's own state/ dir must not re-fire dropfiles)
 *   9.  --brain-name traversal       -> falls back to a safe name
 *   10. vant start on a legacy tree WITH flat private content -> banner,
 *       real content wins (no seeded placeholder shadowing the import)
 *   11. vant start on a fresh tree   -> seeds the starter brain, CURRENT
 *
 * Fixtures mirror origin/main's tree shape: flat models/public/*.md,
 * flat models/private/*.md + state/, state.json with NO stack key. Each
 * fixture is a full repo copy (lib/ + needed bins) so the CLIs resolve
 * their own REPO_ROOT; VANT_BRAIN is stripped from child env.
 *
 * Run: node test/migrate-onboard-journey.test.js
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

console.log('\n🚶 MIGRATION + ONBOARD JOURNEY TESTS\n');

const MARK = 'JOURNEYMK7'; // unique content marker

// ---------- fixture ----------
const FIXTURES = [];
function makeJourneyFixture(name, { withFlatContent = true } = {}) {
    const dir = path.join(ROOT, '.journey-' + name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'models', 'public'), { recursive: true });

    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
    fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
    for (const b of ['migrate.js', 'onboard.js', 'start.js', 'health.js']) {
        fs.copyFileSync(path.join(ROOT, 'bin', b), path.join(dir, 'bin', b));
    }

    if (withFlatContent) {
        // old-main shape: flat public + private brain, category subdirs,
        // state.json with NO stack key
        fs.writeFileSync(path.join(dir, 'models', 'public', 'identity.md'), `# identity\n\nNAME: legacy user\nMARK: ${MARK}\n`);
        fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons.md'), `# lessons\n\nMARK: ${MARK}\n`);
        fs.writeFileSync(path.join(dir, 'models', 'public', 'goals.md'), '# goals\n');
        fs.writeFileSync(path.join(dir, 'models', 'public', '_succession.json'), '{"trust":"high"}');
        fs.mkdirSync(path.join(dir, 'models', 'public', 'boot'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'public', 'boot', 'start.md'), '# start');
        fs.mkdirSync(path.join(dir, 'models', 'public', 'agents'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'public', 'agents', 'claude.json'), '{"name":"claude"}');

        fs.mkdirSync(path.join(dir, 'models', 'private'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'private', 'identity.md'), `# identity private\n\nMARK: ${MARK}\n`);
        fs.writeFileSync(path.join(dir, 'models', 'private', 'journal.md'), '# private journal\n');
        fs.mkdirSync(path.join(dir, 'models', 'private', 'state'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'models', 'private', 'state', 'session.json'), '{"k":1}');

        fs.writeFileSync(path.join(dir, 'models', 'state.json'), JSON.stringify({ neurons: { attention: { identity: 0.2 } } }));
    }
    FIXTURES.push(dir);
    return dir;
}
process.on('exit', () => {
    for (const dir of FIXTURES) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    }
});

function childEnv() {
    const env = { ...process.env };
    delete env.VANT_BRAIN; // journey must resolve brains from the fixture tree
    env.NODE_PATH = [path.join(ROOT, 'node_modules'), env.NODE_PATH].filter(Boolean).join(path.delimiter);
    return env;
}

/** Run one of the fixture's shipped CLIs. */
function runCli(dir, bin, args, timeout = 60000) {
    return spawnSync(process.execPath, [path.join(dir, 'bin', bin), ...args], {
        cwd: dir, encoding: 'utf8', timeout, env: childEnv()
    });
}

function errOf(probe) {
    return ((probe.stderr || '').split('\n')
        .filter(l => !l.includes('circular') && !l.includes('trace-warnings'))
        .join(' | ')).slice(0, 500);
}

// ---------- gates 1-8: the sequential legacy-tree journey ----------

const journey = { dir: null, built: false };
function journeyDir() {
    if (!journey.built) {
        journey.dir = makeJourneyFixture('main-tree');
        journey.built = true;
    }
    return journey.dir;
}

define('journey pre: onboard status reports LEGACY with the migrate hint', async () => {
    const dir = journeyDir();
    const r = runCli(dir, 'onboard.js', ['status']);
    const out = r.stdout || '';
    const legacy = /LEGACY/.test(out);
    const hint = /vant migrate/.test(out);
    const named = /--brain-name/.test(out);
    return { success: r.status === 0 && legacy && hint && named,
             error: `code=${r.status} legacy=${legacy} hint=${hint} named=${named} out=${out.slice(0, 300)} err=${errOf(r)}` };
});

define('journey pre: onboard wake survives a not-yet-migrated brain', async () => {
    const dir = journeyDir();
    const r = runCli(dir, 'onboard.js', ['wake']);
    const out = r.stdout || '';
    return { success: r.status === 0 && /LEGACY/.test(out),
             error: `code=${r.status} out=${out.slice(0, 250)} err=${errOf(r)}` };
});

define('journey: real CLI migrate --brain-name imports and names the brain', async () => {
    const dir = journeyDir();
    const r = runCli(dir, 'migrate.js', ['--brain-name', 'axolotlbrain']);
    const out = r.stdout || '';
    // 6 public (3 flat md + _succession.json + boot/start.md + agents/claude.json)
    // + 3 private (identity.md, journal.md, state/session.json) = 9 files;
    // state.json itself lives at models/ root, untouched.
    const imported = /"imported":9/.test(out);
    const named = /"brain":"axolotlbrain"/.test(out);
    const verified = /"verified":true/.test(out);
    const banner = /Layout at v3/.test(out);
    // The runtime must not scribble a default-brain scaffold (orgchart etc.)
    // into models/private BEFORE the plan runs — that scaffold got planned
    // as a source and nested INTO the imported brain before the marker-I/O
    // fix (pass 120).
    const noPhantomNest = !fs.existsSync(path.join(dir, 'models', 'private', 'axolotlbrain', 'vant'));
    return { success: r.status === 0 && imported && named && verified && banner && noPhantomNest,
             error: `code=${r.status} imported=${imported} named=${named} verified=${verified} v3=${banner} noPhantomNest=${noPhantomNest} out=${out.slice(0, 400)} err=${errOf(r)}` };
});

define('journey post: onboard status reports CURRENT', async () => {
    const dir = journeyDir();
    const r = runCli(dir, 'onboard.js', ['status']);
    return { success: r.status === 0 && /CURRENT/.test(r.stdout || ''),
             error: `code=${r.status} out=${(r.stdout || '').slice(0, 250)} err=${errOf(r)}` };
});

define('journey post: onboard files lists public AND private brain files', async () => {
    const dir = journeyDir();
    const r = runCli(dir, 'onboard.js', ['files']);
    const out = r.stdout || '';
    const pub = /identity\.md/.test(out);
    const priv = /journal\.md/.test(out);
    return { success: r.status === 0 && pub && priv,
             error: `code=${r.status} public=${pub} private=${priv} out=${out.slice(0, 350)} err=${errOf(r)}` };
});

define('journey post: onboard read returns the legacy file content', async () => {
    const dir = journeyDir();
    const r = runCli(dir, 'onboard.js', ['read', 'identity.md']);
    const out = r.stdout || '';
    // Dual mode reads the PRIVATE brain root first: the fixture ships BOTH a
    // public and a private identity.md, so either body is a correct answer —
    // the contract is that the real loader returns the legacy content.
    return { success: r.status === 0 && out.includes(MARK) && /# identity/.test(out),
             error: `code=${r.status} out=${out.slice(0, 250)} err=${errOf(r)}` };
});

define('journey post: onboard search finds migrated content', async () => {
    const dir = journeyDir();
    const r = runCli(dir, 'onboard.js', ['search', MARK]);
    const out = r.stdout || '';
    return { success: r.status === 0 && /Found [1-9]/.test(out) && /identity\.md/.test(out),
             error: `code=${r.status} out=${out.slice(0, 250)} err=${errOf(r)}` };
});

define('journey settled: --status up to date; re-run is a no-op (dropfiles must not re-fire)', async () => {
    const dir = journeyDir();
    const s = runCli(dir, 'migrate.js', ['--status']);
    const upToDate = /up to date/.test(s.stdout || '');
    const r = runCli(dir, 'migrate.js', []);
    const noop = /Nothing to migrate/.test(r.stdout || '');
    return { success: s.status === 0 && upToDate && r.status === 0 && noop,
             error: `statusCode=${s.status} upToDate=${upToDate} statusOut=${(s.stdout || '').slice(0, 250)} | runCode=${r.status} noop=${noop} runOut=${(r.stdout || '').slice(0, 250)} err=${errOf(r)}` };
});

// ---------- gate 9: adversarial name ----------

define('security: --brain-name traversal falls back to a safe brain name', async () => {
    const dir = makeJourneyFixture('traversal');
    const r = runCli(dir, 'migrate.js', ['--brain-name', '../../pwn']);
    const out = r.stdout || '';
    const safeNamed = /"brain":"vant"/.test(out);
    const nested = fs.existsSync(path.join(dir, 'models', 'public', 'vant', 'identity.md'));
    const noEscape = !fs.existsSync(path.join(dir, 'models', 'public', 'pwn'))
        && !fs.existsSync(path.join(dir, 'models', 'pwn'))
        && !fs.existsSync(path.join(dir, 'pwn'));
    return { success: r.status === 0 && safeNamed && nested && noEscape,
             error: `code=${r.status} safe=${safeNamed} nested=${nested} noEscape=${noEscape} out=${out.slice(0, 300)} err=${errOf(r)}` };
});

// ---------- gate 10: vant start on a REAL old-main tree (flat private content) ----------

define('start: legacy tree with flat private content migrates with banner and real content wins', async () => {
    const dir = makeJourneyFixture('start-legacy');
    const r = spawnSync(process.execPath, [path.join(dir, 'bin', 'start.js')], {
        cwd: dir, encoding: 'utf8', timeout: 90000, env: childEnv()
    });
    const out = r.stdout || '';
    const banner = /BRAIN MIGRATED to the multi-brain layout/.test(out);
    // Real flat identity must OWN models/private/vant/identity.md — the
    // seeded placeholder must never shadow it (seed runs after migration).
    let realContentWon = false, flatDrained = false, noNest = true, current = false, noSeedLine = true;
    try {
        realContentWon = fs.readFileSync(path.join(dir, 'models', 'private', 'vant', 'identity.md'), 'utf8').includes(MARK);
        flatDrained = !fs.existsSync(path.join(dir, 'models', 'private', 'identity.md'));
        noNest = !fs.existsSync(path.join(dir, 'models', 'private', 'vant', 'vant'));
        noSeedLine = !/Seeded starter brain/.test(out);
    } catch (e) { /* read failures surfaced via flags */ }
    const post = runCli(dir, 'onboard.js', ['status']);
    current = /CURRENT/.test(post.stdout || '');
    return { success: r.status === 0 && banner && realContentWon && flatDrained && noNest && noSeedLine && current,
             error: `code=${r.status} banner=${banner} realWon=${realContentWon} drained=${flatDrained} noNest=${noNest} noSeed=${noSeedLine} current=${current} out=${out.slice(0, 450)} postOut=${(post.stdout || '').slice(0, 150)} err=${errOf(r)}` };
});

// ---------- gate 11: fresh tree ----------

define('start: fresh tree seeds the starter brain and reports CURRENT', async () => {
    const dir = makeJourneyFixture('start-fresh', { withFlatContent: false });
    const pre = runCli(dir, 'onboard.js', ['status']);
    const fresh = /FRESH/.test(pre.stdout || '');
    const r = spawnSync(process.execPath, [path.join(dir, 'bin', 'start.js')], {
        cwd: dir, encoding: 'utf8', timeout: 90000, env: childEnv()
    });
    const out = r.stdout || '';
    const seeded = /Seeded starter brain/.test(out);
    const identity = fs.existsSync(path.join(dir, 'models', 'private', 'vant', 'identity.md'));
    const post = runCli(dir, 'onboard.js', ['status']);
    const current = /CURRENT/.test(post.stdout || '');
    return { success: pre.status === 0 && fresh && r.status === 0 && seeded && identity && current,
             error: `preCode=${pre.status} fresh=${fresh} startCode=${r.status} seeded=${seeded} identity=${identity} current=${current} out=${out.slice(0, 350)} postOut=${(post.stdout || '').slice(0, 150)} preErr=${errOf(pre)}` };
});

// ---------- RUN ----------

runSuite();
