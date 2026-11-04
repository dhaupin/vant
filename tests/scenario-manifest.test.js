'use strict';
/**
 * Wave U2 pin suite — Stored Scenario Manifests (labs/prd-universe.md).
 *
 * Coverage map to PRD checklist items:
 *   U2.1 record content-addressed manifest        → determinism + dedup pins
 *   U2.2 diff + same-universe contract            → diff pins
 *   U2.3 resume (WAL-aware, never bypasses lock)  → resume pins
 *   U2.4 cross-process byte-identical manifests   → child-process pin
 *   U2.5 MCP record/diff/resume                   → covered live in CLI/MCP
 *                                                    smoke + grand-tour; the
 *                                                    rules-allowlist fix is
 *                                                    pinned here below.
 */
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const gs = require('../lib/state/genesis-snapshot');
const stateStore = require('../lib/state-store');
const rules = require('../lib/rules');

const UNIVERSE = 'u2-pin-universe-fixed';
const REG = 'state/u2-pin-manifests.json';
const RES = 'state/u2-pin-resumes.json';
const CELLS = 'state/u2-pin-cells.json';

let passed = 0, failed = 0;
function ok(name, fn) {
    try { fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name + ': ' + e.message); }
}
async function okAsync(name, fn) {
    try { await fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name + ': ' + e.message); }
}

/** The on-disk state-file path for the active (env-scoped) brain. */
function diskPath(stateFile) {
    return 'models/private/' + stateStore.currentBrain() + '/' + stateFile;
}

function wipe() {
    for (const f of [REG, RES, CELLS]) {
        try { stateStore.clear(f); } catch (e) { /* absent ok */ }
    }
}

async function main() {

// ------------------------------------------------------------------
// (U2.1) Content-addressed record
// ------------------------------------------------------------------

ok('record: fresh registry, first record added=true, count=1, 64-hex id', () => {
    wipe();
    const r = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.added, true);
    assert.strictEqual(r.manifestCount, 1);
    assert.match(r.manifestId, /^[0-9a-f]{64}$/);
});

ok('dedup: identical re-record → added=false, same id (content-addressed no-op)', () => {
    const r1 = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG });
    const r2 = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.added, false);
    assert.strictEqual(r2.manifestId, r1.manifestId);
    assert.strictEqual(r2.manifestCount, 1);
    // And it IS on disk under the arch-A protocol-state marker:
    const disk = JSON.parse(fs.readFileSync(diskPath(REG), 'utf8'));
    assert.strictEqual(disk.kind, 'vant-protocol-state');
    assert.ok(disk.manifests[r1.manifestId]);
});

ok('distinct stateRoot → distinct manifestId (content-addressing bites)', () => {
    const r1 = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG });
    const r2 = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'b'.repeat(64), manifestFile: REG });
    assert.notStrictEqual(r2.manifestId, r1.manifestId);
    assert.strictEqual(r2.added, true);
    assert.strictEqual(r2.manifestCount, 2);
});

ok('fork record: dotted name derives prefix-folded manifest (folded=true, from carried)', () => {
    const r = gs.recordSnapshot({ name: 'alpha.forked', universe: UNIVERSE, stateRoot: 'c'.repeat(64), fork: true, manifestFile: REG });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.manifest.folded, true);
    assert.ok(r.manifest.from && String(r.manifest.from).includes('alpha'));
    assert.notStrictEqual(r.manifest.seed, gs.genesisSnapshot({ name: 'alpha.forked', universe: UNIVERSE }).seed,
        'folded seed must NOT equal a direct derivation of the same name');
    // A fork record without a dotted name is typed refused.
    const bad = gs.recordSnapshot({ name: 'undotted', fork: true, universe: UNIVERSE, manifestFile: REG });
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.code, 'E_SNAPSHOT_NAME');
});

ok('hostile inputs typed: invalid manifestFile / missing name / bad universe', () => {
    const badFile = gs.recordSnapshot({ name: 'x', manifestFile: '../escape.json' });
    assert.strictEqual(badFile.ok, false);
    assert.strictEqual(badFile.code, 'E_SNAPSHOT_MANIFEST');
    const noName = gs.recordSnapshot({ universe: UNIVERSE, manifestFile: REG });
    assert.strictEqual(noName.ok, false);
    assert.strictEqual(noName.code, 'E_SNAPSHOT_NAME');
    const badUni = gs.recordSnapshot({ name: 'x', universe: 42, manifestFile: REG });
    assert.strictEqual(badUni.ok, false);
    assert.strictEqual(badUni.code, 'E_SNAPSHOT_UNIVERSE');
});

