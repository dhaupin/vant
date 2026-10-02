#!/usr/bin/env node
/**
 * Pass 89 — prime triage: horcrux/teams/brain-naming
 *
 *   #100  stone flood: repo-root .ignore + `horcrux create` auto-append
 *   #101  cold restore: teams.json lands before the restore CLI exits
 *   #102  inspect counts the REAL registered roster (+ delegation records)
 *   #103  empty dirs survive a gather → restore cycle (markers swept)
 *   #104  partial re-assign preserves identity fields (brain/org/dept/…)
 *   #111  health: content-grown brains are initialized, not "not initialized"
 *   #112  stack assertion follows the ACTIVE brain, not the default name
 *
 * Scratch brains use FIXED names (p89-*): $RANDOM re-evaluates per command,
 * fixed names can be scrubbed deterministically before/after every run.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PRIV = path.join(ROOT, 'models', 'private');
const PUB = path.join(ROOT, 'models', 'public');

const SCRATCH_PRIV = ['p89-stone', 'p89-cold', 'p89-grow', 'p89-empty', 'p89-md', 'p89-void', 'p89-both'];
const SCRATCH_PUB = ['p89-both'];

function scrub() {
    for (const s of SCRATCH_PRIV) {
        fs.rmSync(path.join(PRIV, s), { recursive: true, force: true });
    }
    for (const s of SCRATCH_PUB) {
        fs.rmSync(path.join(PUB, s), { recursive: true, force: true });
    }
    fs.rmSync(path.join(ROOT, 'p89-stones'), { recursive: true, force: true });
}

function runNode(args, env = {}, timeout = 120000) {
    return spawnSync(process.execPath, args, {
        cwd: ROOT,
        env: Object.assign({}, process.env, env),
        encoding: 'utf8',
        timeout
    });
}

// Serialized queue: tests declare up front, run one-by-one in order.
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

async function main() {
    console.log('\n🧪 PASS 89 — horcrux/teams/brain-naming triage\n');
    scrub(); // deterministic start

    // (same preamble as orgflow.test.js) operator grant: sandbox denies
    // writes by default in-process (E_SANDBOX), and the hermetic teams
    // store keeps #104's entities out of the live vant orgchart.
    const os = require('os');
    const TMP_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-p89-'));
    process.on('exit', () => { try { fs.rmSync(TMP_STORE_DIR, { recursive: true, force: true }); } catch (e) { /* best effort */ } });
    require(path.join(ROOT, 'lib', 'config')).set('teams.store', path.join(TMP_STORE_DIR, 'teams.json'));
    const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));
    const sudo = require(path.join(ROOT, 'lib', 'sudo'));
    sudo.createTask('p89-test', ['read', 'write', 'spawn']);
    sandbox.setScopes(['read', 'write', 'spawn']);
    sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });

    let passed = 0;
    let failed = 0;
    for (const t of queue) {
        try {
            const r = await t.fn();
            if (r === true || (r && r.success)) {
                passed++;
                console.log(`  ✓ ${t.name}`);
            } else {
                failed++;
                console.log(`  ✗ ${t.name}: ${(r && r.error) || 'assertion failed'}`);
            }
        } catch (e) {
            failed++;
            console.log(`  ✗ ${t.name}: ${e.message}`);
        }
    }

    scrub(); // deterministic end — no scratch dirs survive a failed run either
    console.log('\n--- RESULTS ---');
    console.log(`  Passed:  ${passed}`);
    console.log(`  Failed:  ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

// ==================== #100 — stone search hygiene ====================

const IGNORE = path.join(ROOT, '.ignore');

test('#100 repo-root .ignore covers stone dirs (boot svg + horcrux/)', () => {
    if (!fs.existsSync(IGNORE)) return { error: '.ignore missing at repo root' };
    const content = fs.readFileSync(IGNORE, 'utf8');
    const lines = content.split(/\r?\n/).map(l => l.trim());
    for (const want of ['models/public/*/boot/*.svg', 'horcrux/*.svg']) {
        if (!lines.includes(want)) return { error: `.ignore missing stone glob: ${want}` };
    }
    return { success: true };
});

test('#100 horcrux create auto-appends its stone dir to .ignore; rg skips it', () => {
    const raw = fs.existsSync(IGNORE) ? fs.readFileSync(IGNORE, 'utf8') : '';
    // Sanitize any pollution left by a previously-crashed run of this test.
    const sanitized = raw
        .split(/\r?\n/)
        .filter(l => l.trim() !== 'p89-stones/*.svg')
        .filter(l => !l.startsWith('# horcrux stone (auto-added by vant horcrux create'))
        .filter(l => !l.startsWith('# one ~800KB+ base64 line per stone'))
        .join('\n');
    fs.writeFileSync(IGNORE, sanitized);
    try {
        fs.mkdirSync(path.join(ROOT, 'p89-stones'), { recursive: true });
        const r = runNode(['bin/horcrux.js', 'create', 'p89-stones/p89-rg-p_x.svg', 'x']);
        const out = (r.stdout || '') + (r.stderr || '');
        if (r.status !== 0) return { error: `create exited ${r.status}: ${out.slice(-400)}` };
        if (!out.includes('Search hygiene: added p89-stones/*.svg')) {
            return { error: 'no search-hygiene confirmation: ' + out.slice(-300) };
        }
        const now = fs.readFileSync(IGNORE, 'utf8');
        if (!now.split(/\r?\n/).map(l => l.trim()).includes('p89-stones/*.svg')) {
            return { error: '.ignore was not updated with p89-stones/*.svg' };
        }
        // ripgrep honors .ignore for a repo walk: the stone must not appear …
        const scan = spawnSync('rg', ['-l', '<svg', '.'], { cwd: ROOT, encoding: 'utf8' });
        if (!scan.error) {
            const hits = (scan.stdout || '').split(/\r?\n/).filter(l => l.includes('p89-stones/'));
            if (hits.length > 0) {
                return { error: 'rg repo walk matched an ignored stone: ' + hits.join(', ') };
            }
            // … while --no-ignore still sees it (never truly hidden)
            const forced = spawnSync('rg', ['--no-ignore', '-l', '<svg', 'p89-stones/'], { cwd: ROOT, encoding: 'utf8' });
            if ((forced.stdout || '').indexOf('p89-rg-p_x.svg') === -1) {
                return { error: 'rg --no-ignore should still find the stone' };
            }
        }
        return { success: true };
    } finally {
        // .ignore: keep the sanitized form (drops crash-pollution, keeps repo globs)
        fs.writeFileSync(IGNORE, sanitized);
        fs.rmSync(path.join(ROOT, 'p89-stones'), { recursive: true, force: true });
    }
});

// ==================== #102 — inspect counts the real roster ====================

function makeInspectStone(file) {
    const payload = {
        teams: {
            orgs: [['org_p89i', { id: 'org_p89i', name: 'P89InspectOrg' }]],
            depts: [],
            teams: [['team_p89i', { id: 'team_p89i', name: 'P89InspectTeam' }]],
            roles: [],
            assignments: [],
            count: 1,
            gatheredAt: Date.now()
        },
        agents2: { agents: [{ id: 'a1', name: 'alpha' }, { id: 'a2', name: 'beta' }] },
        // legacy gather shape: agents[] is ALWAYS empty (prime #102 root cause)
        agents: { agents: [], delegations: { metrics: {}, history: [{ id: 'd1' }], active: [] }, metrics: {} }
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
        type: 'vant-horcrux',
        timestamp: Date.now(),
        version: '0.8.6',
        payload
    }, null, 2));
    return file;
}

test('#102 inspect preview counts agents2 roster + delegation records + orgs', () => {
    const transform = require(path.join(ROOT, 'lib', 'transform'));
    const stone = makeInspectStone(path.join(PRIV, 'p89-stone', 'inspect-p_x.json'));
    return transform.inspectHorcrux(stone, {}).then(res => {
        if (!res || !res.valid) return { error: 'stone invalid: ' + (res && res.error) };
        const p = res.preview;
        if (p.agentCount !== 2) return { error: 'agentCount=' + p.agentCount + ' (expected 2 from agents2)' };
        if (p.delegationCount !== 1) return { error: 'delegationCount=' + p.delegationCount + ' (expected 1)' };
        if (p.orgCount !== 1 || p.teams2Count !== 1) return { error: 'org/team counts wrong: ' + p.orgCount + '/' + p.teams2Count };
        return { success: true };
    });
});

test('#102 CLI inspect prints roster + Teams/Orgs lines', () => {
    const stone = makeInspectStone(path.join(PRIV, 'p89-stone', 'inspect-cli-p_x.json'));
    const r = runNode(['bin/horcrux.js', 'inspect', stone]);
    const out = r.stdout || '';
    if (r.status !== 0) return { error: `inspect exited ${r.status}: ${out.slice(-300)}` };
    if (!out.includes('Agents (registered roster): 2')) return { error: 'roster line missing: ' + out.slice(0, 400) };
    if (!out.includes('Delegation records: 1')) return { error: 'delegation line missing' };
    if (!out.includes('Teams/Orgs: 1 orgs, 1 teams')) return { error: 'Teams/Orgs line missing' };
    return { success: true };
});

// ==================== #104 — partial re-assign preserves identity ====================

test('#104 partial re-assign preserves brain/org/dept/team/role', async () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    let orgId = null;
    try {
        const org = teams.createOrg('P89PresOrg');
        if (org && org.error) return { error: 'createOrg: ' + JSON.stringify(org) };
        orgId = org.id;
        const dept = teams.createDept('P89PresDept', { org: org.id });
        const teamA = teams.createTeam('P89PresTeamA', { dept: dept.id });
        const teamB = teams.createTeam('P89PresTeamB', { dept: dept.id });
        const roleA = teams.createRole('p89-keeper-a', { team: teamA.id });
        if ([dept, teamA, teamB, roleA].some(x => x && x.error)) {
            return { error: 'setup failed: ' + JSON.stringify([dept, teamA, teamB, roleA]) };
        }

        const first = teams.assign('p89-agent-1', {
            org: org.id, dept: dept.id, team: teamA.id, role: roleA.id, brain: 'p89-brain-x'
        });
        if (first.error) return { error: 'first assign: ' + JSON.stringify(first) };
        if (first.brain !== 'p89-brain-x') return { error: 'explicit brain not stored' };

        // Partial update: no brain, no org/dept/role — only team re-stated.
        const second = teams.assign('p89-agent-1', { team: teamA.id });
        if (second.brain !== 'p89-brain-x') return { error: 'brain smeared with caller brain: ' + second.brain };
        if (second.org !== org.id || second.dept !== dept.id || second.role !== roleA.id) {
            return { error: 'identity fields lost on partial update: ' + JSON.stringify(second) };
        }

        // Team rotation without an explicit role: stale role (old team) must
        // NOT follow; brain/org/dept must.
        const third = teams.assign('p89-agent-1', { team: teamB.id });
        if (third.brain !== 'p89-brain-x') return { error: 'brain lost on rotation: ' + third.brain };
        if (third.org !== org.id || third.dept !== dept.id) return { error: 'org/dept lost on rotation: ' + JSON.stringify(third) };
        if (third.team !== teamB.id) return { error: 'rotation not applied: ' + third.team };
        if (third.role !== null && third.role !== undefined) return { error: 'stale role survived team change: ' + third.role };

        // An EXPLICIT brain still wins over the preserved one.
        const fourth = teams.assign('p89-agent-1', { team: teamB.id, brain: 'p89-brain-y' });
        if (fourth.brain !== 'p89-brain-y') return { error: 'explicit brain ignored: ' + fourth.brain };
        return { success: true };
    } finally {
        try { await teams.unassign('p89-agent-1'); } catch (e) { /* already gone */ }
        if (orgId) { try { await teams.deleteOrg(orgId); } catch (e) { /* best-effort */ } }
    }
});

test('#104 teams.flush is exported (restore drain seam)', () => {
    const teams = require(path.join(ROOT, 'lib', 'teams'));
    return { success: typeof teams.flush === 'function' };
});

// ==================== #101 — cold restore durability ====================

test('#101 cold restore: teams.json lands before exit; fresh process sees orgs', () => {
    const snapPath = path.join(PRIV, 'p89-cold', 'snap.json');
    const storePath = path.join(PRIV, 'p89-cold', 'orgchart', 'teams.json');
    fs.mkdirSync(path.join(PRIV, 'p89-cold'), { recursive: true });
    const env = { VANT_BRAIN: 'p89-cold' };

    // Child A: build an org in the scratch brain, snapshot gatherState.
    const scriptA = `
        const fs = require('fs');
        const ROOT = ${JSON.stringify(ROOT)};
        // per-process operator grant (same pattern as orgflow.test.js)
        const sandbox = require(ROOT + '/lib/sandbox');
        const sudo = require(ROOT + '/lib/sudo');
        sudo.createTask('p89-child-a', ['read', 'write', 'spawn']);
        sandbox.setScopes(['read', 'write', 'spawn']);
        sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
        const teams = require(ROOT + '/lib/teams');
        const org = teams.createOrg('P89ColdOrg');
        if (!org || org.error) { console.error(JSON.stringify(org)); process.exit(2); }
        const dept = teams.createDept('P89ColdDept', { org: org.id });
        teams.createTeam('P89ColdTeam', { dept: dept.id });
        fs.writeFileSync(process.argv[1], JSON.stringify(teams.gatherState()));
        console.log('A-OK');
    `;
    const a = runNode(['-e', scriptA, snapPath], env);
    if (a.status !== 0 || !(a.stdout || '').includes('A-OK')) {
        return { error: 'child A failed: ' + ((a.stdout || '') + (a.stderr || '')).slice(-400) };
    }

    // Cold state: no teams.json on disk (fresh machine restored from stone).
    fs.rmSync(storePath, { force: true });
    if (fs.existsSync(storePath)) return { error: 'could not create cold state' };

    // Child B: restore from the snapshot, then exit IMMEDIATELY — the
    // #101 race lived exactly here (CLI exit before teams.json landed).
    const scriptB = `
        const fs = require('fs');
        const transform = require(${JSON.stringify(path.join(ROOT, 'lib', 'transform'))});
        const snap = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        (async () => {
            const r = await transform.restore({
                timestamp: Date.now(), version: '0.8.6',
                mode: { loaded: false }, brainStorage: { loaded: false },
                neurons: { loaded: false }, configStorage: { loaded: false },
                islandState: { loaded: false },
                agents: null, islands: { manifests: null }, config: null,
                runtime: null, boot: null,
                teams: snap
            });
            if (r && r.errors && r.errors.length) { console.error('ERR:' + JSON.stringify(r.errors)); process.exit(3); }
            console.log('B-RESTORED:' + (r.restored || []).join(','));
            process.exit(0);
        })().catch(e => { console.error(e && e.stack || String(e)); process.exit(1); });
    `;
    const b = runNode(['-e', scriptB, snapPath], env);
    if (b.status !== 0) {
        return { error: 'child B (restore) failed: ' + ((b.stdout || '') + (b.stderr || '')).slice(-500) };
    }
    if (!(b.stdout || '').includes('teams(true)')) {
        return { error: 'teams section not restored: ' + (b.stdout || '').slice(0, 300) };
    }
    if (!fs.existsSync(storePath)) {
        return { error: 'teams.json did not land before the restore process exited' };
    }

    // Child C: brand-new process must hydrate the restored org.
    const scriptC = `
        const teams = require(${JSON.stringify(path.join(ROOT, 'lib', 'teams'))});
        console.log('C-ORGS:' + teams.listOrgs().length);
    `;
    const c = runNode(['-e', scriptC], env);
    const m = /C-ORGS:(\d+)/.exec(c.stdout || '');
    if (!m) return { error: 'child C failed: ' + ((c.stdout || '') + (c.stderr || '')).slice(-300) };
    if (Number(m[1]) < 1) return { error: 'cold process saw ' + m[1] + ' orgs' };
    return { success: true };
});

// ==================== #103 — empty dirs survive the cycle ====================

test('#103 empty dir survives gather → restore; .keep marker swept', async () => {
    const transform = require(path.join(ROOT, 'lib', 'transform'));
    const voidDir = path.join(PRIV, 'p89-void', 'void-space');
    fs.mkdirSync(voidDir, { recursive: true });

    const bs = await transform.gatherBrainStorage();
    if (!bs || !bs.loaded) return { error: 'gatherBrainStorage failed: ' + JSON.stringify(bs && bs.error) };
    const brain = bs.brains && bs.brains['p89-void'];
    if (!brain) return { error: 'p89-void not in gather (brainDirs scan?)' };
    const marker = brain.files.find(f => f.emptyDir && f.path === 'void-space/.keep');
    if (!marker) return { error: 'no emptyDir marker in gather: ' + JSON.stringify(brain.files.map(f => f.path)) };

    // Simulate the loss the old code caused: dir gone before restore.
    fs.rmSync(path.dirname(voidDir), { recursive: true, force: true });

    const r = await transform.restore({
        timestamp: Date.now(), version: '0.8.6',
        mode: { loaded: false },
        neurons: { loaded: false }, configStorage: { loaded: false },
        islandState: { loaded: false },
        agents: null, islands: { manifests: null }, config: null,
        runtime: null, boot: null,
        brainStorage: { loaded: true, brains: { 'p89-void': brain }, totalBrains: 1, totalFiles: brain.files.length }
    });
    if (r && r.errors && r.errors.length) return { error: 'restore errors: ' + JSON.stringify(r.errors) };
    if (!fs.existsSync(voidDir)) return { error: 'empty dir not recreated by restore' };
    if (fs.existsSync(path.join(voidDir, '.keep'))) return { error: '.keep marker not swept' };
    if (!Array.isArray(r.emptyDirs) || r.emptyDirs.length !== 1) return { error: 'results.emptyDirs wrong: ' + JSON.stringify(r.emptyDirs) };
    if (r.emptyDirs[0].scope !== 'private') return { error: 'marker scope not recorded: ' + JSON.stringify(r.emptyDirs[0]) };
    return { success: true };
});

test('#103 both-scope brain: private-side marker swept from the private tree', async () => {
    const transform = require(path.join(ROOT, 'lib', 'transform'));
    const privVoid = path.join(PRIV, 'p89-both', 'void-p');
    fs.mkdirSync(privVoid, { recursive: true });
    fs.mkdirSync(path.join(PUB, 'p89-both'), { recursive: true });
    fs.writeFileSync(path.join(PUB, 'p89-both', 'note.md'), '# public note\n');

    const bs = await transform.gatherBrainStorage();
    const brain = bs.brains && bs.brains['p89-both'];
    if (!brain || brain.type !== 'both') return { error: 'expected a both-scope brain, got: ' + JSON.stringify(brain && brain.type) };
    const marker = brain.files.find(f => f.emptyDir);
    if (!marker) return { error: 'no marker gathered for private void dir' };
    if (marker.scope !== 'private') return { error: 'marker scope not private after merge: ' + marker.scope };

    fs.rmSync(privVoid, { recursive: true, force: true });

    const r = await transform.restore({
        timestamp: Date.now(), version: '0.8.6',
        mode: { loaded: false },
        neurons: { loaded: false }, configStorage: { loaded: false },
        islandState: { loaded: false },
        agents: null, islands: { manifests: null }, config: null,
        runtime: null, boot: null,
        brainStorage: { loaded: true, brains: { 'p89-both': brain }, totalBrains: 1, totalFiles: brain.files.length }
    });
    if (r && r.errors && r.errors.length) return { error: 'restore errors: ' + JSON.stringify(r.errors) };
    if (!fs.existsSync(privVoid)) return { error: 'private-side empty dir not recreated' };
    if (fs.existsSync(path.join(privVoid, '.keep'))) {
        return { error: 'private-side .keep leaked (sweep used brain scope, not file scope)' };
    }
    if (!fs.existsSync(path.join(PUB, 'p89-both', 'note.md'))) return { error: 'public sibling lost' };
    return { success: true };
});

// ==================== #111 — health on a content-grown brain ====================

test('#111 health: content-grown brain without template markers reports initialized', () => {
    const grow = path.join(PRIV, 'p89-grow');
    fs.mkdirSync(path.join(grow, 'orgchart'), { recursive: true });
    fs.writeFileSync(path.join(grow, 'notes.md'), '# grown\n');
    fs.writeFileSync(path.join(grow, 'orgchart', 'teams.json'), '{}');

    const r = runNode(['bin/health.js'], { VANT_BRAIN: 'p89-grow' });
    const out = r.stdout || '';
    if (r.status !== 0) return { error: `health exited ${r.status}: ${out.slice(-300)}` };
    if (out.includes('not initialized')) return { error: 'false negative: still reports not initialized' };
    if (!out.includes('Brain exists at')) return { error: 'Brain exists line missing: ' + out.slice(0, 400) };
    if (!out.includes('No template markers')) return { error: 'marker hint missing (actionable output)' };
    return { success: true };
});

test('#111 health: empty brain still reports not initialized + wanted markers', () => {
    // A fresh VANT_BRAIN target gets auto-seeded (brain/escrow store init
    // creates orgchart/ before checkModel runs), so the genuinely-empty
    // branch is exercised via the MODEL_PATH escape health checks FIRST —
    // that path is not auto-seeded (state-store resolves the active brain,
    // not MODEL_PATH), so its dir stays empty.
    const md = path.join(PRIV, 'p89-md');
    fs.mkdirSync(md, { recursive: true });
    const r = runNode(['bin/health.js'], { MODEL_PATH: 'models/private/p89-md' });
    const out = r.stdout || '';
    if (r.status !== 0) return { error: `health exited ${r.status}: ${out.slice(-300)}` };
    if (!out.includes('not initialized')) return { error: 'empty brain should report not initialized: ' + out.slice(0, 400) };
    if (!out.includes('Wanted marker files: identity.md, meta.json, lessons.md')) {
        return { error: 'wanted-markers line missing: ' + out.slice(0, 400) };
    }
    return { success: true };
});

// ==================== #112 — active-brain stack assertion ====================

test('#112 getStack contains the ACTIVE brain (no hardcoded vant)', () => {
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const stack = brain.getStack();
    const active = brain.getCurrentBrain() || brain.currentBrain() || 'vant';
    if (!Array.isArray(stack) || stack.length === 0) return { error: 'stack empty/non-array' };
    if (!stack.includes(active)) return { error: `stack=${JSON.stringify(stack)} missing active=${active}` };
    return { success: true };
});

main().catch(e => {
    console.error('Test harness error:', e);
    process.exit(1);
});
