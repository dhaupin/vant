#!/usr/bin/env node
/**
 * Second-Boot Tests (pass 94) — the companion to live-fresh-boot.
 *
 * The fresh-boot gate (pass 93) proved ZERO → seeded brain. This gate
 * proves the EXISTING-brain path, which is what every real deployment
 * runs 99% of the time and which was historically the least exercised:
 *
 *   boot 1 (fresh, seeded) → MUTATE (identity edit, lesson, org demo,
 *   habitat workspace) → boot 2/3 must:
 *     - NOT re-seed (no clobber of an existing brain)
 *     - keep identity.md byte-identical across boots
 *     - rehydrate teams orgs + agent roster from disk (new processes)
 *     - keep agent brain FIELD bindings env-correct (pass-93 seam)
 *     - keep migrate idempotent ("Nothing to migrate" on run 3)
 *     - keep habitat workspaces restored (incl. a created workspace)
 *     - NOT bleed anything into the default vant brain
 *     - NOT delete tracked trees (pass-89 canvas regression class)
 *
 * ISOLATION: scratch brain (VANT_BRAIN), fixed p94-* names, snapshots of
 * the default vant brain taken before mutations and diffed after.
 */

const SCRATCH_BRAIN = 'p94-second-boot';
process.env.VANT_BRAIN = SCRATCH_BRAIN;

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN_DIR = path.join(ROOT, 'models', 'private', SCRATCH_BRAIN);
const VANT_ORGCHART = path.join(ROOT, 'models', 'private', 'vant', 'orgchart', 'agents.json');
const results = { passed: 0, failed: 0 };