// ------------------------------------------------------------------
// (U2.2) Diff + same-universe contract
// ------------------------------------------------------------------

ok('diff: identical manifests → identical=true, zero changes', () => {
    const m = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG }).manifest;
    const d = gs.diffManifests(m, JSON.parse(JSON.stringify(m)));
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.identical, true);
    assert.strictEqual(d.changed.length, 0);
    assert.strictEqual(d.stateRootDiffers, false);
});

ok('diff: same world, different stateRoot → stateRootDiffers, cells unchanged', () => {
    const mA = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG }).manifest;
    const mB = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'b'.repeat(64), manifestFile: REG }).manifest;
    const d = gs.diffManifests(mA, mB);
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.changed.length, 0, 'same-world cells must match');
    assert.strictEqual(d.stateRootDiffers, true);
    assert.strictEqual(d.identical, false);
});

ok('diff contract: different worlds refused typed (E_SNAPSHOT_WORLD_MISMATCH)', () => {
    const mA = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG }).manifest;
    const mB = gs.recordSnapshot({ name: 'zeta', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG }).manifest;
    const d = gs.diffManifests(mA, mB);
    assert.strictEqual(d.ok, false);
    assert.strictEqual(d.code, 'E_SNAPSHOT_WORLD_MISMATCH');
});

ok('diff contract: different universes refused typed (E_SNAPSHOT_UNIVERSE)', () => {
    const mA = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG }).manifest;
    const mB = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE + '-other', stateRoot: 'a'.repeat(64), manifestFile: REG }).manifest;
    assert.notStrictEqual(mA.universeTag, mB.universeTag, 'canary tags differ across universes');
    // Force same world so ONLY the universe gate fires:
    const d = gs.diffManifests({ ...mA, spaceId: mB.spaceId }, mB);
    assert.strictEqual(d.ok, false);
    assert.strictEqual(d.code, 'E_SNAPSHOT_UNIVERSE');
});

ok('diff: non-manifest payloads refuse typed (E_SNAPSHOT_MANIFEST)', () => {
    const d = gs.diffManifests({ kind: 'not-a-manifest' }, { kind: 'universe-manifest' });
    assert.strictEqual(d.ok, false);
    assert.strictEqual(d.code, 'E_SNAPSHOT_MANIFEST');
});

// ------------------------------------------------------------------
// (U2.3) Resume — lock-gated, WAL-backed marker
// ------------------------------------------------------------------

await okAsync('resume: marker written through persistMerged (brain-root lock held during write)', async () => {
    const r = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG });
    const res = await gs.resumeSnapshot({ id: r.manifestId, actor: 'pin-suite', manifestFile: REG, resumeFile: RES });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.resumed, true);
    assert.strictEqual(res.liveRootMatch, null);
    assert.strictEqual(res.marker.manifestId, r.manifestId);
    assert.strictEqual(res.marker.actor, 'pin-suite');
    const disk = JSON.parse(fs.readFileSync(diskPath(RES), 'utf8'));
    assert.strictEqual(disk.kind, 'vant-protocol-state');
    assert.ok(disk.resumes && disk.resumes[r.manifestId], 'marker present on disk');
    // persistMerged's own token: {aborted} must be falsy on success.
    assert.ok(!res.aborted);
});

await okAsync('resume: typed absence for unknown id (E_SNAPSHOT_ABSENT)', async () => {
    const res = await gs.resumeSnapshot({ id: 'de'.repeat(32), manifestFile: REG, resumeFile: RES });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'E_SNAPSHOT_ABSENT');
});

await okAsync('resume: unambiguous PREFIX resolves (ambiguity is typed, never silent)', async () => {
    const r = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG });
    const res = await gs.resumeSnapshot({ id: r.manifestId.slice(0, 12), manifestFile: REG, resumeFile: RES });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.manifestId, r.manifestId);
});

await okAsync('resume: liveRootMatch flags verified vs drifted live root (verify beats declare)', async () => {
    const frozen = 'e'.repeat(64);
    const r = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: frozen, manifestFile: REG });
    const match = await gs.resumeSnapshot({ id: r.manifestId, manifestFile: REG, resumeFile: RES, currentRoot: () => frozen });
    assert.strictEqual(match.liveRootMatch, true, 'matching live root → true');
    const drift = await gs.resumeSnapshot({ id: r.manifestId, manifestFile: REG, resumeFile: RES, currentRoot: () => '0'.repeat(64) });
    assert.strictEqual(drift.liveRootMatch, false, 'drifted live root → honest false');
});

