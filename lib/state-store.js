/**
 * State Store (pass 37 / prd-vant-os Architecture A)
 *
 * The ONE implementation of protocol-state persistence rules. Every
 * module that keeps live protocol state (node-registry, trust, msg,
 * later consensus/market) hydrates and writes through here — never via
 * raw fs, never with module-local copies of these rules drifting apart.
 *
 * Where: models/private/<brain>/<stateFile>  (brain-scoped, gitignored)
 *
 * Rules (prd-vant-os §4):
 *   - Store resolved PER CALL: pushBrain/currentBrain moves state with
 *     the active brain (same pattern as lib/teams.js orgchart store).
 *   - All IO through FileStorage: containment/symlink/VAF gates and
 *     atomic writes (tmp+rename) wrap every read/write.
 *   - READ DENIAL IS NOT CORRUPTION (pass-31 rule): a sandbox denial
 *     throws E_STATE_READ so callers surface it — state is never
 *     silently wiped. Parse failures may reset (loudly).
 *   - Missing file = fresh start. Corrupt file = warn + fresh.
 *
 * State files are DATA, not trust: stateFile must be a relative,
 * charset-guarded path segment (no traversal, no absolute, no symlink
 * games — FileStorage enforces again below us, belt and suspenders).
 */

const path = require('path');
const lock = require('./lock');
// (pass 177) §3 debt closure: the tree tier now ANCHORS. Every persist that
// carries a rootHash appends it to the brain's StateAnchor ledger (#152), so
// a tampered or partially-written state file is detectable against the last
// known-good root — not just against an in-process mirror that dies with the
// process. See anchorStateRoot()/verifyStateRoot() below.
const { StateAnchor } = require('./state/anchor');
// (pass 171) Opt-in tree tier: protocol state can mirror into the ONE
// content-addressed state spine (#145) — root hash for free, diff/snapshot
// semantics shared with mesh/raid/brains.
const { StateTree } = require('./state/tree');

// metadata keys that ride every persisted payload but are NOT state
const META_KEYS = new Set(['kind', 'module', 'savedAt']);

// (pass 169) Backbone wiring: lifecycle events on the shared bus.
let _event = null;
function _emit(event, data) {
    if (!_event) { try { _event = require('./event'); } catch (e) { return; } }
    if (_event && _event.emit) { _event.emit(event, data); }
}

// (pass 169) Backbone wiring: state mutations land in the audit ledger.
// state-store is the ONE choke point for protocol-state writes (prd-vant-os
// Architecture A), so auditing here covers every consumer (teams, agents,
// consensus, market, settlement, org-sync, notices...) without each module
// needing its own audit call.
function _audit(action, data) {
    try { require('./audit').log(action, data); } catch (e) { /* audit never blocks state */ }
}

// (pass 177) Per-brain anchor ledger for the tree tier. A dot-file at the
// brain root: invisible to the brain corpus and migrations (same posture as
// brain-verify's .brain-anchor.jsonl), NOT a .locks path (it is a state
// ledger, not a lock — the lock-path authority and the audit gate stay
// untouched). Re-resolved when the active brain moves (VANT_BRAIN wins).
let _stateAnchor = null;
let _anchorBrain = null;
const _lastAnchored = new Map(); // stateFile → last anchored rootHash (in-process dedupe)

function stateAnchor() {
    const brain = currentBrain();
    if (!_stateAnchor || _anchorBrain !== brain) {
        _stateAnchor = new StateAnchor(
            path.join('models', 'private', brain, '.state-anchor.jsonl'));
        _anchorBrain = brain;
        _lastAnchored.clear();
    }
    return _stateAnchor;
}

/** Last anchor entry recorded for ONE state file ({ state: 'ABSENT' } if none). */
function lastAnchorFor(stateFile) {
    const entries = stateAnchor().chain().filter(e => e.carrier === stateFile);
    if (entries.length === 0) return { state: 'ABSENT' };
    return { state: 'PRESENT', entry: entries[entries.length - 1] };
}

