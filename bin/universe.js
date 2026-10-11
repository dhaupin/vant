#!/usr/bin/env node
/**
 * Vant Universe CLI (Waves U1 + U2 — labs/prd-universe.md)
 *
 * U1: PASS-derived genesis snapshots over lib/state/genesis-snapshot.js.
 * U2: stored, content-addressed scenario manifests — record freezes a
 * snapshot + state root into a manifest whose id IS the content hash;
 * diff compares two manifests under the same-universe contract; resume
 * verifies the frozen root and writes a brain-lock-gated, WAL-backed
 * restore marker (fail-closed while a peer holds the region).
 *
 * Usage:
 *   vant universe snapshot <name> [--json]   Derive + print a world snapshot
 *   vant universe fork <parent> <child> [--json]   Fork via prefix folding
 *   vant universe status [--json]            Universe constant + which source
 *   vant universe record <name> [--fork] [--state-root <hash>] [--values <json>] [--json]
 *                                            Store a content-addressed manifest
 *                                            (--values freezes cell VALUES for
 *                                             byte-restoring materialization)
 *   vant universe diff <idA> <idB> [--json]  Cell-hash delta (same-universe contract)
 *   vant universe resume <id> [--actor <name>] [--materialize] [--json]
 *                                            Lock-gated resume marker; --materialize
 *                                            restores the recorded cell values
 *                                            (escrow-gated, 1 credit/cell)
 *
 * Universe resolution order (per seeds.js): --universe flag > VANT_UNIVERSE_SEED env > default.
 * Exit codes: 0 ok; 1 typed lib error (code on stderr); 2 usage error.
 */
const vaf = require('../lib/vaf');
const gs = require('../lib/state/genesis-snapshot');

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const uiIdx = args.indexOf('--universe');
const universeFlag = uiIdx !== -1 ? args[uiIdx + 1] : undefined;
const positionals = args.filter((a, i) =>
    !a.startsWith('-') && (i === 0 || args[i - 1] !== '--universe'));

if (args.includes('-h') || args.includes('--help') || positionals.length === 0) {
    console.log(`Vant Universe — genesis snapshots + stored scenario manifests (U1/U2, prd-universe.md)

Usage:
  vant universe snapshot <name> [--json]        Derive world snapshot (seed, cells, fingerprint)
  vant universe fork <parent> <child> [--json]  Prefix-folded fork world
  vant universe status [--json]                 Universe constant source report
  vant universe record <name> [--fork] [--state-root <hash>] [--json]
                                                Record a content-addressed manifest
  vant universe diff <idA> <idB> [--json]       Cell-hash delta between stored manifests
  vant universe resume <id> [--actor <name>] [--json]
                                                Write the brain-lock-gated resume marker

Options:
  --universe <seed>        Override; else VANT_UNIVERSE_SEED env; else default
  --fork                   record: derive via prefix folding (name = parent.child)
  --state-root <hash>      record: freeze an explicit protocol-state root
  --values <json>          record: freeze cell VALUES (>address: value, address must be this
                           snapshot's cells) for byte-restoring materialization (U3)
  --actor <name>           resume: record the resuming actor in the marker
  --materialize            resume: escrow-gated byte-restoration of recorded cell values
                           (1 credit per cell; broke actors refuse E_SNAPSHOT_BUDGET)
  --json                   Machine-readable output

Exit codes: 0 ok · 1 typed lib error (code on stderr) · 2 usage error
`);
    process.exit(0);
}

const cmd = positionals[0];
vaf.check(cmd, { type: 'string', name: 'cmd', maxLength: 16 });

function _opts() {
    const o = {};
    if (universeFlag !== undefined) {
        vaf.check(universeFlag, { type: 'string', name: 'universe', maxLength: 256 });
        o.universe = universeFlag;
    }
    return o;
}