await okAsync('resume fail-closed: a HELD brain-region lock refuses the marker (E_STATE_LOCKED)', async () => {
    // Deterministic cross-process contention: plant a lockfile with a FUTURE
    // mtime (fresh, non-stale, foreign pid) on the exact path persistMerged
    // acquires. The waiter cannot take over (not stale) and cannot share
    // (different pid) — withLock must resolve {aborted, reason:'held'},
    // which resumeSnapshot maps to E_STATE_LOCKED (fail-closed, never an
    // unlocked write).
    const lockPath = stateStore.lockPathFor(RES);
    const lockDir = path.dirname(lockPath);
    fs.mkdirSync(lockDir, { recursive: true });
    const existed = fs.existsSync(lockPath);
    const backup = existed ? fs.readFileSync(lockPath, 'utf8') : null;
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999999, at: Date.now() }));
    // keep it maximally fresh so the stale-takeover never fires
    const st = fs.lstatSync(lockPath);
    fs.utimesSync(lockPath, st.atime, new Date());
    try {
        const r = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'a'.repeat(64), manifestFile: REG });
        const res = await gs.resumeSnapshot({ id: r.manifestId, manifestFile: REG, resumeFile: RES });
        assert.strictEqual(res.ok, false, 'held lock → refused (got: ' + JSON.stringify(res).slice(0, 160) + ')');
        assert.strictEqual(res.code, 'E_STATE_LOCKED');
    } finally {
        if (existed) fs.writeFileSync(lockPath, backup);
        else { try { fs.unlinkSync(lockPath); } catch (e) { /* swept later */ } }
    }
});

// ------------------------------------------------------------------
// (U2.4) Cross-process byte-identical record (fresh child processes)
// ------------------------------------------------------------------

ok('U2.4: two fresh processes record the same manifest → byte-identical manifestId', () => {
    fs.mkdirSync('.agent_tmp', { recursive: true });
    const probe = path.join('.agent_tmp', 'u2-probe.js');
    fs.writeFileSync(probe, `
        const gs = require('../lib/state/genesis-snapshot');
        const r = gs.recordSnapshot({
            name: 'xprocess-world',
            universe: ${JSON.stringify(UNIVERSE)},
            stateRoot: ${JSON.stringify('d'.repeat(64))},
            manifestFile: ${JSON.stringify(REG)}
        });
        console.log(JSON.stringify({ ok: r.ok, id: r.manifestId }));
        process.exit(r.ok ? 0 : 1);
    `);
    try {
        const a = spawnSync('node', [probe], { encoding: 'utf8' });
        const b = spawnSync('node', [probe], { encoding: 'utf8' });
        const A = JSON.parse((a.stdout || '').trim().split('\n').filter(Boolean).pop());
        const B = JSON.parse((b.stdout || '').trim().split('\n').filter(Boolean).pop());
        assert.strictEqual(A.ok, true, 'child A record ok' + (a.stderr ? ' — ' + a.stderr.slice(0, 80) : ''));
        assert.strictEqual(B.ok, true, 'child B record ok' + (b.stderr ? ' — ' + b.stderr.slice(0, 80) : ''));
        assert.strictEqual(A.id, B.id, 'same content ⇒ same id across fresh processes');
    } finally {
        try { fs.unlinkSync(probe); } catch (e) { /* cleanup */ }
    }
});

// ------------------------------------------------------------------
// (U3) Byte-restoring materialization: record with values, escrow-gated
// resume materializes them back through the arch-A store.
// ------------------------------------------------------------------

