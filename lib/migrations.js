/**
 * Vant Brain Layout Migrations (v0.9.0-axolotl)
 *
 * The axolotl refactor changed brain layout several times without a formal
 * upgrade path: multibrain directories, brain-scoped orgchart stores,
 * tmp-space anchoring, dropfile relocation. Brains created under older
 * layouts silently lose data or scatter artifacts (the reincarnation drill
 * found pre-session axolotl stubs; TASKS.md documents .agent_tmp and
 * ./storage stragglers).
 *
 * This registry versions the LAYOUT (distinct from package version):
 *
 *   v1  legacy      — flat models/private brain, .agent_tmp stores,
 *                     ./storage tmp-space, dropfiles inside the brain dir
 *   v2  axolotl     — current: multibrain dirs (models/private/<brain>),
 *                     brain-scoped orgchart/, models/tmp-space/<space>,
 *                     models/private/sudo/escalations.jsonl
 *
 * A marker file records the detected layout version per store root:
 *   models/private/.layout-version   → { version: 2, migratedAt, applied: [...] }
 *
 * Design rules (prd-storage.md migration-tool checklist):
 *   - Detection is content-based (filesystem evidence), never trust the
 *     marker alone; marker is written AFTER successful migration.
 *   - Every step is idempotent: apply() on an already-migrated layout
 *     must be a no-op.
 *   - dryRun:true reports what WOULD move without touching disk.
 *   - All file operations route through FileStorage (security chain).
 *
 * Usage:
 *   const migrations = require('./lib/migrations');
 *   migrations.status()                    // current version, pending steps
 *   await migrations.migrate({ dryRun: true })
 *   await migrations.migrate()             // apply pending steps in order
 */

const fs = require('fs');
const path = require('path');

const errors = require('./error');

const REPO_ROOT = path.resolve(__dirname, '..');
const MARKER_REL = path.join('models', 'private', '.layout-version.json');
const LAYOUT_VERSION = 3; // current target: v3 = v2 + pre-multibrain (main-style) import

// ---------- helpers (all disk I/O through FileStorage) ----------

function _store(basePath) {
    const Storage = require('./storage');
    return new Storage.FileStorage({ basePath });
}

function _relStore() {
    return _store(REPO_ROOT);
}

function _readMarker() {
    try {
        const raw = _relStore().read(MARKER_REL);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Number.isFinite(parsed.version) ? parsed : null;
    } catch (e) {
        return null; // unreadable marker = treat as unknown; detection decides
    }
}

function _writeMarker(applied) {
    _relStore().write(MARKER_REL, JSON.stringify({
        version: LAYOUT_VERSION,
        migratedAt: new Date().toISOString(),
        applied
    }, null, 2) + '\n');
}

// ---------- detection primitives (content-based evidence) ----------

function _dirExists(rel) {
    try { return fs.statSync(path.join(REPO_ROOT, rel)).isDirectory(); } catch (e) { return false; }
}
function _fileExists(rel) {
    try { return fs.statSync(path.join(REPO_ROOT, rel)).isFile(); } catch (e) { return false; }
}
function _listDir(rel) {
    try { return fs.readdirSync(path.join(REPO_ROOT, rel)); } catch (e) { return []; }
}
function _listBrains() {
    // Private brains = subdirectories of models/private (multibrain layout)
    return _listDir('models/private').filter(f => {
        if (f.startsWith('.')) return false;
        try { return fs.statSync(path.join(REPO_ROOT, 'models', 'private', f)).isDirectory(); } catch (e) { return false; }
    });
}

// ---------- layout v3 helpers: pre-multibrain (single public brain) import ----------

/**
 * Validate a brain name for the import step (segments only; the migration
 * must never be the vector that smuggles a traversal into models/).
 */
function _validBrainName(name) {
    return typeof name === 'string' &&
        /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name) &&
        !name.includes('..') && name !== '.';
}

/**
 * Recursively list FILES under a models/ subdir, paths relative to models/.
 * Directories are descended, not returned. Returns [] for missing paths.
 */
function _walkModels(rel, acc = []) {
    const abs = path.join(REPO_ROOT, 'models', rel);
    let st;
    // lstat (not stat): never follow symlinks out of models/ — the import
    // copies CONTENT (safe) but deletes through store paths (a symlinked
    // dir would strand deletions outside the plan). Skip, don't follow.
    try { st = fs.lstatSync(abs); } catch (e) { return acc; }
    if (st.isSymbolicLink()) return acc;
    if (st.isFile()) { acc.push(rel); return acc; }
    if (!st.isDirectory()) return acc;
    for (const entry of _listDir(path.join('models', rel))) {
        _walkModels(path.join(rel, entry), acc);
    }
    return acc;
}

