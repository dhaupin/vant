'use strict';

/**
 * memstruct Adapter — vant brain <-> memstruct store (dhaupin/vant#354)
 * ====================================================================
 *
 * ADAPTER: memstruct record format (dhaupin/memstruct, format id
 * `memstruct@1`). Pure data conversion, no service and no transport, so it
 * lives beside `langchain.js` in lib/adapters/ and is registered as an
 * adapter in lib/connectors/index.js.
 *
 * The layer trap this resolves: git answers *where memory lives and merges*
 * (vant's markdown brain, `models/<side>/<brain>/`); memstruct answers
 * *what a memory is* (one envelope + one merge contract). The envelope
 * (`id`, `createdAt`, `updatedAt`, `deletedAt`) is memstruct's; every body
 * field is host-owned and carried through, never refused.
 *
 * Mapping (vant -> memstruct):
 *   the file path                       -> id      (opaque; `<side>/<brain>/<rel>`)
 *   the file's git history              -> createdAt / updatedAt (epoch ms)
 *   the brain side (private | public)   -> scope
 *   the markdown body                   -> body
 *   the file's kind (basename / dir)    -> kind
 *   (host policy)                       -> ttl (null)
 *   a delete                            -> deletedAt (a tombstone, not an erase)
 *
 * Design rules honored:
 *   - memstruct is a DEV dependency (the family validator). The store is
 *     produced with vant's own code, so `exportStore()` never requires it.
 *     `lint()` uses it opportunistically and degrades gracefully.
 *   - `importStore()` refuses any id that escapes the brain root (path
 *     traversal) and any id that does not name a markdown file.
 */

const fs = require('fs');
const path = require('path');

const atomicWriteFile = require('../primitives').atomicWriteFile;

/** Typed refusal (the lib/ no-raw-throw invariant; see lib/export-bundle.js). */
function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

const DEFAULT_SIDES = ['private', 'public'];
const EXCLUDE_DIRS = new Set(['memory', 'state', 'geometry']);

class MemstructAdapter {
    constructor(config = {}) {
        this.type = 'memstruct';
        // models root: the parent of the private/ and public/ brain roots.
        this.root = config.root || path.resolve(process.cwd(), 'models');
        this.sides = Array.isArray(config.sides) && config.sides.length ? config.sides : DEFAULT_SIDES;
        this.brain = config.brain || null; // restrict to one brain when set
        this.connected = false;
    }

    /** True when the id names a markdown file directly under a brain root. */
    _isMemoryFile(rel) {
        return rel.toLowerCase().endsWith('.md');
    }

    /**
     * Git timestamp (epoch ms) for a brain file. `first` picks the earliest
     * commit (createdAt); otherwise the latest (updatedAt). Falls back to the
     * filesystem clock when the tree is not a git checkout or the file is
     * uncommitted - the export must never fail on a fresh/unstaged brain.
     */
    _gitTime(absPath, { first = false } = {}) {
        // git runs from the PROJECT root (the checkout holding .git), with the
        // path expressed relative to it; `this.root` is models/, one level in.
        const gitRoot = path.resolve(this.root, '..');
        const rel = path.relative(gitRoot, absPath).split(path.sep).join('/');
        const args = first
            ? ['log', '--reverse', '--format=%ct', '--', rel]
            : ['log', '-1', '--format=%ct', '--', rel];
        try {
            const { execFileSync } = require('child_process');
            const out = execFileSync('git', args, {
                cwd: gitRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
            const line = first ? out.split('\n')[0] : out;
            const secs = parseInt(line, 10);
            if (Number.isFinite(secs) && secs > 0) return secs * 1000;
        } catch (e) { /* not git, or no history - fall through to fs */ }
        try {
            const st = fs.statSync(absPath);
            return Math.round((first ? st.birthtimeMs || st.ctimeMs : st.mtimeMs) || Date.now());
        } catch (e) {
            return Date.now();
        }
    }

    /** Enumerate the brain's markdown files as { id, absPath, scope, kind }. */
    _listFiles() {
        const found = [];
        for (const side of this.sides) {
            const sideRoot = path.join(this.root, side);
            const brains = this.brain
                ? [this.brain]
                : (fs.existsSync(sideRoot) ? fs.readdirSync(sideRoot, { withFileTypes: true })
                    .filter((d) => d.isDirectory()).map((d) => d.name) : []);
            for (const brain of brains) {
                const brainRoot = path.join(sideRoot, brain);
                if (!fs.existsSync(brainRoot)) continue;
                this._walk(brainRoot, (absPath, rel) => {
                    const segs = rel.split(path.sep);
                    if (segs.some((s) => EXCLUDE_DIRS.has(s))) return;
                    if (!this._isMemoryFile(rel)) return;
                    const id = [side, brain, ...segs].join('/');
                    const kind = segs.length > 1 ? segs[0] : path.basename(rel, path.extname(rel));
                    found.push({ id, absPath, scope: side, kind });
                });
            }
        }
        return found;
    }

    /** Depth-first walk of `dir`; `visit(absPath, relToRoot)` for each file,
     * where relToRoot is relative to the walk root (the brain directory). */
    _walk(dir, visit, prefix = '') {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const entry of entries) {
            const rel = prefix ? path.join(prefix, entry.name) : entry.name;
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) { this._walk(abs, visit, rel); }
            else if (entry.isFile()) { visit(abs, rel); }
        }
    }