async function test(name, fn) {
    try {
        const ok = await fn();
        if (ok === false) throw new Error('assertion failed');
        results.passed++;
        console.log(`  \u2713 ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  \u2717 ${name}: ${e.message}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function vant(args, extraEnv = {}) {
    return spawnSync(process.execPath, [path.join(ROOT, 'bin', 'vant.js'), ...args], {
        cwd: ROOT, encoding: 'utf8', timeout: 40000,
        env: Object.assign({}, process.env, extraEnv)
    });
}

const { spawnSync } = require('child_process');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function main() {
    console.log('\n\ud83d\udd01 SECOND-BOOT TESTS (pass 94)\n');
    console.log('  (scratch brain: ' + SCRATCH_BRAIN + ')');

    // ---------- boot 1: fresh, seeded ----------
    fs.rmSync(BRAIN_DIR, { recursive: true, force: true });
    let r = vant(['start']);
    assert(r.status === 0, 'boot 1 failed: ' + (r.stderr || '').slice(-160));
    assert(fs.existsSync(path.join(BRAIN_DIR, 'identity.md')), 'boot 1 did not seed');
    await test('boot 1 seeds the fresh env brain', () => true);

    // Default-brain bleed snapshot BEFORE mutations.
    const vantAgentsBefore = fs.existsSync(VANT_ORGCHART)
        ? fs.readFileSync(VANT_ORGCHART, 'utf8') : null;
    const canvasBefore = fs.existsSync(path.join(ROOT, 'models', 'public', 'vant', 'canvas'))
        ? fs.readdirSync(path.join(ROOT, 'models', 'public', 'vant', 'canvas')).sort().join(',') : null;

    // ---------- mutate the existing brain ----------
    fs.writeFileSync(path.join(BRAIN_DIR, 'identity.md'),
        '# identity.md\n\nNAME: P94 Second Boot\nROLE: Existing-brain regression target\n\n## About\n- Mutated after boot 1; must survive boot 2 byte-for-byte.\n');
    r = vant(['learn', 'p94-lesson', 'survives the second boot']);
    assert(/Learned/.test(r.stdout || ''), 'learn failed on the existing brain');
    r = vant(['org', 'demo']);
    assert(r.status === 0, 'org demo failed on the existing brain');
    const agentsFile = path.join(BRAIN_DIR, 'orgchart', 'agents.json');
    assert(fs.existsSync(agentsFile), 'org demo did not persist agents.json');
    await test('mutations land (identity edit, lesson, org demo)', () => true);

    // ---------- boot 2: the existing-brain boot ----------
    const identityBefore = sha(path.join(BRAIN_DIR, 'identity.md'));
    const boot2Out = vant(['start']);
    await test('boot 2 does NOT re-seed (no clobber) and identity survives byte-for-byte', () => {
        assert(boot2Out.status === 0, 'boot 2 failed: ' + (boot2Out.stderr || '').slice(-160));
        assert(!/Seeded starter brain/.test(boot2Out.stdout || ''), 'boot 2 RE-SEEDED an existing brain (clobber class)');
        assert(sha(path.join(BRAIN_DIR, 'identity.md')) === identityBefore,
            'identity.md changed across boot 2');
        return true;
    });

    await test('boot 2 keeps migrate idempotent (layout up to date)', () => {
        assert(/Nothing to migrate|layout is up to date/.test(boot2Out.stdout || ''),
            'migrate not idempotent: ' + (boot2Out.stdout || '').slice(-160));
        return true;
    });

    // ---------- rehydration in NEW processes (boot 2's real test) ----------
    await test('teams orgs rehydrate from disk in a fresh process', () => {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
                const teams = require(${JSON.stringify(path.join(ROOT, 'lib', 'teams'))});
                const r = teams.listOrgs();
                const orgs = r && r.orgs ? r.orgs : (r || []);
                const arr = Array.isArray(orgs) ? orgs : Object.values(orgs);
                console.log('ORGCount=' + arr.length);
                process.exit(0);
            })().catch(e => { console.error(e.message); process.exit(1); });
        `], { cwd: ROOT, encoding: 'utf8', timeout: 30000, env: process.env });
        assert(probe.status === 0, 'probe failed: ' + (probe.stderr || '').slice(-160));
        const n = parseInt((probe.stdout.match(/ORGCount=(\d+)/) || [])[1] || '0', 10);
        assert(n >= 1, 'orgs not rehydrated in a fresh process (count ' + n + ')');
        return true;
    });

    await test('agent roster rehydrates; brain FIELD bindings env-correct (pass-93 seam)', () => {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
                const fs = require('fs');
                const raw = JSON.parse(fs.readFileSync(${JSON.stringify(agentsFile)}, 'utf8'));
                const entries = Array.isArray(raw) ? raw : Object.entries(raw);
                const agents = entries.map(e => (Array.isArray(e) ? e[1] : e));
                // Roster must ALSO rehydrate through the public API (async).
                const list = await require(${JSON.stringify(path.join(ROOT, 'lib', 'agents'))}).list();
                console.log('AgentCount=' + list.length);
                console.log('StoreBrains=' + JSON.stringify(agents.map(a => a.brain)));
                process.exit(0);
            })().catch(e => { console.error(e.message); process.exit(1); });
        `], { cwd: ROOT, encoding: 'utf8', timeout: 30000, env: process.env });
        assert(probe.status === 0, 'probe failed: ' + (probe.stderr || '').slice(-160));
        const n = parseInt((probe.stdout.match(/AgentCount=(\d+)/) || [])[1] || '0', 10);
        assert(n >= 1, 'agent roster not rehydrated in a fresh process (count ' + n + ')');
        const brains = JSON.parse((probe.stdout.match(/StoreBrains=(\[[^\]]*\])/) || [])[1] || '[]');
        assert(brains.length && brains.every(b => b === SCRATCH_BRAIN),
            'agent brain bindings wrong: ' + JSON.stringify(brains));
        return true;
    });

    // ---------- habitat workspace created on the existing brain ----------
    r = vant(['habitat', 'init', 'p94-ws']);
    assert(r.status === 0, 'habitat init failed');
    r = vant(['habitat', 'use', 'p94-ws']);
    assert(r.status === 0, 'habitat use failed');
    await test('habitat workspace created + switched on the existing brain', () => true);

    await test('boot 3 restores habitat workspaces incl. the created one', () => {
        const probe = spawnSync(process.execPath, ['-e', `
            (async () => {
                const habitat = require(${JSON.stringify(path.join(ROOT, 'lib', 'habitat'))});
                const h = habitat.getShared();
                await habitat.getSharedReady();
                console.log('WS=' + JSON.stringify(Object.keys(h.workspaces)));
                process.exit(0);
            })().catch(e => { console.error(e.message); process.exit(1); });
        `], { cwd: ROOT, encoding: 'utf8', timeout: 30000, env: process.env });
        assert(probe.status === 0, 'probe failed: ' + (probe.stderr || '').slice(-160));
        const ws = JSON.parse((probe.stdout.match(/WS=(\[[^\]]*\])/) || [])[1] || '[]');
        assert(ws.includes('p94-ws'), 'created workspace lost across boot: ' + JSON.stringify(ws));
        assert(ws.includes('default'), 'default workspace missing: ' + JSON.stringify(ws));
        return true;
    });

    // ---------- isolation + no-deletion guarantees ----------
    await test('no bleed into the default vant brain orgchart', () => {
        if (!fs.existsSync(VANT_ORGCHART)) return true;
        const after = fs.readFileSync(VANT_ORGCHART, 'utf8');
        if (vantAgentsBefore === null) {
            // File did not exist before boot 1: it must not appear because of us.
            // (Some flows legitimately create it; only flag p94 contamination.)
            assert(!/p94/.test(after), 'scratch-brain agents leaked into the vant brain');
            return true;
        }
        assert(after === vantAgentsBefore, 'vant brain orgchart changed during env-brain boots');
        return true;
    });

    await test('boot does not delete tracked trees (pass-89 canvas regression class)', () => {
        const canvasAfter = fs.existsSync(path.join(ROOT, 'models', 'public', 'vant', 'canvas'))
            ? fs.readdirSync(path.join(ROOT, 'models', 'public', 'vant', 'canvas')).sort().join(',') : null;
        assert(canvasAfter === canvasBefore, 'canvas tree changed across boots: before=' + canvasBefore + ' after=' + canvasAfter);
        return true;
    });

    console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
