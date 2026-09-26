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
        store: new Storage.FileStorage({ basePath: path.resolve(path.dirname(storePath)) }),
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
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = {
    currentBrain,
    getStore,
    hydrate,
    persist,
    clear,
    STATE_READ_CODE,
    BRAIN_SEGMENT_RE,
    STATE_FILE_RE
};