// Never imported into the brain dir (runtime/infrastructure, not brain content)
const _IMPORT_SKIP_ROOT = new Set(['.layout-version.json', 'state.json', 'sudo', 'tmp-space']);

// ---------- migration steps (ordered; each idempotent) ----------

const STEPS = [
    {
        version: 2,
        id: 'orgchart.brain-scope',
        description: 'Move .agent_tmp orgchart stores (escrow/teams/agents) into models/private/<brain>/orgchart/',
        detect() {
            // Evidence: .agent_tmp store files exist
            const found = ['.agent_tmp/escrow.json', '.agent_tmp/teams.json', '.agent_tmp/agents.json']
                .filter(rel => _fileExists(rel));
            return { pending: found.length > 0, evidence: found };
        },
        plan() {
            const brain = _defaultBrainDir();
            return ['.agent_tmp/escrow.json', '.agent_tmp/teams.json', '.agent_tmp/agents.json']
                .filter(rel => _fileExists(rel))
                .map(rel => ({ from: rel, to: path.join(brain, 'orgchart', path.basename(rel)) }));
        },
        apply() {
            const store = _relStore();
            const moves = this.plan();
            for (const mv of moves) {
                const content = store.read(mv.from);
                if (content === null) continue;
                store.write(mv.to, content);
                store.delete(mv.from);
            }
            return { moved: moves.length };
        }
    },
    {
        version: 2,
        id: 'tmpspace.models-anchor',
        description: 'Move legacy ./storage tmp-space dirs into models/tmp-space/',
        detect() {
            // Evidence: legacy ./storage dir with content, no overlapping
            // content already in models/tmp-space
            const found = [];
            if (_dirExists('storage')) {
                for (const space of ['myStuff', 'yourStuff', 'workspace', 'tmp']) {
                    const from = path.join('storage', space);
                    if (_dirExists(from) && _listDir(from).length > 0) {
                        const to = path.join('models', 'tmp-space', space);
                        if (!_dirExists(to) || _listDir(to).length === 0) {
                            found.push({ from, to });
                        }
                    }
                }
            }
            return { pending: found.length > 0, evidence: found.map(f => f.from) };
        },
        plan() {
            return this.detect().evidence.map(from => ({
                from,
                to: path.join('models', 'tmp-space', path.basename(from))
            }));
        },
        apply() {
            const store = _relStore();
            const moves = this.plan();
            for (const mv of moves) {
                for (const f of _listDir(mv.from)) {
                    const fromRel = path.join(mv.from, f);
                    const content = store.read(fromRel);
                    if (content === null) continue;
                    store.write(path.join(mv.to, f), content);
                    store.delete(fromRel);
                }
                try { fs.rmdirSync(path.join(REPO_ROOT, mv.from)); } catch (e) { /* non-empty: leave */ }
            }
            return { moved: moves.length };
        }
    },
    {
        version: 2,
        id: 'dropfiles.tmp-space',
        description: 'Relocate dropfiles (myStuff) from models/private/<brain>/state/ into models/tmp-space/myStuff/',
        detect() {
            const found = [];
            for (const brain of _listBrains()) {
                const from = path.join('models', 'private', brain, 'state');
                if (!_dirExists(from)) continue;
                // CAUTION: <key>.json.md is the LIVE StateStorage layout
                // (brain tests/boots re-create those constantly) — those are
                // NOT legacy dropfiles and must stay. Only arbitrary-named
                // files (e.g. notes.md) are legacy drop content.
                const legacy = _listDir(from).filter(f => !f.endsWith('.json.md'));
                if (legacy.length > 0) found.push(from);
            }
            return { pending: found.length > 0, evidence: found };
        },
        plan() {
            const moves = [];
            for (const from of this.detect().evidence) {
                for (const f of _listDir(from)) {
                    if (f.endsWith('.json.md')) continue; // live state files stay
                    moves.push({ from: path.join(from, f), to: path.join('models', 'tmp-space', 'myStuff', f) });
                }
            }
            return moves;
        },
        apply() {
            const store = _relStore();
            let moved = 0;
            for (const mv of this.plan()) {
                if (store.has(mv.to)) continue; // existing dropfile wins
                const content = store.read(mv.from);
                if (content === null) continue;
                store.write(mv.to, content);
                store.delete(mv.from);
                moved++;
            }
            // Drain the legacy dir if only (removed) dropfiles lived there;
            // never rmdir when live state files remain.
            for (const from of this.detect().evidence) {
                const remaining = _listDir(from).filter(f => !f.endsWith('.json.md'));
                if (remaining.length === 0) {
                    const stillThere = _listDir(from);
                    if (stillThere.length === 0) {
                        try { fs.rmdirSync(path.join(REPO_ROOT, from)); } catch (e) { /* non-empty */ }
                    }
                }
            }
            return { moved };
        }
    },
    {
        version: 3,
        id: 'legacy.multibrain-import',
        description: 'Import pre-multibrain (single public brain) layout into models/{public,private}/<name>/ and synthesize the brain stack (merge-safety: old-style user brains stay readable)',
        /**
         * Detect a main-style tree — ALL of:
         *   1. no brain subdirs under models/private (multibrain not adopted)
         *   2. flat brain content at models/public root (>=3 .md) or models/private root (>=1 .md)
         *   3. state.json with no `stack` key
         * Conservative by design: axolotl trees with one stray flat file never trigger.
         */
        detect() {
            const evidence = [];
            // NOTE: we deliberately do NOT use private brain dirs as evidence
            // either way. Legacy trees have category subdirs (state/, canvas/)
            // whose .md files look like "brain content", and multibrain trees
            // can have runtime-created dirs (orgchart/) with none. The stack
            // in state.json is the discriminator, checked below.

            const flatPublic = _listDir('models/public') || [];
            const flatPrivate = _listDir('models/private') || [];
            const publicMd = flatPublic.filter(f => f.endsWith('.md')).length;
            const privateMd = flatPrivate.filter(f => f.endsWith('.md')).length;
            if (publicMd < 3 && privateMd < 1) return { pending: false, evidence: [] };
            evidence.push(`models/public: ${publicMd} flat .md`);

            let stack = null;
            try {
                stack = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'models', 'state.json'), 'utf8')).stack;
            } catch (e) { /* missing/unreadable state counts as legacy */ }
            // A stack of just the default brain is NOT user intent: brain boot
            // auto-persists ['vant'] onto legacy trees when health/first-load
            // runs before migration (observed in the main-tree QC drill).
            // Flat public content + default/missing stack = still legacy.
            const stackIsDefault = Array.isArray(stack) && stack.length === 1 && stack[0] === 'vant';
            if (Array.isArray(stack) && !stackIsDefault) return { pending: false, evidence: [] };
            evidence.push(stackIsDefault ? 'state.json: default-only stack (auto-persisted)' : 'state.json: no stack key');

            return { pending: true, evidence };
        },
        /**
         * Plan: every flat public/private entry moves under models/<root>/<name>/.
         * opts.brainName (via migrate({brainName})) names the brain; default 'vant'
         * (axolotl's default brain, so zero-config users land where the loader looks).
         */
        plan(opts = {}) {
            const brainName = _validBrainName(opts.brainName) ? opts.brainName : 'vant';
            const moves = [];
            for (const root of ['public', 'private']) {
                for (const entry of (_listDir('models/' + root) || [])) {
                    if (_IMPORT_SKIP_ROOT.has(entry)) continue;
                    // The destination brain dir itself is never a source: on a
                    // legacy tree it may pre-exist (brain boot artifacts), and
                    // planning it as a source makes the dir-pass re-import its
                    // own output into <name>/<name>/ — deleting files via the
                    // self-write + delete sequence. Case-insensitive compare:
                    // a flat 'Vant/' entry is the same dir as brain 'vant/' on
                    // macOS/Windows filesystems.
                    if (entry.toLowerCase() === brainName.toLowerCase()) continue;
                    moves.push({ from: path.join('models', root, entry), to: path.join('models', root, brainName, entry) });
                }
            }
            return moves;
        },
        apply(opts = {}) {
            const d = this.detect();
            if (!d.pending) return { imported: 0, reason: 'not pending' };

            const brainName = _validBrainName(opts.brainName) ? opts.brainName : 'vant';
            const store = _relStore();
            // ONE plan for both passes: plan() re-lists the root, and the
            // file pass CREATES <name>/ — a second plan() would see the
            // destination dir as a new top-level entry and recurse it into
            // <name>/<name>/ (mid-migration detection drift).
            const moves = this.plan(opts);
            let imported = 0;
            let skippedExisting = 0;
            for (const mv of moves) {
                // Directories move as nested trees below; the per-entry loop
                // handles FILES only (store.read throws EISDIR on dirs).
                // lstat: a symlinked FILE is never source content — the
                // storage chain refuses it anyway ("Symlink attack"), and one
                // weird entry must not abort the whole import.
                try {
                    const st = fs.lstatSync(path.join(REPO_ROOT, mv.from));
                    if (st.isDirectory() || st.isSymbolicLink()) continue;
                } catch (e) { continue; }
                // Existing-wins (matches the dropfiles step's guard): a
                // pre-existing multibrain tree with stray flat files must
                // never have its live brain content silently clobbered.
                if (store.has(mv.to)) { skippedExisting++; continue; }
                const content = store.read(mv.from);
                if (content === null) continue; // vanished mid-run; skip, don't crash
                store.write(mv.to, content);   // FileStorage: security chain + atomic
                store.delete(mv.from);
                imported++;
            }
            // Recurse into flat subdirs (boot/, agents/, ...) the same way.
            // Two-pass: process dirs deepest-first-ish by handling only the
            // TOP-level plan entries here; _walkModels returns files relative
            // to models/, so strip the models/<root>/ prefix to get the path
            // INSIDE the brain dir. Guard mv.to not being inside mv.from.
            for (const mv of moves) {
                const abs = path.join(REPO_ROOT, mv.from);
                let st; try { st = fs.statSync(abs); } catch (e) { continue; }
                if (!st.isDirectory()) continue;
                const rootSeg = mv.from.replace(/\\/g, '/').split('/')[1]; // models/<root>/...
                for (const rel of _walkModels(path.join(rootSeg, path.basename(mv.from)))) {
                    const tail = rel.replace(/\\/g, '/').split('/').slice(2).join(path.sep); // drop <root>/<dirname>
                    if (!tail) continue;
                    const toRel = path.join(mv.to, tail);
                    if (store.has(toRel)) { skippedExisting++; continue; } // existing-wins
                    const content = store.read(path.join('models', rel));
                    if (content === null) continue;
                    // Belt-and-braces: a single refused file (weird symlink
                    // the walk missed, permission edge) is skipped — the
                    // migration continues, verify still judges the overall
                    // result. If the delete after a successful write fails,
                    // the file still counts as imported (content landed); a
                    // retry sees existing-wins and skips it.
                    try {
                        store.write(toRel, content);
                    } catch (e) { continue; }
                    try { store.delete(path.join('models', rel)); } catch (e) { /* dest has it */ }
                    imported++;
                }
                // All FILES were walked out; remove the leftover EMPTY dir
                // tree bottom-up (nested empty subdirs would make plain
                // rmdirSync fail with ENOTEMPTY). Guard: refuse if any file
                // unexpectedly remains.
                const leftovers = _walkModels(path.join(mv.from.replace(/\\/g, '/').split('/').slice(1).join('/')));
                if (leftovers.length === 0) {
                    try { fs.rmSync(abs, { recursive: true, force: true }); } catch (e) { /* leave */ }
                } else {
                    try { fs.rmdirSync(abs); } catch (e) { /* non-empty: leave */ }
                }
            }

            // Synthesize the stack: preserve neurons, add multibrain fields
            const stateRel = path.join('models', 'state.json');
            let state = {};
            try { state = JSON.parse(store.read(stateRel) || '{}'); } catch (e) { state = {}; }
            // Rewrite a MISSING stack AND a default-only one: ['vant'] is the
            // auto-persisted default (the same evidence detect() treats as
            // still-legacy), not user intent — leaving it would strand a
            // --brain-name import behind a stack pointing at a brain that
            // was never created.
            const stackIsDefault = Array.isArray(state.stack) &&
                state.stack.length === 1 && state.stack[0] === 'vant';
            if (!Array.isArray(state.stack) || state.stack.length === 0 || stackIsDefault) {
                state.stack = [brainName];
            }
            if (!state.currentBrain) state.currentBrain = brainName;
            if (!state.mode) state.mode = 'dual';
            store.write(stateRel, JSON.stringify(state, null, 2) + '\n');

            // Post-verify: the brain must be readable through the real loader,
            // else this migration reports failure instead of false success.
            // If brain.js was already loaded earlier in this process (e.g. via
            // migrations' own require chain), its stack/roots/corpus caches
            // still point at PRE-move paths — resync stack + invalidate, then
            // read. A fresh process needs no resync (root IIFE reads state.json).
            let verified = false;
            try {
                const brain = require('./brain');
                brain.setMode('dual');
                // brain.js may have been loaded EARLIER in this process (its
                // module body is pulled in by storage's circular require chain
                // the first time _relStore() constructs a FileStorage — i.e.
                // BEFORE we synthesized the stack). Its in-memory _brainStack
                // is then stale ('vant' default). Resync stack from disk state
                // first, then switchBrain — else the stale default gets
                // appended and persisted over the chosen brain name.
                if (typeof brain.loadStack === 'function') {
                    brain.loadStack([brainName]);
                }
                if (typeof brain.switchBrain === 'function') {
                    brain.switchBrain(brainName, 'public');
                }
                brain.invalidateCorpusCache();
                const corpus = brain.loadCorpus({ sync: true });
                verified = corpus.length > 0;
            } catch (e) { verified = false; }

            return { imported, skippedExisting, brain: brainName, stack: state.stack, verified };
        }
    },
    {
        version: 2,
        id: 'marker.write',
        description: 'Write models/private/.layout-version.json marker (layout v' + LAYOUT_VERSION + ')',
        detect() {
            const marker = _readMarker();
            return { pending: !marker || marker.version < LAYOUT_VERSION, evidence: [MARKER_REL] };
        },
        plan() { return [{ from: null, to: MARKER_REL }]; },
        apply() {
            // Note: applied-step list is filled by run() below
            return { wrote: true };
        }
    }
];

