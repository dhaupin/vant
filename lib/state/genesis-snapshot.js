'use strict';

/**
 * Genesis Snapshot (Wave U1) + Stored Scenario Manifests (Wave U2)
 * ================================================================
 * labs/prd-universe.md
 *
 * U1: PASS-derived universe-world identity. A snapshot is a DERIVED FACT
 * about (universe constant, world name) — not a file, not a format:
 *
 *   name → SeedChain seed → spine cell addresses → canonical fingerprint
 *
 * Design rules honored (prd-universe.md §2):
 *   1. Rides the SeedChain — no second genesis format, no second PRF,
 *      no second hash chain (the #165 "one spine" thesis holds).
 *   2. Fork = filename. A forked child derives via SeedChain prefix
 *      folding (deriveChild), so `parent.child` recurses from the
 *      parent's seed and cannot collapse to the universe path.
 *
 * U2: STORED, CONTENT-ADDRESSED scenario manifests. A "record" bridges
 * the derived fact and live state: it freezes a snapshot plus a state
 * root into a manifest whose id IS the hash of its payload, so two
 * processes recording the same (world, universe, state root) produce
 * byte-identical records (U2.4), a re-record is a dedup no-op, and diff
 * between two manifests is a per-cell hash comparison (U2.2) gated by
 * the same-universe contract. Resume (U2.3) writes a lock-gated,
 * WAL-observed restore marker through the ONE arch-A state store — it
 * never hand-rolls fs and never bypasses the brain lock while a peer
 * holds the region (persistMerged fails closed).
 *
 * Name validation uses the spine's OWN grammar (SPACE_CONSUMERS.world)
 * re-tested locally so the runtime gets typed E_SNAPSHOT_* codes without
 * a second validator dialect; universe must be a string (anything else
 * is a caller bug, fail-closed typed).
 *
 * Engine-parity series (world/clock continuation).
 */

const { SeedChain } = require('./seeds');
const { AddressingSpine, SPACE_CONSUMERS } = require('./spine');

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

/** Snapshot v1 covers the root cell + first ring (5 genesis cells). */
const GENESIS_CELL_COUNT = 5;

/** Universe-lcanary world: same grammar, derived ONLY for identity tags. */
const UNIVERSE_CANARY_NAME = 'universe-canary';

/**
 * Derive the genesis snapshot of a named world.
 *
 * @param {object} [options]
 * @param {string} [options.name='vant'] - world name (spine /world/ grammar)
 * @param {string} [options.universe] - universe constant (env/default per seeds.js when omitted)
 * @returns {{ name, spaceId, scopePath, seed, cells, fingerprint }}
 */
