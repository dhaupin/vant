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
 * Hydrate state for a module. `apply(data)` runs only when a parseable
 * file exists. Throws E_STATE_READ on read denial; warns + fresh on
 * corruption. Returns { loaded, applied }.
 *
 * (pass 37) Hydration verifies the kind marker: a file missing it is
 * not ours (legacy dropfile relocated here, hand-planted junk) and is
 * ignored — treated like corruption (warn + fresh), never applied.
 */
function hydrate({ moduleName, stateFile, apply }) {
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
        _emit('state:hydrated', { moduleName, stateFile, timestamp: Date.now() });
        return { loaded: true, applied: true };
    } catch (e) {
        console.warn('[' + moduleName + '] State apply failed, starting fresh:', e.message);
        return { loaded: true, applied: false };
    }
}

/** Write-through a state snapshot (atomic via the storage chain). Never throws. */
function persist({ moduleName, stateFile, data }) {
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
        _emit('state:saved', { moduleName, stateFile, timestamp: Date.now() });
        _audit('state:persist', { moduleName, stateFile });
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
 */
async function persistMerged({ moduleName, stateFile, merge, serialize }) {
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
            store.write(file, JSON.stringify({
                kind: 'vant-protocol-state',
                module: moduleName,
                ...serialize(),
                savedAt: Date.now()
            }, null, 2));
            _emit('state:saved', { moduleName, stateFile, timestamp: Date.now() });
            _audit('state:persist', { moduleName, stateFile });
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
    STATE_READ_CODE,
    BRAIN_SEGMENT_RE,
    STATE_FILE_RE
};