function _defaultBrainDir() {
    // Default brain for store relocation: current brain from state, else first
    try {
        const state = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'models', 'state.json'), 'utf8'));
        if (state.currentBrain && _dirExists(path.join('models', 'private', state.currentBrain))) {
            return path.join('models', 'private', state.currentBrain);
        }
    } catch (e) { /* fall through */ }
    const brains = _listBrains();
    if (brains.length > 0) return path.join('models', 'private', brains[0]);
    return path.join('models', 'private', 'vant');
}

// ---------- public API ----------

function currentVersion() {
    const marker = _readMarker();
    return marker ? marker.version : 0;
}

function status() {
    const marker = _readMarker();
    const pending = [];
    for (const step of STEPS) {
        const d = step.detect();
        if (d.pending) pending.push({ id: step.id, description: step.description, evidence: d.evidence });
    }
    return {
        markerVersion: marker ? marker.version : null,
        targetVersion: LAYOUT_VERSION,
        upToDate: pending.length === 0,
        pending
    };
}

/**
 * Run pending migrations.
 * @param {object} opts - { dryRun: boolean }
 * @returns {object} { ok, dryRun, applied: [{id, result|plan}], skipped }
 */
async function migrate(opts = {}) {
    const dryRun = opts.dryRun === true;
    const applied = [];
    const skipped = [];
    let markerWritten = false;
    let failedVerify = false;

    for (const step of STEPS) {
        const d = step.detect();
        if (!d.pending) { skipped.push({ id: step.id, reason: 'not pending' }); continue; }

        if (dryRun) {
            applied.push({ id: step.id, dryRun: true, plan: step.plan(opts) });
            continue;
        }

        let result;
        if (step.id === 'marker.write') {
            // marker last, carrying the ids actually applied this run
            _writeMarker(applied.map(a => a.id));
            markerWritten = true;
            result = { wrote: true };
        } else {
            result = step.apply(opts);
        }
        // A verify-bearing step that reports verified:false is a FAILED
        // migration, not a successful one: withhold the marker so the next
        // start re-runs detection/apply, and let migrate() report failure so
        // callers (start banner, exit codes) treat it as one. Without this,
        // one bad run writes the v3 marker and every retry is a silent no-op
        // with the brain still invisible.
        if (result && result.verified === false) {
            applied.push({ id: step.id, result });
            failedVerify = true;
            break;
        }
        applied.push({ id: step.id, result });
    }

    // Dry-run left nothing written; report what a real run would record
    if (dryRun && applied.length > 0) {
        return { ok: true, dryRun: true, applied, skipped, markerWritten: false };
    }

    // If everything was already applied but the marker is missing (crashed
    // mid-migration previously), write it now so status() settles.
    if (!dryRun && !markerWritten && applied.length === 0) {
        const marker = _readMarker();
        if (!marker) {
            _writeMarker(['(no-op)']);
        }
    }

    return { ok: !failedVerify, dryRun: false, applied, skipped, failedVerify };
}

module.exports = {
    currentVersion,
    status,
    migrate,
    LAYOUT_VERSION,
    // exposed for tests
    _readMarker,
    STEPS
};