/**
 * (pass 177) Anchor a tree-tier root hash. Called by persist/persistMerged
 * after a successful write + mirror. Dedupe: an unchanged root is NOT
 * re-anchored (in-process cache first, then a ledger check for the
 * first call in a process), so the chain stays an event history, not a
 * heartbeat log. NEVER throws — a failed anchor must not fail a state
 * write; it warns and moves on (the next persist re-anchors).
 */
function anchorStateRoot(stateFile, rootHash, cause) {
    try {
        if (!rootHash) return null; // no tree tier → nothing to anchor
        if (_lastAnchored.get(stateFile) === rootHash) return null;
        const anchor = stateAnchor();
        const last = lastAnchorFor(stateFile);
        if (last.state === 'PRESENT' && last.entry.root_hash === rootHash) {
            _lastAnchored.set(stateFile, rootHash);
            return null; // ledger already knows this root (fresh process view)
        }
        const entry = anchor.anchor(rootHash, String(cause || 'state:persist').slice(0, 200), stateFile);
        _lastAnchored.set(stateFile, rootHash);
        _emit('state:anchored', { stateFile, rootHash, timestamp: entry.timestamp });
        return entry;
    } catch (e) {
        console.warn('[state-store] Root anchor failed (state write unaffected):', e.message);
        return null;
    }
}

/**
 * (pass 177) Verify a state file's CURRENT disk root against its last
 * anchor (#152 verify semantics, per file). hydrate() deliberately does
 * NOT anchor — otherwise every restart would re-bless whatever is on
 * disk and this check would launder its own divergences. Returns:
 *   { state: 'ABSENT' }                                  — nothing on disk
 *   { state: 'PRESENT', ok: false, anchored: false, … }   — tree tier used but never anchored
 *   { state: 'PRESENT', ok, current, lastAnchored, firstDivergence }
 */
function verifyStateRoot(stateFile) {
    const disk = treeFor(stateFile);
    if (disk.state !== 'PRESENT') return { state: disk.state, ok: false, reason: disk.reason };
    const last = lastAnchorFor(stateFile);
    if (last.state === 'ABSENT') {
        return { state: 'PRESENT', ok: false, anchored: false, current: disk.rootHash,
            firstDivergence: 'no anchors recorded for ' + stateFile };
    }
    const ok = last.entry.root_hash === disk.rootHash;
    return {
        state: 'PRESENT',
        ok,
        anchored: true,
        current: disk.rootHash,
        lastAnchored: last.entry,
        firstDivergence: ok ? null :
            'state diverged since anchor at ' + new Date(last.entry.timestamp).toISOString() +
            ' (cause: ' + (last.entry.cause || 'unspecified') + ')'
    };
}

const BRAIN_SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const STATE_FILE_RE = /^[a-zA-Z0-9][a-zA-Z0-9./_-]*$/; // may include 'state/' subdir
const STATE_READ_CODE = 'E_STATE_READ';

/** Path-active brain: VANT_BRAIN env override wins (getBrainPath semantics), then currentBrain. */
function currentBrain() {
    const envBrain = process.env.VANT_BRAIN;
    if (envBrain && BRAIN_SEGMENT_RE.test(envBrain)) return envBrain;
    try {
        const brain = require('./brain');
        const name = brain.getCurrentBrain ? brain.getCurrentBrain() : 'vant';
        return BRAIN_SEGMENT_RE.test(name) ? name : 'vant';
    } catch (e) {
        return 'vant';
    }
}

/** Validate + split a state file into { store, file } with FileStorage. Resolved PER CALL. */
function getStore(stateFile) {
    if (typeof stateFile !== 'string' || !STATE_FILE_RE.test(stateFile) ||
        stateFile.includes('..') || path.isAbsolute(stateFile)) {
        throw new (require('./error').VantError)('Invalid state file path: ' + JSON.stringify(stateFile).slice(0, 60),
            { code: 'E_STATE_PATH', retryable: false });
    }
    const storePath = 'models/private/' + currentBrain() + '/' + stateFile;
    const Storage = require('./storage');
    return {
        // (pass 169) WAL unification: protocol state is the exact data class
        // the WAL was built for (prd-storage crash recovery) — opt IN here so
        // every state-store consumer (teams, agents, consensus, market,
        // settlement, org-sync, notices...) gets write-ahead durability
        // without env flags. Other FileStorage users stay opt-in.
        store: new Storage.FileStorage({ basePath: path.resolve(path.dirname(storePath)), wal: true }),
        file: path.basename(storePath)
    };
}

