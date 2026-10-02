#!/usr/bin/env node
/**
 * Cross-process agent-roster persistence tests (pass 95)
 *
 * (pass 88 — prime #109) serialized the in-process save chain, but separate
 * CLI processes each hold their own agents.json snapshot: live-fire showed
 * 4 concurrent `vant agents spawn` invocations persisting only 3 roster
 * entries (atomic write held — file always parses — but the last writer
 * clobbered a concurrent spawn's entry).
 *
 * The fix (internal.js): every save takes a short-lived lockfile in the
 * orgchart dir, re-reads the disk roster, and ADOPTS ids this process has
 * never seen (tracked in _seenIds). Deletes stay authoritative — a killed/
 * pruned id is never re-adopted (tombstone via _seenIds).
 *
 * Gated here:
 *   A. 4 truly-concurrent child CLI spawns → all 4 land, file parses, lock
 *      released (children are spawned together, not awaited one-by-one)
 *   B. Tombstone: hydrate→kill→stale-snapshot write does NOT resurrect X,
 *      while unseen newcomers (Z) ARE adopted and own spawns (Y) persist
 *
 * Run: node test/roster-crossprocess.test.js
 * (scratch brain qc-roster-gate is wiped before and after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-roster-gate';
const STORE = path.join(ROOT, 'models', 'private', BRAIN, 'orgchart', 'agents.json');

const results = { passed: 0, failed: 0, tests: [] };

function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
    results.tests.push({ name, ok });
}

function readRoster() {
    return new Map(JSON.parse(fs.readFileSync(STORE, 'utf8')));
}

// Run a child CLI-style process inside the scratch brain (async spawn so
// several children can genuinely overlap — spawnSync would serialize them
// and make gate A pass vacuously). The script mirrors bin/agents.js's flow.
function runChild(script) {
    return new Promise((resolve, reject) => {
        const r = spawn(process.execPath, ['-e', script], {
            cwd: ROOT,
            env: { ...process.env, VANT_BRAIN: BRAIN },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '', err = '';
        r.stdout.on('data', d => { out += d; });
        r.stderr.on('data', d => { err += d; });
        const killer = setTimeout(() => { r.kill('SIGKILL'); }, 30000);
        r.on('close', code => {
            clearTimeout(killer);
            if (code === 0) resolve(out);
            else reject(new Error('child exit ' + code + ': ' + (err || out || 'no output')));
        });
    });
}

const CHILD_PRELUDE = `
const boot = require("./lib/boot");
boot.init({ taskId: "roster-gate", scopes: ["read", "write", "spawn", "execute"], debug: false });
const agents = require("./lib/agents");
const { flushAgents } = require("./lib/agents/internal");
`;

function wipe() {
    fs.rmSync(path.join(ROOT, 'models', 'private', BRAIN), { recursive: true, force: true });
}

(async () => {
    console.log('\n🤝 CROSS-PROCESS ROSTER TESTS\n');
    wipe();

    // ============================================
    // GATE A — concurrent CLI spawns all persist
    // ============================================
    try {
        const CHILD_SPAWN = CHILD_PRELUDE + `
(async () => {
    const a = await agents.spawn({ name: "gate-a-" + Math.random().toString(36).slice(2, 7), role: "Probe" });
    await flushAgents();
    console.log(a.id);
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`;
        // Start all four BEFORE awaiting any — real overlap, like four
        // humans running `vant agents spawn` in four terminals at once.
        const pending = [runChild(CHILD_SPAWN), runChild(CHILD_SPAWN), runChild(CHILD_SPAWN), runChild(CHILD_SPAWN)];
        const outs = await Promise.all(pending);
        // Child stdout also carries boot INFO lines — pull the id out.
        const ids = outs.map(s => (s.match(/agent_[a-z0-9]+/) || [])[0]).filter(Boolean);
        const roster = readRoster();
        report('4 concurrent CLI spawns → 4 roster entries (was 3 pre-fix)',
            ids.length === 4 && ids.every(id => roster.has(id)),
            `spawned=${ids.length} persisted=${roster.size}`);
        report('roster file parses as a Map (atomic write held)', roster.size >= 4);
        report('lock file released after saves', !fs.existsSync(STORE + '.lock'));
    } catch (e) {
        report('gate A (concurrent spawns)', false, e.message);
    }

    // ============================================
    // GATE B — tombstone + adoption semantics
    // ============================================
    try {
        wipe();
        // Seed one agent (X) from its own process.
        await runChild(CHILD_PRELUDE + `
(async () => {
    await agents.spawn({ name: "gate-b-victim", role: "Probe" });
    await flushAgents();
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`);

        // Child 2: hydrate (X enters _seenIds), KILL X (leaves _seenIds,
        // exits _agents), spawn Y, then plant a STALE snapshot containing X
        // (as a crashed peer would) plus a never-seen newcomer Z — then
        // flush. Expect: X NOT resurrected (tombstone), Z adopted, Y kept.
        await runChild(CHILD_PRELUDE + `
const fs = require("fs");
const path = require("path");
const STORE = path.join("models", "private", ${JSON.stringify(BRAIN)}, "orgchart", "agents.json");
(async () => {
    const listed = await agents.list(); // hydrate: disk roster (X) lands in memory + _seenIds
    const victim = listed.find(a => a.name === "gate-b-victim");
    if (!victim) throw new Error("victim not found after hydrate");
    // Capture X's full entry BEFORE the kill (agents.get is gone afterwards).
    const xRec = agents.get(victim.id);
    const xEntry = [xRec.id, JSON.parse(JSON.stringify(xRec))];
    await agents.terminate(victim.id); // kill: leaves _agents, stays in _seenIds
    await agents.spawn({ name: "gate-b-keeper", role: "Probe" });
    // Stale peer snapshot: X resurrected + unknown agent Z
    const zId = "agent_gatebphantom0000000000000000000000000000";
    const zEntry = [zId, {
        id: zId, name: "gate-b-phantom", role: "Probe", type: "default",
        brain: ${JSON.stringify(BRAIN)}, state: "idle", created: Date.now(),
        parent: null, children: [], team: null, roleId: null, mcp: null,
        workspace: "default", habitatRoles: ["editor"]
    }];
    fs.writeFileSync(STORE, JSON.stringify([xEntry, zEntry]));
    // spawn()'s save is fire-and-forget and already drained (_dirty false),
    // so flushAgents() alone would no-op here. Force a chained save — its
    // merge reads the just-planted disk: adopt Z, tombstone-skip X, keep Y.
    const internal = require("./lib/agents/internal");
    await internal._saveAgents(internal._agents);
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`);
        const roster = readRoster();
        const names = [...roster.values()].map(a => a.name).sort();
        report('deleted agent NOT resurrected by stale peer snapshot', !names.includes('gate-b-victim'),
            `names=${names}`);
        report('unseen newcomer (Z) adopted on save', names.includes('gate-b-phantom'), `names=${names}`);
        report('own spawn (Y) persisted', names.includes('gate-b-keeper'), `names=${names}`);
    } catch (e) {
        report('gate B (tombstone + adoption)', false, e.message);
    }

    // ============================================
    // Summary
    // ============================================
    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('fatal:', e.message);
    wipe();
    process.exit(1);
});
