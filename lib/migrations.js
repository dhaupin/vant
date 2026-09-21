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
const LAYOUT_VERSION = 2; // current target

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
                if (_dirExists(from) && _listDir(from).length > 0) found.push(from);
            }
            return { pending: found.length > 0, evidence: found };
        },
        plan() {
            return this.detect().evidence.map(from => ({ from, to: 'models/tmp-space/myStuff' }));
        },
        apply() {
            const store = _relStore();
            const moves = this.plan();
            let moved = 0;
            for (const mv of moves) {
                for (const f of _listDir(mv.from)) {
                    const fromRel = path.join(mv.from, f);
                    const toRel = path.join(mv.to, f);
                    if (store.has(toRel)) continue; // existing dropfile wins
                    const content = store.read(fromRel);
                    if (content === null) continue;
                    store.write(toRel, content);
                    store.delete(fromRel);
                    moved++;
                }
                try { fs.rmdirSync(path.join(REPO_ROOT, mv.from)); } catch (e) { /* non-empty */ }
            }
            return { moved };
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

    for (const step of STEPS) {
        const d = step.detect();
        if (!d.pending) { skipped.push({ id: step.id, reason: 'not pending' }); continue; }

        if (dryRun) {
            applied.push({ id: step.id, dryRun: true, plan: step.plan() });
            continue;
        }

        let result;
        if (step.id === 'marker.write') {
            // marker last, carrying the ids actually applied this run
            _writeMarker(applied.map(a => a.id));
            markerWritten = true;
            result = { wrote: true };
        } else {
            result = step.apply();
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

    return { ok: true, dryRun: false, applied, skipped };
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