/**
 * (pass 171) TREE TIER — opt-in mirror of protocol state into a StateTree.
 *
 * `toTree(moduleName, data)`: fold a protocol-state payload into a fresh
 * StateTree, one node per top-level key (metadata excluded), path
 * /<moduleName>/<key>. Deterministic: the same payload in a fresh tree
 * yields the same rootHash — "same state?" is one string comparison.
 *
 * `fromTree(moduleName, tree)`: the inverse (unwraps the tree's _scope
 * stamps). Roundtrip law: fromTree(m, toTree(m, data)) deep-equals the
 * state-bearing part of data.
 */
function toTree(moduleName, data) {
    if (typeof moduleName !== 'string' || !moduleName) {
        throw new (require('./error').VantError)('state-store.toTree: moduleName required', { code: 'E_STATE_PATH', retryable: false });
    }
    if (!data || typeof data !== 'object') {
        throw new (require('./error').VantError)('state-store.toTree: data must be an object', { code: 'VAF_INPUT_INVALID', retryable: false });
    }
    const tree = new StateTree();
    for (const [k, v] of Object.entries(data)) {
        if (META_KEYS.has(k)) continue;
        tree.put('/' + moduleName + '/' + k, v);
    }
    return tree;
}

function fromTree(moduleName, tree) {
    if (!(tree instanceof StateTree)) {
        throw new (require('./error').VantError)('state-store.fromTree: StateTree required', { code: 'VAF_INPUT_INVALID', retryable: false });
    }
    const prefix = '/' + moduleName + '/';
    const out = {};
    for (const p of tree.paths()) {
        if (!p.startsWith(prefix)) continue;
        const key = p.slice(prefix.length);
        let v = tree.get(p).value;
        // unwrap stampScope: scalars ride as {_scope, value}; objects carry _scope
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            const keys = Object.keys(v);
            if (keys.length === 2 && keys.includes('_scope') && keys.includes('value')) v = v.value;
            else { v = { ...v }; delete v._scope; }
        }
        out[key] = v;
    }
    return out;
}

/**
 * (pass 171) Opt-in tier read: build the StateTree for a state file's
 * CURRENT disk content. Typed absence: missing file → { state: 'ABSENT' };
 * corrupt/unmarked → { state: 'ABSENT', reason }. Present →
 * { state: 'PRESENT', tree, rootHash }. Read-only — never writes.
 */
function treeFor(stateFile) {
    try {
        const { store, file } = getStore(stateFile);
        if (!store.has(file)) return { state: 'ABSENT', reason: 'missing' };
        const raw = store.read(file);
        let data;
        try { data = JSON.parse(raw); } catch (e) {
            return { state: 'ABSENT', reason: 'corrupt' };
        }
        if (!data || data.kind !== 'vant-protocol-state') {
            return { state: 'ABSENT', reason: 'unmarked' };
        }
        const tree = toTree(data.module || moduleNameFromFile(stateFile), data);
        return { state: 'PRESENT', tree, rootHash: tree.rootHash() };
    } catch (e) {
        if (e && e.code === STATE_READ_CODE) throw e;
        return { state: 'ABSENT', reason: 'error', error: e && e.message };
    }
}

/** Derive a module name from a state file path (fallback for unmarked legacy payloads). */
function moduleNameFromFile(stateFile) {
    return String(stateFile || 'state').replace(/\.json$/, '').split('/').pop() || 'state';
}