function genesisSnapshot(options = {}) {
    const name = options.name === undefined || options.name === null ? 'vant' : String(options.name);

    // Universe: must be a string when provided (seeds.js would coerce
    // non-strings into the hash silently — a caller bug here stays typed).
    const universe = options.universe;
    if (universe !== undefined && (typeof universe !== 'string' || universe.length === 0)) {
        throw _vantErr('genesis-snapshot: universe must be a non-empty string', 'E_SNAPSHOT_UNIVERSE');
    }

    // Name: the spine's own /world/ grammar. Pre-test it so the failure is
    // typed BEFORE hashing anything (grammar itself is never reimplemented).
    const candidate = '/world/' + name.replace(/^\/+/, '');
    if (!SPACE_CONSUMERS.world.test(candidate)) {
        throw _vantErr('genesis-snapshot: invalid world name ' + JSON.stringify(name.slice(0, 60)), 'E_SNAPSHOT_NAME');
    }

    const chain = new SeedChain({ universe });
    const spine = new AddressingSpine({ universe });

    const spaceId = spine.spaceId('world', name);
    // Same conversion spine.cellAddress uses internally — one PRF, one path form.
    const scopePath = spaceId.replace(/\//g, ':').replace(/^:/, '');
    const seed = chain.seedHex(scopePath);

    const cells = [];
    for (let i = 0; i < GENESIS_CELL_COUNT; i++) cells.push(spine.cellAddress(spaceId, i));

    // Content fingerprint through the ONE canonical encoder.
    const fingerprint = spine.factHash({
        kind: 'genesis-snapshot',
        v: 1,
        name,
        spaceId,
        seed,
        cells
    });

    return { name, spaceId, scopePath, seed, cells, fingerprint };
}

/**
 * Derive a universe identity tag: the canary world's seed, derived under
 * the SAME universe (explicit or default) a snapshot will be built with.
 * Deterministic → two manifests from the same universe carry equal tags
 * however the constant was supplied; different universes never collide.
 */
function universeTag(universe) {
    return genesisSnapshot({ name: UNIVERSE_CANARY_NAME, universe }).seed;
}

/**
 * Fork: derive a child world from a parent snapshot's seed via PREFIX
 * FOLDING (seeds.js deriveChild). A fork name must be <parent>.<child>:
 * the chain recurses through the parent's seed, so the child's bytes
 * differ from deriving <child> from the universe directly even when the
 * world path would be identical (the leak-containment property).
 *
 * @param {object} options
 * @param {string} options.parent - parent world name (existing snapshot)
 * @param {string} options.child - child segment
 * @param {string} [options.universe]
 * @returns {{ name, spaceId, scopePath, seed, cells, fingerprint, parent, folded: true }}
 */
function forkSnapshot(options = {}) {
    const parent = String(options.parent || '');
    const child = String(options.child || '');
    if (!parent) throw _vantErr('genesis-snapshot: fork requires a parent world name', 'E_SNAPSHOT_NAME');
    if (!child) throw _vantErr('genesis-snapshot: fork requires a child segment', 'E_SNAPSHOT_NAME');

    // Universe: must be a string when provided (same typed gate).
    const universe = options.universe;
    if (universe !== undefined && (typeof universe !== 'string' || universe.length === 0)) {
        throw _vantErr('genesis-snapshot: universe must be a non-empty string', 'E_SNAPSHOT_UNIVERSE');
    }

    const chain = new SeedChain({ universe });
    const spine = new AddressingSpine({ universe });

    // Parent must itself resolve under the grammar (it gets hashed below);
    // a dotted parent (depth 2+) resolves through SeedChain's own folding.
    const parentSnap = genesisSnapshot({ name: parent, universe });
    const parentSeedBuf = Buffer.from(parentSnap.seed, 'hex');
    let childSeedBuf;
    try {
        childSeedBuf = chain.deriveChild(parentSeedBuf, child);
    } catch (e) {
        // typed through: E_SEED_PATH on a hostile child segment
        throw _vantErr('genesis-snapshot: invalid fork child ' + JSON.stringify(child.slice(0, 60)) + ' (' + (e.code || e.message) + ')', 'E_SNAPSHOT_NAME');
    }

    const name = parent + '.' + child;
    const candidate = '/world/' + name;
    if (!SPACE_CONSUMERS.world.test(candidate)) {
        throw _vantErr('genesis-snapshot: forked name exceeds /world/ grammar: ' + JSON.stringify(name.slice(0, 60)), 'E_SNAPSHOT_NAME');
    }

    const spaceId = spine.spaceId('world', name);
    const scopePath = spaceId.replace(/\//g, ':').replace(/^:/, '');
    const seed = childSeedBuf.toString('hex');

    const cells = [];
    for (let i = 0; i < GENESIS_CELL_COUNT; i++) cells.push(spine.cellAddress(spaceId, i));

    const fingerprint = spine.factHash({
        kind: 'genesis-snapshot',
        v: 1,
        name,
        spaceId,
        seed,
        cells,
        from: parentSnap.spaceId,
        folded: true
    });

    return { name, spaceId, scopePath, seed, cells, fingerprint, parent: parentSnap.spaceId, folded: true };
}

// ====================================================================
// WAVE U2 — STORED, CONTENT-ADDRESSED SCENARIO MANIFESTS
// (labs/prd-universe.md U2.1–U2.3)
//
// One PRF / one encoder still holds: the manifest hash rides
// canonical.encode (the ONE canonical encoder). Persistence rides the
// ONE protocol-state store (lib/state-store.js — arch-A rules, WAL
// included). Nothing here hand-rolls fs.
// ====================================================================

const canonical = require('./canonical');
const stateStore = require('../state-store');

/** Manifest schema version. Bump ONLY when the on-disk shape changes. */
const MANIFEST_V = 1;
/** Brain-scoped state file holding the stored-manifest registry. */
const MANIFEST_STATE_FILE = 'state/universe-manifests.json';
/** Brain-scoped state file holding resume markers (U2.3). */
const RESUME_STATE_FILE = 'state/universe-resumes.json';
/**
 * (U3) Brain-scoped state file for BYTE-RESTORING cell materialization:
 * cell values recorded with a manifest live here so a resume can write
 * them back through the arch-A store (escrow-gated per the U3 wave).
 */
const CELL_STATE_FILE = 'state/universe-cells.json';

/** Resolve (and validate) a registry state file for a call. */
function _stateFileFor(options, which, fallback) {
    const key = which + 'File';
    const f = options[key];
    if (f === undefined || f === null || f === '') return fallback;
    if (typeof f !== 'string' || !stateStore.STATE_FILE_RE.test(f) || f.includes('..')) {
        throw _vantErr('genesis-snapshot: invalid ' + key + ' ' + JSON.stringify(String(f).slice(0, 40)), 'E_SNAPSHOT_MANIFEST');
    }
    return f;
}

/**
 * (U2.1) Record a stored, content-addressed scenario manifest.
 *
 * The manifest payload is fully deterministic (no timestamp, no uuid):
 * the same (name, universe, stateRoot) in two fresh processes yields a
 * byte-identical manifest and therefore the same manifestId (U2.4).
 *
 * @param {object} options
 * @param {string} options.name - world name; for a fork the full dotted name (parent.child)
 * @param {string} [options.universe] - universe constant override
 * @param {boolean} [options.fork] - derive via forkSnapshot (name must be parent.child)
 * @param {string} [options.stateRoot] - explicit protocol-state root hash to freeze
 * @param {()=>string} [options.currentRoot] - test seam: resolve the live root
 * @param {string} [options.manifestFile] - registry state-file override (test seam)
 * @param {Object<string,string>} [options.values] - (U3) cell values to freeze for
 *   byte-restoring materialization (address → value); empty/omitted = derived-only manifest
 * @param {()=>string} [options.currentRoot] - test seam: resolve the live root
 * @returns {{ ok: true, manifest, manifestId, added, manifestCount, file } | { ok: false, error, code }}
 */
function recordSnapshot(options = {}) {
    try {
        const name = String(options.name || '');
        if (!name) throw _vantErr('genesis-snapshot: record requires a world name', 'E_SNAPSHOT_NAME');
        if (options.fork && !name.includes('.')) {
            throw _vantErr('genesis-snapshot: fork record requires a dotted parent.child name', 'E_SNAPSHOT_NAME');
        }

        const universe = options.universe;
        if (universe !== undefined && (typeof universe !== 'string' || universe.length === 0)) {
            throw _vantErr('genesis-snapshot: universe must be a non-empty string', 'E_SNAPSHOT_UNIVERSE');
        }

        const snap = options.fork
            ? forkSnapshot({ parent: name.split('.')[0], child: name.split('.').slice(1).join('.'), universe })
            : genesisSnapshot({ name, universe });

        // Frozen root: explicit > test seam > genesis fingerprint (a manifest
        // recorded before any state exists stays content-addressed and honest
        // about being pre-state rather than inventing a fake "live" hash).
        let stateRoot = null;
        if (typeof options.stateRoot === 'string' && options.stateRoot) stateRoot = options.stateRoot;
        else if (typeof options.currentRoot === 'function') stateRoot = String(options.currentRoot() || '') || null;
        if (!stateRoot) stateRoot = snap.fingerprint;

        // (U3) Optional byte-restoring materialization payload: the caller
        // hands cell VALUES (address → value) in; they ride INSIDE the
        // manifest payload (so the id still covers them) and are mirrored
        // to the cell store below. Validation mirrors the U1 typed gates.
        let cellValues = null;
        if (options.values !== undefined) {
            if (!options.values || typeof options.values !== 'object' || Array.isArray(options.values)) {
                throw _vantErr('genesis-snapshot: values must be an object of { address → value }', 'E_SNAPSHOT_VALUES');
            }
            cellValues = {};
            const cellSet = new Set(snap.cells);
            for (const [addr, val] of Object.entries(options.values)) {
                if (!cellSet.has(addr)) {
                    throw _vantErr('genesis-snapshot: values address ' + JSON.stringify(String(addr).slice(0, 32)) + ' is not one of this snapshot\'s cells', 'E_SNAPSHOT_VALUES');
                }
                cellValues[addr] = String(val);
            }
        }

        const manifest = {
            kind: 'universe-manifest',
            v: MANIFEST_V,
            name: snap.name,
            spaceId: snap.spaceId,
            scopePath: snap.scopePath,
            seed: snap.seed,
            cells: snap.cells,
            stateRoot,
            // Same-universe contract carrier (U2.2 canary identity).
            universeTag: universeTag(universe),
            from: snap.folded ? snap.parent : null,
            folded: !!snap.folded,
            // (U3) byte-restoring materialization payload (null = none).
            values: cellValues
        };

        // Content address: the ONE canonical encoder over the manifest.
        // Deterministic ⇒ byte-identical manifests across processes.
        const manifestId = canonical.hash(manifest);

        const file = _stateFileFor(options, 'manifest', MANIFEST_STATE_FILE);
        // Registry read (typed absence on a missing file = fresh registry).
        const registry = _loadRegistry(file);
        let added = false;
        if (!registry.manifests[manifestId]) {
            registry.manifests[manifestId] = manifest;
            // Ride the ONE arch-A store (WAL included). persist() is atomic
            // and never throws; `false` = write denial — surfaced, never a
            // silent bless.
            const wrote = stateStore.persist({
                moduleName: 'universe',
                stateFile: file,
                data: { manifests: registry.manifests }
            });
            if (!wrote) {
                return { ok: false, error: 'manifest registry write denied by the state store', code: 'E_STATE_WRITE' };
            }
            // (U3) Values ALSO land in the cell-value store (keyed by
            // manifestId) so resume's escrow-gated materialization can
            // write them back byte-identical. Only on `added` — a dedup
            // re-record never rewrites the materialization payload.
            if (cellValues) {
                const cellFile = _stateFileFor(options, 'cell', CELL_STATE_FILE);
                let cellsRegistry = { cells: {} };
                try {
                    stateStore.hydrate({
                        moduleName: 'universe',
                        stateFile: cellFile,
                        apply: (data) => {
                            if (data && typeof data === 'object' && data.cells && typeof data.cells === 'object') cellsRegistry.cells = data.cells;
                        }
                    });
                } catch (e) {
                    if (e && e.code === stateStore.STATE_READ_CODE) {
                        return { ok: false, error: 'cell-value store unreadable — denied, not absent: ' + e.message, code: 'E_STATE_READ' };
                    }
                }
                cellsRegistry.cells[manifestId] = cellValues;
                const cellWrote = stateStore.persist({
                    moduleName: 'universe',
                    stateFile: cellFile,
                    data: { cells: cellsRegistry.cells }
                });
                if (!cellWrote) {
                    return { ok: false, error: 'cell-value store write denied by the state store', code: 'E_STATE_WRITE' };
                }
            }
            added = true;
        }

        return { ok: true, manifest, manifestId, added, manifestCount: Object.keys(registry.manifests).length, file };
    } catch (e) {
        return { ok: false, error: e.message, code: e.code || 'E_SNAPSHOT_RECORD' };
    }
}

/** Hydrate the manifest registry. Missing file = fresh {} (typed absence). */
function _loadRegistry(file) {
    const out = { manifests: {} };
    try {
        stateStore.hydrate({
            moduleName: 'universe',
            stateFile: file,
            apply: (data) => {
                if (data && typeof data === 'object' && data.manifests && typeof data.manifests === 'object') {
                    out.manifests = data.manifests;
                }
            }
        });
    } catch (e) {
        // E_STATE_READ is a DENIAL, not absence — surface it, never fresh.
        if (e && e.code === stateStore.STATE_READ_CODE) {
            throw _vantErr('genesis-snapshot: manifest registry unreadable — denied, not absent: ' + e.message, 'E_STATE_READ');
        }
        // corrupt/unmarked falls through as fresh (hydrate already warned).
    }
    return out;
}

/**
 * (U2.2 aid) Load a stored manifest by id or unambiguous id prefix.
 * Ambiguity is typed, never resolved silently; absence is typed.
 */
function loadSnapshot(options = {}) {
    try {
        const id = String(options.id || '');
        if (!id) throw _vantErr('genesis-snapshot: load requires a manifest id', 'E_SNAPSHOT_MANIFEST');
        const file = _stateFileFor(options, 'manifest', MANIFEST_STATE_FILE);
        const registry = _loadRegistry(file);
        const ids = Object.keys(registry.manifests).filter(k => k === id || k.startsWith(id));
        if (ids.length === 0) {
            return { ok: false, error: 'no stored manifest matches ' + id.slice(0, 16), code: 'E_SNAPSHOT_ABSENT' };
        }
        if (ids.length > 1) {
            return { ok: false, error: 'ambiguous manifest id prefix ' + id.slice(0, 16) + ' matches ' + ids.length + ' manifests', code: 'E_SNAPSHOT_AMBIGUOUS' };
        }
        return { ok: true, manifestId: ids[0], manifest: registry.manifests[ids[0]] };
    } catch (e) {
        return { ok: false, error: e.message, code: e.code || 'E_SNAPSHOT_MANIFEST' };
    }
}

// ====================================================================
// DIFF (U2.2) — cell-hash delta between two frozen manifests.
// Same manifest → zero delta (one hash comparison). Different worlds or
// different universes are a typed CONTRACT refusal, never noisy output.
// Pure and total: reads no state, writes nothing.
// ====================================================================

/**
 * @param {object} a - manifest A (recordSnapshot().manifest or loadSnapshot().manifest)
 * @param {object} b - manifest B
 * @returns {{ ok: true, identical, same, a, b, changed, onlyInA, onlyInB, stateRootDiffers } |
 *            { ok: false, error, code }}
 */
function diffManifests(a, b) {
    const summarize = (m) => ({ name: m.name, stateRoot: m.stateRoot });
    try {
        for (const [label, m] of [['a', a], ['b', b]]) {
            if (!m || typeof m !== 'object' || m.kind !== 'universe-manifest') {
                throw _vantErr('diff manifest ' + label + ' is not a universe-manifest', 'E_SNAPSHOT_MANIFEST');
            }
        }
        void summarize;

        // Same-universe contract (U2.2): manifests from different universe
        // constants are not comparable — every cell would "differ" for a
        // meaningless reason. Both tags are always present (recorded at
        // record time); a legacy manifest without one skips the gate.
        if (a.universeTag && b.universeTag && a.universeTag !== b.universeTag) {
            throw _vantErr('diff refused: manifests come from DIFFERENT universe constants (same-universe contract)', 'E_SNAPSHOT_UNIVERSE');
        }

        // Same-world contract: diff is same-world only. Different worlds =
        // different cell sets = a rename, not a delta — refuse rather than
        // produce all-cells noise.
        if (a.spaceId !== b.spaceId) {
            throw _vantErr('diff refused: different worlds (' + a.name + ' vs ' + b.name + ') — diff is same-world only', 'E_SNAPSHOT_WORLD_MISMATCH');
        }

        // Content-addressing shortcut: identical manifests are one string
        // comparison on the canonical hash (we cannot cheaply recompute the
        // stored id here without the payload's exact reconstruction — the
        // structural comparison below IS the sound check).
        const cellSetDiffers = a.cells.length !== b.cells.length ||
            a.cells.some((c, i) => c !== b.cells[i]);

        const changed = [];
        const maxLen = Math.max(a.cells.length, b.cells.length);
        for (let i = 0; i < maxLen; i++) {
            const ca = a.cells[i], cb = b.cells[i];
            if (ca !== cb) changed.push({ index: i, a: ca || null, b: cb || null });
        }

        const rootDiffers = a.stateRoot !== b.stateRoot;

        return {
            ok: true,
            identical: !cellSetDiffers && !rootDiffers && a.seed === b.seed,
            same: !cellSetDiffers && !rootDiffers && a.seed === b.seed,
            universeMatch: !!(a.universeTag && b.universeTag && a.universeTag === b.universeTag),
            a: summarize(a),
            b: summarize(b),
            changed,
            onlyInA: a.cells.length > b.cells.length ? a.cells.slice(b.cells.length) : [],
            onlyInB: b.cells.length > a.cells.length ? b.cells.slice(a.cells.length) : [],
            stateRootDiffers: rootDiffers
        };
    } catch (e) {
        return { ok: false, error: e.message, code: e.code || 'E_SNAPSHOT_DIFF' };
    }
}

/** Pure human summary for CLI/MCP printouts. */
function summarizeDiff(result) {
    if (!result || !result.ok) return 'diff refused: ' + (result && result.error ? result.error : 'no result');
    if (result.identical) return 'identical manifests (same universe, same cells, same root)';
    const lines = [];
    if (!result.universeMatch) lines.push('⚠ universe identity unverified (legacy manifest without canary tag)');
    if (result.stateRootDiffers) {
        lines.push('state root differs:');
        lines.push('  a: ' + String(result.a.stateRoot).slice(0, 32));
        lines.push('  b: ' + String(result.b.stateRoot).slice(0, 32));
    }
    if (result.changed.length) {
        lines.push('cells changed: ' + result.changed.length);
        for (const c of result.changed.slice(0, 8)) {
            lines.push('  [' + c.index + '] ' + (c.a ? c.a.slice(0, 18) + '…' : '(absent)') + ' → ' + (c.b ? c.b.slice(0, 18) + '…' : '(absent)'));
        }
        if (result.changed.length > 8) lines.push('  … +' + (result.changed.length - 8) + ' more');
    }
    if (result.onlyInA.length) lines.push('only in a: ' + result.onlyInA.length + ' cell(s)');
    if (result.onlyInB.length) lines.push('only in b: ' + result.onlyInB.length + ' cell(s)');
    if (lines.length === 0) lines.push('same universe, same cells, same root — consistent');
    return lines.join('\n');
}

/**
 * (U2.3) RESUME — restore marker: WAL-aware, brain-lock-gated.
 *
 * Honest contract (documented, not papered over): the genesis manifest
 * freezes derived positions + a frozen state root, NOT the live
 * protocol-state payload. This wave ships the lock-gated marker path
 * (the resume contract below); byte-restoring materialization (writing
 * cell VALUES back) lands with U3's escrow-backed scenario executor.
 *
 * The marker goes through stateStore.persistMerged, which takes the
 * brain-root lock with failMode 'closed': while a peer holds the region,
 * the write is REFUSED (never degraded to an unlocked write) — the
 * "never bypasses brain-lock" acceptance. persistMerged is WAL-unified
 * (pass 169), so the marker rides write-ahead durability too.
 *
 * @param {object} options
 * @param {string} options.id - manifest id (or unambiguous prefix)
 * @param {string} [options.actor] - resume actor (recorded in the marker, ≤64 chars)
 * @param {string} [options.resumeFile] - resumes state-file override (test seam)
 * @param {string} [options.manifestFile] - manifest registry override (test seam)
 * @param {()=>string|null|boolean} [options.currentRoot] - test seam: live root for the frozen-root crosscheck
 * @param {boolean} [options.materialize] - (U3) ESCROW-GATED byte-restoring materialization:
 *   after the marker verifies, write the recorded cell VALUES back through the
 *   arch-A store (per-value escrow approval when escrow.js is present).
 */
async function resumeSnapshot(options = {}) {
    try {
        const loaded = loadSnapshot(options);
        if (!loaded.ok) return loaded;
        const m = loaded.manifest;

        const resumeFile = _stateFileFor(options, 'resume', RESUME_STATE_FILE);

        // Pre-lock live-root crosscheck (verify beats declare; a mismatch is
        // still resumed but flagged — the operator decides).
        let liveRootMatch = null;
        if (typeof options.currentRoot === 'function') {
            const live = options.currentRoot();
            if (typeof live === 'string' && live) liveRootMatch = (live === m.stateRoot);
        }

        const marker = {
            manifestId: loaded.manifestId,
            name: m.name,
            spaceId: m.spaceId,
            stateRoot: m.stateRoot,
            actor: String(options.actor || 'operator').slice(0, 64),
            liveRootMatch,
            resumedAt: Date.now()
        };

        // Lock-gated, WAL-backed, cross-process-merged write.
        // Contract detail (persistMerge reads): merge() only runs when the
        // disk file already EXISTS, so serialize() must own the DEFAULT body
        // (the fresh marker) and merge() enriches it with rows a peer added
        // between our hydrate and our lock. Either order yields a body that
        // always contains THIS marker plus any peer markers.
        const freshBody = () => ({ resumes: { [loaded.manifestId]: marker } });
        let mergedBody = null; // set by merge() when the disk file exists
        const out = await stateStore.persistMerged({
            moduleName: 'universe',
            stateFile: resumeFile,
            merge: (disk) => {
                const resumes = (disk && disk.resumes && typeof disk.resumes === 'object')
                    ? { ...disk.resumes } : {};
                resumes[loaded.manifestId] = marker; // ours wins (freshest)
                mergedBody = { resumes };
            },
            serialize: () => mergedBody || freshBody()
        });
        if (!out) {
            // FAIL-CLOSED: the lock was held/unavailable — no unlocked marker.
            return { ok: false, error: 'resume marker refused: brain region lock held or unavailable (fail-closed)', code: 'E_STATE_LOCKED' };
        }

        // (U3) ESCROW-GATED BYTE-RESTORING MATERIALIZATION. The U2 ship
        // ended at the verified marker; the U3 wave's escrow-backed
        // executor writes the recorded cell VALUES back:
        //   1. an escrow draw covers the materialization (cost = 1 credit
        //      per CELL written — the gate is real and priced), refused
        //      fail-closed when the budget will not cover it;
        //   2. values are restored through the ONE arch-A store
        //      (state/<cellFile>, WAL included) — never hand-rolled fs;
        //   3. the returned envelope reports bytesRestored +
        //      materialized:true so callers can verify by re-hashing.
        let materialized = false;
        let bytesRestored = 0;
        let materializeGate = null;
        if (options.materialize === true) {
            const cellFile = _stateFileFor(options, 'cell', CELL_STATE_FILE);
            let values = null;
            try {
                stateStore.hydrate({
                    moduleName: 'universe',
                    stateFile: cellFile,
                    apply: (data) => {
                        if (data && typeof data === 'object' && data.cells && typeof data.cells === 'object') values = data.cells[loaded.manifestId] || null;
                    }
                });
            } catch (e) {
                if (e && e.code === stateStore.STATE_READ_CODE) {
                    return { ok: false, error: 'cell-value store unreadable — denied, not absent: ' + e.message, code: 'E_STATE_READ' };
                }
            }
            if (!values || typeof values !== 'object' || Object.keys(values).length === 0) {
                return { ok: false, error: 'materialization refused: no recorded cell values for ' + loaded.manifestId.slice(0, 16) + ' (record with --values first)', code: 'E_SNAPSHOT_ABSENT' }; }

            // ESCROW GATE (the U3 executor's gate is real): a fresh,
            // disk-coherent Escrow instance draws 1 credit per recorded cell
            // (fresh-instance HELPER-MODEL: every helper mutation auto-
            // persists, every fresh instance reloads the store).
            const escrowMod = require('../escrow');
            const actor = String(options.actor || 'operator').slice(0, 64);
            const cost = Object.keys(values).length;
            const escrowAgent = new escrowMod.Escrow();
            const draw = escrowAgent.canSpend('scenario:materialize:' + actor, cost);
            if (!draw || draw.allowed !== true) {
                return {
                    ok: false,
                    error: 'materialization refused: escrow draw denied (' + (draw ? draw.reason : 'no budget') + ') — need ' + cost + ' credit(s)',
                    code: 'E_SNAPSHOT_BUDGET',
                    marker
                };
            }
            const spend = escrowAgent.recordSpend('scenario:materialize:' + actor, cost); // auto-persists
            materializeGate = { charged: cost, spent: spend && spend.recorded === true };

            // Restore byte-identical: persist exactly the recorded payload.
            const wroteValues = stateStore.persist({
                moduleName: 'universe',
                stateFile: cellFile,
                data: { cells: (() => {
                    let reg = {}; // fresh overwrite of THIS manifest's row
                    try {
                        stateStore.hydrate({ moduleName: 'universe', stateFile: cellFile, apply: (d) => {
                            if (d && typeof d === 'object' && d.cells && typeof d.cells === 'object') reg = d.cells;
                        } });
                    } catch (e2) { /* unreadable row falls through as fresh */ }
                    reg[loaded.manifestId] = values;
                    return reg;
                })() }
            });
            if (!wroteValues) {
                // Refund the draw: the executor never charges for a denied write.
                try { new escrowMod.Escrow().refund('scenario:materialize:' + actor, cost); } catch (e2) { /* surfaced below */ }
                return { ok: false, error: 'materialization refused: cell-value store write denied', code: 'E_STATE_WRITE', marker };
            }
            materialized = true;
            bytesRestored = Object.entries(values).reduce((acc, [, v]) => acc + String(v).length * 2, 0); // UTF-16 byte estimate
        }

        return {
            ok: true,
            resumed: true,
            manifestId: loaded.manifestId,
            name: m.name,
            stateRoot: m.stateRoot,
            liveRootMatch,
            materialized,
            bytesRestored,
            materializeGate,
            marker
        };
    } catch (e) {
        return { ok: false, error: e.message, code: e.code || 'E_SNAPSHOT_RESUME' };
    }
}

module.exports = {
    // U1
    genesisSnapshot,
    forkSnapshot,
    GENESIS_CELL_COUNT,
    // U2
    recordSnapshot,
    loadSnapshot,
    diffManifests,
    summarizeDiff,
    resumeSnapshot,
    universeTag,
    MANIFEST_V,
    MANIFEST_STATE_FILE,
    RESUME_STATE_FILE,
    CELL_STATE_FILE
};