try {
    let result;
    if (cmd === 'snapshot') {
        const name = positionals[1];
        if (!name) { console.error('Usage: vant universe snapshot <name>'); process.exit(2); }
        vaf.check(name, { type: 'string', name: 'world name', maxLength: 128 });
        result = gs.genesisSnapshot({ name, ..._opts() });
        if (jsonOut) console.log(JSON.stringify(result, null, 2));
        else {
            console.log(`\nGenesis snapshot: ${result.name}`);
            console.log(`  spaceId:     ${result.spaceId}`);
            console.log(`  scopePath:   ${result.scopePath}`);
            console.log(`  seed:        ${result.seed.slice(0, 16)}…`);
            console.log(`  cells:       ${result.cells.length} genesis cells (root + ring 1)`);
            console.log(`  fingerprint: ${result.fingerprint}`);
        }
    } else if (cmd === 'fork') {
        const parent = positionals[1], child = positionals[2];
        if (!parent || !child) { console.error('Usage: vant universe fork <parent> <child>'); process.exit(2); }
        vaf.check(parent, { type: 'string', name: 'parent', maxLength: 128 });
        vaf.check(child, { type: 'string', name: 'child', maxLength: 128 });
        result = gs.forkSnapshot({ parent, child, ..._opts() });
        if (jsonOut) console.log(JSON.stringify(result, null, 2));
        else {
            console.log(`\nForked world: ${result.name} (prefix-folded from ${result.parent})`);
            console.log(`  spaceId:     ${result.spaceId}`);
            console.log(`  seed:        ${result.seed.slice(0, 16)}…`);
            console.log(`  fingerprint: ${result.fingerprint}`);
        }
    } else if (cmd === 'status') {
        const o = _opts();
        let source = 'default';
        if (o.universe) source = '--universe flag';
        else if (process.env.VANT_UNIVERSE_SEED) source = 'VANT_UNIVERSE_SEED env';
        const probe = gs.genesisSnapshot({ name: 'vant', ...o });
        result = { universeSource: source, defaultWorld: 'vant', fingerprint: probe.fingerprint };
        if (jsonOut) console.log(JSON.stringify(result, null, 2));
        else {
            console.log(`\nUniverse constant: ${source}`);
            console.log(`  default-world fingerprint: ${probe.fingerprint}`);
            console.log('  (override with --universe <seed> or VANT_UNIVERSE_SEED)');
        }
    } else if (cmd === 'record') {
        const name = positionals[1];
        if (!name) { console.error('Usage: vant universe record <name> [--fork] [--state-root <hash>]'); process.exit(2); }
        vaf.check(name, { type: 'string', name: 'world name', maxLength: 128 });
        const o = _opts();
        const fork = args.includes('--fork');
        const srIdx = args.indexOf('--state-root');
        const stateRoot = srIdx !== -1 ? args[srIdx + 1] : undefined;
        if (stateRoot !== undefined) vaf.check(stateRoot, { type: 'string', name: 'state-root', maxLength: 128 });
        // (U3) --values '<json>': freeze cell VALUES for byte-restoring
        // materialization. Parsed with JSON.parse (vaf-gated length); the lib
        // gates the addresses against the snapshot's own cells (typed).
        let values;
        const vIdx = args.indexOf('--values');
        if (vIdx !== -1) {
            const raw = args[vIdx + 1] || '';
            vaf.check(raw, { type: 'string', name: 'values json', maxLength: 8192 });
            try { values = JSON.parse(raw); } catch (e) {
                console.error('universe record: --values must be JSON: ' + e.message);
                process.exit(2);
            }
        }
        const r = gs.recordSnapshot({ name, fork, stateRoot, values, ...o });
        if (!r.ok) { console.error('universe record: ' + r.error + (r.code ? ' [' + r.code + ']' : '')); process.exit(1); }
        result = r;
        if (jsonOut) console.log(JSON.stringify(result, null, 2));
        else {
            console.log(`\n${r.added ? 'Recorded' : 'Already stored (dedup)'}: ${r.manifest.name}`);
            console.log(`  manifestId:   ${r.manifestId}`);
            console.log(`  folded:       ${r.manifest.folded ? 'yes (' + r.manifest.from + ')' : 'no'}`);
            console.log(`  stateRoot:    ${String(r.manifest.stateRoot).slice(0, 24)}…`);
            console.log(`  values:       ${r.manifest.values ? Object.keys(r.manifest.values).length + ' frozen cell value(s) (resumable materialization)' : 'none (derived-only manifest)'}`);
            console.log(`  registry:     ${r.manifestCount} manifest(s) in ${r.file} (brain-scoped)`);
        }
    } else if (cmd === 'diff') {
        const idA = positionals[1], idB = positionals[2];
        if (!idA || !idB) { console.error('Usage: vant universe diff <idA> <idB>'); process.exit(2); }
        vaf.check(idA, { type: 'string', name: 'manifest id A', maxLength: 64 });
        vaf.check(idB, { type: 'string', name: 'manifest id B', maxLength: 64 });
        const la = gs.loadSnapshot({ id: idA });
        if (!la.ok) { console.error('universe diff (a): ' + la.error + ' [' + la.code + ']'); process.exit(1); }
        const lb = gs.loadSnapshot({ id: idB });
        if (!lb.ok) { console.error('universe diff (b): ' + lb.error + ' [' + lb.code + ']'); process.exit(1); }
        const d = gs.diffManifests(la.manifest, lb.manifest);
        if (!d.ok) { console.error('universe diff: ' + d.error + ' [' + d.code + ']'); process.exit(1); }
        result = d;
        if (jsonOut) console.log(JSON.stringify(result, null, 2));
        else {
            console.log(`\nDiff ${d.a.name} ↔ ${d.b.name}:`);
            console.log(gs.summarizeDiff(d));
        }
    } else if (cmd === 'resume') {
        const id = positionals[1];
        if (!id) { console.error('Usage: vant universe resume <manifestId> [--actor <name>]'); process.exit(2); }
        vaf.check(id, { type: 'string', name: 'manifest id', maxLength: 64 });
        const actorIdx = args.indexOf('--actor');
        const actor = actorIdx !== -1 ? args[actorIdx + 1] : undefined;
        if (actor !== undefined) vaf.check(actor, { type: 'string', name: 'actor', maxLength: 64 });
        const run = async () => {
            const materialize = args.includes('--materialize');
            const r = await gs.resumeSnapshot({ id, actor, materialize });
            if (!r.ok) { console.error('universe resume: ' + r.error + (r.code ? ' [' + r.code + ']' : '')); process.exit(1); }
            if (jsonOut) console.log(JSON.stringify(r, null, 2));
            else {
                const lr = r.liveRootMatch === null ? 'not crosschecked (no live-root probe)' : (r.liveRootMatch ? 'MATCHES frozen root' : 'DIFFERS from frozen root (drift!)');
                console.log(`\nResumed scenario: ${r.name}`);
                console.log(`  manifestId:    ${r.manifestId}`);
                console.log(`  frozen root:   ${String(r.stateRoot).slice(0, 24)}… (actor: ${r.marker.actor})`);
                console.log(`  live root:     ${lr}`);
                console.log('  marker written under the brain-root lock (fail-closed; WAL-backed)');
                if (r.materialized) {
                    console.log(`  materialized:  ✓ byte-restored ${r.materializeGate.charged} cell value(s) (${r.bytesRestored} bytes, escrow-charged)`);
                } else if (materialize) {
                    console.log('  materialized:  no (no recorded values on this manifest)');
                }
            }
            process.exit(0);
        };
        run().catch(e => { console.error('universe resume: ' + e.message); process.exit(1); });
        return; // async path exits inside run()
    } else {
        console.error('Usage: vant universe [snapshot|fork|status|record|diff|resume]');
        process.exit(2);
    }
    process.exit(0);
} catch (e) {
    console.error('universe: ' + e.message + (e.code ? ' [' + e.code + ']' : ''));
    process.exit(1);
}