/**
 * Hydrate state for a module. `apply(data)` runs only when a parseable
 * file exists. Throws E_STATE_READ on read denial; warns + fresh on
 * corruption. Returns { loaded, applied }.
 *
 * (pass 37) Hydration verifies the kind marker: a file missing it is
 * not ours (legacy dropfile relocated here, hand-planted junk) and is
 * ignored — treated like corruption (warn + fresh), never applied.
 *
 * (pass 171) `opts.tree` (StateTree): when provided AND state applied,
 * the disk payload is mirrored into the caller's tree in place
 * (opt-in tier); the root hash rides the state:hydrated event.
 */
function hydrate({ moduleName, stateFile, apply, tree }) {
    let raw;
    try {
        const { store, file } = getStore(stateFile);
        if (!store.has(file)) return { loaded: false, applied: false };
        raw = store.read(file);
    } catch (e) {
        if (e && (e.code === 'STORAGE_READ_DENIED' || e.code === 'E_STATE_PATH')) {
            throw new (require('./error').VantError)(moduleName + ' state unreadable: ' + e.message,
                { code: STATE_READ_CODE, retryable: false });
        }
        throw e;
    }
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        console.warn('[' + moduleName + '] State file corrupted, starting fresh:', e.message);
        return { loaded: true, applied: false };
    }
    if (!data || data.kind !== 'vant-protocol-state') {
        console.warn('[' + moduleName + '] State file lacks protocol-state marker, ignoring:', stateFile);
        return { loaded: true, applied: false };
    }
    try {
        apply(data);
        let rootHash = null;
        if (tree instanceof StateTree) {
            const mirrored = toTree(moduleName, data);
            for (const p of mirrored.paths()) {
                tree.put(p, mirrored.get(p).value);
            }
            rootHash = tree.rootHash();
        }
        _emit('state:hydrated', { moduleName, stateFile, rootHash, timestamp: Date.now() });
        return { loaded: true, applied: true, rootHash };
    } catch (e) {
        console.warn('[' + moduleName + '] State apply failed, starting fresh:', e.message);
        return { loaded: true, applied: false };
    }
}

/**
 * Write-through a state snapshot (atomic via the storage chain). Never throws.
 *
 * (pass 171) `opts.tree` (StateTree): when provided, the snapshot is ALSO
 * mirrored into the caller's tree in place and the tree's root hash rides
 * the state:saved event + the audit entry — cross-process "same state?"
 * becomes one string comparison on the shared spine.
 */
function persist({ moduleName, stateFile, data, tree }) {
    try {
        const { store, file } = getStore(stateFile);
        // (pass 37) kind marker: state/<file> must be RECOGNIZABLE as live
        // arch-A state, or lib/migrations' legacy-dropfile step would eat it
        // (its detector treats any non-.json.md file in <brain>/state/ as
        // legacy drop content — that bit us: migrate() relocated trust.json
        // and killed the idempotency pin). Read-denial is tolerated here:
        // marker-less files fall back to the legacy detector, never the
        // other way around.
        store.write(file, JSON.stringify({
            kind: 'vant-protocol-state',
            module: moduleName,
            ...data,
            savedAt: Date.now()
        }, null, 2));
        let rootHash = null;
        if (tree instanceof StateTree) {
            const mirrored = toTree(moduleName, { ...data });
            for (const p of mirrored.paths()) {
                tree.put(p, mirrored.get(p).value);
            }
            rootHash = tree.rootHash();
        }
        _emit('state:saved', { moduleName, stateFile, rootHash, timestamp: Date.now() });
        if (rootHash) anchorStateRoot(stateFile, rootHash, 'persist:' + moduleName);
        _audit('state:persist', { moduleName, stateFile, rootHash });
        return true;
    } catch (e) {
        console.error('[' + moduleName + '] Persist failed:', e.message);
        return false;
    }
}