ok('U3 record: values freeze into the manifest AND the cell store (values ride the manifest id)', () => {
    wipe();
    const snap = gs.genesisSnapshot({ name: 'alpha', universe: UNIVERSE });
    const values = {};
    values[snap.cells[0]] = 'hello-bytes';
    values[snap.cells[2]] = 'world-bytes';
    const r = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'f'.repeat(64), values, manifestFile: REG, cellFile: CELLS });
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.manifest.values, values, 'values ride inside the manifest payload');
    // Content-addressing bites: values ARE part of the id.
    const rBare = gs.recordSnapshot({ name: 'alpha-beta-distinct', universe: UNIVERSE, stateRoot: 'f'.repeat(64), manifestFile: REG, cellFile: CELLS });
    assert.ok(rBare.manifestId !== r.manifestId, 'values-bearing manifest is content-distinct');
    // The cell store holds the (manifestId → values) row.
    const disk = JSON.parse(fs.readFileSync(diskPath(CELLS), 'utf8'));
    assert.strictEqual(disk.kind, 'vant-protocol-state');
    assert.deepStrictEqual(disk.cells[r.manifestId], values);
    // Hostile values: address not among the snapshot's cells → typed.
    const hostile = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: 'f'.repeat(64), values: { '/world/foreign-cell': 'x' }, manifestFile: REG, cellFile: CELLS });
    assert.strictEqual(hostile.ok, false);
    assert.strictEqual(hostile.code, 'E_SNAPSHOT_VALUES');
});

await okAsync('U3 materialize: resume writes the recorded values back (escrow-charged, bytesRestored honest)', async () => {
    const snap = gs.genesisSnapshot({ name: 'alpha', universe: UNIVERSE });
    const values = {}; values[snap.cells[1]] = 'restore-me';
    const r = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: '9'.repeat(64), values, manifestFile: REG, cellFile: CELLS });
    const res = await gs.resumeSnapshot({ id: r.manifestId, actor: 'u3-executor', materialize: true, manifestFile: REG, resumeFile: RES, cellFile: CELLS });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.materialized, true);
    assert.ok(res.bytesRestored > 0);
    assert.strictEqual(res.materializeGate.charged, 1, 'escrow charged 1 credit per cell');
    assert.strictEqual(res.materializeGate.spent, true);
});

await okAsync('U3 materialize gate: broke actor refused fail-closed (E_SNAPSHOT_BUDGET) before any store write', async () => {
    const escrow = require('../lib/escrow');
    // Drain the actor's budget: a zeroed flat budget (set through the Escrow
    // CLASS — the helper model keeps ids disk-coherent) makes every later
    // canSpend for that actor deny.
    const e = new escrow.Escrow({ defaultBudget: 0 });
    e.setBudget('scenario:materialize:broke-actor', 0);
    const snap = gs.genesisSnapshot({ name: 'alpha', universe: UNIVERSE });
    const values = {}; values[snap.cells[3]] = 'gate-drill';
    const r = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: '7'.repeat(64), values, manifestFile: REG, cellFile: CELLS });
    const res = await gs.resumeSnapshot({ id: r.manifestId, actor: 'broke-actor', materialize: true, manifestFile: REG, resumeFile: RES, cellFile: CELLS });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'E_SNAPSHOT_BUDGET');
    // Disk row untouched: still exactly the recorded payload.
    const disk = JSON.parse(fs.readFileSync(diskPath(CELLS), 'utf8'));
    assert.deepStrictEqual(disk.cells[r.manifestId], values);
});

await okAsync('U3 materialize: absent values typed (E_SNAPSHOT_ABSENT) — never invents data', async () => {
    const r0 = gs.recordSnapshot({ name: 'alpha', universe: UNIVERSE, stateRoot: '5'.repeat(64), manifestFile: REG }); // no values
    const res = await gs.resumeSnapshot({ id: r0.manifestId, materialize: true, manifestFile: REG, resumeFile: RES, cellFile: CELLS });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'E_SNAPSHOT_ABSENT');
    assert.strictEqual(res.materialized, undefined);
});

// ------------------------------------------------------------------
// (U2 opener fix) rules allowlist: universe tools pass the door;
// dangerous substrings stay denied.
// ------------------------------------------------------------------

ok('rules: all six universe tools clear the door (vant_universe_fork unblocked)', () => {
    for (const t of ['vant_universe_snapshot', 'vant_universe_fork', 'vant_universe_status',
                     'vant_universe_record', 'vant_universe_diff', 'vant_universe_resume']) {
        const r = rules.check(t, {});
        assert.strictEqual(r.allowed, true, t);
    }
});

ok('rules: dangerous substrings STILL denied (default-deny posture intact)', () => {
    for (const bad of ['acme_shell', 'run_exec', 'evil_forker', 'cmd_foo', 'system_x']) {
        const r = rules.check(bad, {});
        assert.strictEqual(r.allowed, false, bad);
        assert.strictEqual(r.rule, 'default');
    }
});

// Cleanup the pin-scoped state files.
wipe();

console.log('\n=== scenario-manifest pins (Wave U2): ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);

}

main().catch(e => { console.error('suite crash:', e); process.exit(1); });