    /**
     * Export the brain as a memstruct store: `{ memstruct: 1, records: [...] }`.
     * Deterministic - records are sorted by id so the store is diffable and
     * lint-stable across runs.
     */
    exportStore() {
        const records = this._listFiles().map((f) => {
            let body = '';
            try { body = fs.readFileSync(f.absPath, 'utf8'); } catch (e) { body = ''; }
            const record = {
                id: f.id,
                createdAt: this._gitTime(f.absPath, { first: true }),
                updatedAt: this._gitTime(f.absPath, { first: false }),
                deletedAt: null,
                kind: f.kind,
                scope: f.scope,
                body,
                ttl: null
            };
            return record;
        }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return { memstruct: 1, records };
    }

    /** Write the visible records of a memstruct store back into the brain.
     * A record with `deletedAt` set is a tombstone and is left in place (a
     * delete is not an erase); only non-deleted records are written. Any id
     * that escapes the brain root or does not name a markdown file is refused
     * with a typed error - a store from a foreign system never writes outside
     * `models/`. */
    importStore(doc) {
        if (!doc || doc.memstruct !== 1 || !Array.isArray(doc.records)) {
            throw _vantErr('memstruct.importStore: not a memstruct@1 store (need { memstruct: 1, records: [...] })', 'E_MEMSTRUCT_STORE');
        }
        const rootReal = path.resolve(this.root);
        let written = 0, skipped = 0;
        for (const r of doc.records) {
            if (!r || typeof r.id !== 'string' || !r.id) { skipped++; continue; }
            if (r.deletedAt !== null && r.deletedAt !== undefined) { skipped++; continue; }
            if (!this._isMemoryFile(r.id)) { skipped++; continue; }
            const target = path.resolve(rootReal, r.id);
            if (target !== rootReal && !target.startsWith(rootReal + path.sep)) {
                throw _vantErr('memstruct.importStore: record id escapes the brain root: ' + JSON.stringify(r.id), 'E_MEMSTRUCT_TRAVERSAL');
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            atomicWriteFile(target, typeof r.body === 'string' ? r.body : '', 'utf8');
            written++;
        }
        return { written, skipped, total: doc.records.length };
    }

    /**
     * Validate a store against the memstruct record format. Uses the memstruct
     * dev dependency when present (the family validator, one source of truth)
     * and degrades to a structural check when it is not installed, so the
     * adapter never hard-depends on a dev-only package at runtime.
     */
    lint(store) {
        const doc = store || this.exportStore();
        try {
            const memstruct = require('memstruct');
            const { records, violations } = memstruct.lintStore(doc);
            return { ok: violations.length === 0, records, violations };
        } catch (e) {
            return this._structuralLint(doc);
        }
    }

    /** Dependency-free fallback: the envelope facts memstruct owns. */
    _structuralLint(doc) {
        const violations = [];
        if (!doc || doc.memstruct !== 1) violations.push({ norm: 'store-version', message: 'store.memstruct must be 1' });
        if (!Array.isArray(doc && doc.records)) violations.push({ norm: 'store-records', message: 'store.records must be an array' });
        const seen = new Set();
        const records = Array.isArray(doc && doc.records) ? doc.records : [];
        records.forEach((r, i) => {
            if (!r || typeof r.id !== 'string' || !r.id) violations.push({ norm: 'record-id', message: `records[${i}].id must be a non-empty string` });
            else if (seen.has(r.id)) violations.push({ norm: 'record-id-duplicate', message: `duplicate record id ${JSON.stringify(r.id)}` });
            else seen.add(r.id);
            if (!Number.isInteger(r && r.createdAt)) violations.push({ norm: 'record-created-at', message: `records[${i}].createdAt must be an integer (epoch ms)` });
            for (const k of ['updatedAt', 'deletedAt', 'ttl']) {
                const v = r && r[k];
                if (v !== undefined && v !== null && !Number.isInteger(v)) violations.push({ norm: 'record-' + k, message: `records[${i}].${k} must be an integer or null` });
            }
        });
        return { ok: violations.length === 0, records: records.length, violations };
    }
}

module.exports = { MemstructAdapter };