/** Drop the state file for the current brain (sandbox-gated). Never throws. */
function clear(stateFile) {
    try {
        const { store, file } = getStore(stateFile);
        if (store.has(file)) store.delete(file);
        _emit('state:cleared', { stateFile, timestamp: Date.now() });
        _audit('state:clear', { stateFile });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Lockfile path for a state file — under the BRAIN's single lock root
 * (`models/private/<brain>/.locks/`, via lib/lock.pathFor). NOT under state/:
 * lib/migrations' dropfiles.tmp-space step sweeps any non-`.json.md` file in
 * `<brain>/state/` as legacy drop content, so a lock there would be
 * misclassified and relocated (that bug shipped and was fixed in pass 97).
 * `.locks/` is a brain-root dot-dir, invisible to both migrations and the
 * brain corpus.
 */
function lockPathFor(stateFile) {
    return lock.pathFor('state', stateFile);
}

/**
 * (pass 98) Cross-process safe persist: take the brain-root lock, re-read the
 * on-disk snapshot, let the caller merge unseen rows into its in-memory maps
 * (`merge(diskSnapshot)`), then write the union. Without this, two processes
 * that hydrated before either wrote clobbered each other (whole-snapshot
 * last-writer-wins — the agents/teams/habitat class). `merge` should adopt
 * only ids this process has never seen so local deletes stay tombstoned.
 * Never throws (mirrors persist()); FAILS CLOSED with a loud warn when the
 * lock is unavailable — the write is refused, not degraded (pass 103).
 *
 * @param {object} opts
 * @param {string} opts.moduleName
 * @param {string} opts.stateFile
 * @param {(snapshot:object)=>void} opts.merge
 * @param {()=>object} opts.serialize
 * @param {StateTree} [opts.tree] - (pass 173) opt-in tree tier: the merged
 *   snapshot mirrors into the caller's tree inside the lock, and the root
 *   hash rides the state:saved event + audit entry — same contract as
 *   persist(), so consumers get one wiring shape across both paths.
 */
async function persistMerged({ moduleName, stateFile, merge, serialize, tree }) {
    // (pass 103) FAIL CLOSED. Lock failure used to degrade to an unlocked
    // whole-snapshot write (last-writer-wins) — but that unlocked write is
    // exactly what clobbers a peer's rows. Refuse the write and say why;
    // `reason` distinguishes contention ('held') from a broken FS
    // ('unavailable'). acquire() has already waited waitOpts, so 'held'
    // means real, sustained contention.
    // (pass 109, F7) One implementation: withLock wraps acquire+release
    // (failMode 'closed' — the body NEVER runs without the lock) and the
    // exit hook still covers abrupt teardown.
    const out = await lock.withLock(lockPathFor(stateFile), () => {
        try {
            const { store, file } = getStore(stateFile);
            if (typeof merge === 'function' && store.has(file)) {
                try {
                    const disk = JSON.parse(store.read(file));
                    if (disk && disk.kind === 'vant-protocol-state') merge(disk);
                } catch (e) { /* merge is best-effort; the write below still proceeds */ }
            }
            const snapshot = {
                kind: 'vant-protocol-state',
                module: moduleName,
                ...serialize(),
                savedAt: Date.now()
            };
            store.write(file, JSON.stringify(snapshot, null, 2));
            let rootHash = null;
            if (tree instanceof StateTree) {
                const mirrored = toTree(moduleName, snapshot);
                for (const p of mirrored.paths()) {
                    tree.put(p, mirrored.get(p).value);
                }
                rootHash = tree.rootHash();
            }
            _emit('state:saved', { moduleName, stateFile, rootHash, timestamp: Date.now() });
            if (rootHash) anchorStateRoot(stateFile, rootHash, 'persistMerged:' + moduleName);
            _audit('state:persist', { moduleName, stateFile, rootHash });
            return true;
        } catch (e) {
            console.error('[' + moduleName + '] Persist failed:', e.message);
            return false;
        }
    }, { staleMs: 10000, waitMs: 8000 });
    if (out && out.aborted) {
        console.error('[' + moduleName + '] State lock ' + out.reason + ' — refusing unlocked write (fail-closed)');
        return false;
    }
    return out;
}

module.exports = {
    currentBrain,
    getStore,
    hydrate,
    persist,
    persistMerged,
    lockPathFor,
    clear,
    toTree,
    fromTree,
    treeFor,
    anchorStateRoot,
    verifyStateRoot,
    lastAnchorFor,
    StateTree,
    STATE_READ_CODE,
    BRAIN_SEGMENT_RE,
    STATE_FILE_RE
};
