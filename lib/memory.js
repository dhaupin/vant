const errors = require('./error');
/**
 * Memory - Unified Memory System for Vant OS
 *
 * Single interface for all memory types:
 * - Semantic: Vector embeddings, semantic search
 * - Document: Markdown files, human-readable (.md)
 * - State: Key-value cache with TTL
 * - Geometric: Barcode addressing via quasicrystal
 *
 * Uses brain (OS) for persistence - all security pipeline included.
 *
 * Usage:
 *   const { Memory } = require('./memory');
 *   const memory = new Memory();
 *
 *   // Semantic
 *   await memory.remember('pattern', { type: 'success', context: {...} });
 *   const results = await memory.find('pattern');
 *
 *   // Document (learn)
 *   await memory.learn('lessons/js', 'JavaScript is awesome', { ttl: 86400 });
 *
 *   // State
 *   await memory.state('session-id', 'abc123', { ttl: 3600 });
 *   const value = await memory.recall('session-id');
 *
 *   // Geometric
 *   const barcode = await memory.address('data to store');
 *   const data = await memory.locate(barcode);
 */

const embed = require('./embed');
const brain = require('./brain');
const geometry = require('./geometry');

// Lazy-load OS components
let _event = null;
let _audit = null;
let _sandbox = null;

function _getEvent() {
    if (!_event) try { _event = require('./event'); } catch (e) {}
    return _event;
}

function _getAudit() {
    if (!_audit) try { _audit = require('./audit'); } catch (e) {}
    return _audit;
}

function _getSandbox() {
    if (!_sandbox) try { _sandbox = require('./sandbox'); } catch (e) {}
    return _sandbox;
}

// Security check helpers delegate to the shared gate (lib/gate.js):
// safe-by-default semantics in one place - allow under the untouched default
// sandbox stub (with warning), enforce once explicitly configured.
// RLS checks remain local.
const gate = require('./gate');

// (pass 90) Dropped the fire-and-forget rls.checkWrite({}, ...) calls: an
// async promise fired with an EMPTY context and never awaited — the denial
// (default policy denies anonymous writes) could only surface as an
// orphaned unhandledRejection AFTER the write already happened. Memory's
// real enforcement layers are gate.requireCapability (above, safe-by-
// default) and per-workspace namespacing (pass 85). Explicit-subject RLS
// for state/recall can ride opts.userCtx -> _resolveWorkspace in a later
// pass; anonymous internal actuator ops stay gate-gated, not RLS-gated.
function _checkWrite(_resource) {
    gate.requireCapability('canWrite', { scope: 'memory', operation: 'write' });
}

function _checkRead(_resource) {
    gate.requireCapability('canRead', { scope: 'memory', operation: 'read' });
}

// Constants
const MEMORY_CATEGORY = 'memory';
const STATE_CATEGORY = 'state';
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ==================== WORKSPACE NAMESPACING (pass 85) ====================
// Per-workspace memory namespacing (#5 in the tenancy arc): state/recall
// keys live in per-workspace namespaces whenever an RLS subject is in
// play.
//
// Composite key shape: ws<wsLen>.<ws>.<key>  (e.g. ws4.acme.proj)
// WHY this shape: state keys become FILENAMES, and lib/storage.js
// sanitizes them to [A-Za-z0-9._-] and truncates at 100 chars. Colons do
// NOT survive (a naive ws:<ws>:<key> collapses to wsacmeproj on disk),
// and bare concatenation is collidable (ws 'ab' + key 'cx' vs ws 'abc' +
// key 'x'). The length prefix + dot separators + letter-start workspace
// names make the namespace parse unambiguously under that exact
// sanitizer, so two valid (workspace, key) pairs can never land on the
// same file. A 100-char composite guard fails closed instead of letting
// storage truncation silently merge long tenant keys.
//
// Subject resolution mirrors islands._resolveRlsContext exactly:
//   explicit opts.workspace / opts.userCtx -> current agent's habitat
//   identity -> anonymous (null = flat, pre-85 keys).
//
// Namespaces are ISOLATING, not additive: a resolved workspace reads ONLY
// its own rows - no flat fallback - and anonymous callers never see
// scoped rows. Flat keys keep working unchanged for every anonymous
// caller (tests, scripts, boot).
//
// Pinned-unscoped callers (workspace: null): habitat's _habitat state,
// nature's _flywheel, context history - process-global state that must
// not fragment per workspace.
const WORKSPACE_KEY_RE = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const STORAGE_KEY_BUDGET = 100;  // lib/storage.js truncates keys at 100

// Workspace names become PART of a filename (state/<storeKey>.json.md),
// so they are held to the storage sanitizer's charset plus a letter start
// (which the length prefix needs to parse unambiguously). Fail closed
// with a clear validation error instead of letting VAF guess.
function _validateWorkspaceName(ws, origin) {
    if (typeof ws !== 'string' || !WORKSPACE_KEY_RE.test(ws)) {
        throw new errors.VantError(
            'Invalid workspace name for memory namespacing (' + origin + '): ' + JSON.stringify(ws) +
            ' (expected [A-Za-z][A-Za-z0-9._-]{0,63})',
            { code: errors.CODES.VAF_INPUT_INVALID, retryable: false }
        );
    }
    return ws;
}

/**
 * Unified Memory System
 */
class Memory {
    constructor(options = {}) {
        // Multi-brain support: specify brain or use current from stack
        this._brainName = options.brain || null;  // null = use current brain

        // Semantic storage
        this.patterns = new Map();
        this.experiences = [];

        // State cache (key-value with TTL)
        this._cache = new Map();

        // Config
        this.maxExperiences = 1000;
        this.maxDataSize = 1000000; // 1MB

        // Load on init
        this._load();
    }

    // ==================== PRIVATE ====================

    /**
     * Get brain name for path calculations
     */
    _getBrainName() {
        if (this._brainName) {
            return this._brainName;
        }
        const b = require('./brain');
        return b.currentBrain() || 'default';
    }

    /**
     * Load semantic memories from brain
     */
    async _load() {
        try {
            const data = await brain.load(MEMORY_CATEGORY);
            if (data && data.experiences) {
                this.experiences = data.experiences;
                this.patterns = new Map();
                for (const exp of this.experiences) {
                    if (!this.patterns.has(exp.type)) {
                        this.patterns.set(exp.type, []);
                    }
                    this.patterns.get(exp.type).push(exp);
                }
            }
        } catch (e) {
            this.experiences = [];
            this.patterns = new Map();
        }
    }

    /**
     * Save semantic memories to brain
     */
    async _save() {
        // Use specified brain or current from stack
        const targetBrain = this._brainName || brain.currentBrain() || 'default';
        const useSpecificBrain = this._brainName && this._brainName !== (brain.currentBrain() || 'default');

        const data = JSON.stringify({
            experiences: this.experiences,
            savedAt: Date.now()
        }, null, 2);

        try {
            if (useSpecificBrain) {
                await brain.write(MEMORY_CATEGORY, 'experiences', data, { brain: targetBrain });
            } else {
                await brain.write(MEMORY_CATEGORY, 'experiences', data);
            }
        } catch (e) {
            // Fail silently
        }
    }

    /**
     * Sanitize data - prevent prototype pollution
     */
    sanitizeData(data) {
        if (data === null || data === undefined) return {};
        if (typeof data === 'string') return data;
        if (typeof data !== 'object') return String(data);
        const sanitized = {};
        for (const [key, val] of Object.entries(data)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            sanitized[key] = val;
        }
        return sanitized;
    }

    /**
     * Normalize TTL value
     */
    _normalizeTTL(ttl, expiresAt) {
        if (expiresAt) {
            return new Date(expiresAt).getTime() - Date.now();
        }
        return ttl || DEFAULT_TTL;
    }

    /**
     * Check if entry is expired
     */
    _isExpired(entry) {
        if (!entry.expiresAt) return false;
        return Date.now() > entry.expiresAt;
    }

    /**
     * (pass 85) Resolve the workspace namespace for a state/recall call.
     * Chain (mirrors islands._resolveRlsContext):
     *   1. Explicit opts.workspace - own property wins, null/'' pins
     *      UNSCOPED (escape hatch for process-global state callers).
     *   2. opts.userCtx.workspace - explicit RLS subject.
     *   3. Current agent's habitat identity (agents.agentContext).
     *   4. Anonymous -> null -> flat (pre-85) keys.
     */
    _resolveWorkspace(opts = {}) {
        if (Object.prototype.hasOwnProperty.call(opts, 'workspace')) {
            const ws = opts.workspace;
            return (ws === null || ws === undefined || ws === '')
                ? null
                : _validateWorkspaceName(ws, 'opts.workspace');
        }
        if (opts.userCtx) {
            const ws = opts.userCtx.workspace;
            return (ws === null || ws === undefined || ws === '')
                ? null
                : _validateWorkspaceName(ws, 'userCtx.workspace');
        }
        try {
            const agents = require('./agents');
            const current = agents.getCurrentAgentId ? agents.getCurrentAgentId() : null;
            if (current && current !== 'default' && agents.agentContext) {
                const ctx = agents.agentContext(current);
                if (ctx && ctx.workspace) {
                    return _validateWorkspaceName(ctx.workspace, 'agent identity');
                }
            }
        } catch (e) { /* agents/habitat unavailable - stay anonymous */ }
        return null;
    }

    /**
     * (pass 85) Composite storage key for a workspace namespace:
     * ws<wsLen>.<ws>.<key>. The length prefix + letter-start workspace
     * names keep the namespace unambiguous under lib/storage.js's key
     * sanitizer (charset + 100-char truncation) - see the block comment
     * at the top of this file. null ws = flat key.
     */
    _stateKey(key, ws) {
        if (!ws) return key;
        const composite = 'ws' + ws.length + '.' + ws + '.' + key;
        if (composite.length > STORAGE_KEY_BUDGET) {
            throw new errors.VantError(
                'Workspace-scoped state key exceeds the ' + STORAGE_KEY_BUDGET +
                '-char storage budget (' + composite.length + '): ws ' + ws + ', key length ' + key.length +
                ' - shorten the key or the workspace name',
                { code: errors.CODES.VAF_INPUT_INVALID, retryable: false }
            );
        }
        return composite;
    }

    /**
     * Emit event to OS
     */
    _emit(event, data) {
        try {
            const ev = _getEvent();
            if (ev && ev.emit) ev.emit(event, data);
        } catch (e) {}
    }

    /**
     * Log to audit
     */
    _auditLog(action, data) {
        try {
            const audit = _getAudit();
            if (audit && audit.log) audit.log({ type: action, ...data });
        } catch (e) {}
    }

    // ==================== SEMANTIC ====================

    /**
     * Remember an experience (semantic/vector storage)
     * @param {string} type - Experience type/category
     * @param {any} data - Data to remember
     * @returns {object} Result with total count
     */
    async remember(type, data) {
        _checkWrite(`memory:${type}`);
        const sanitized = this.sanitizeData(data);
        const size = JSON.stringify(sanitized).length;

        if (size > this.maxDataSize) {
            throw new errors.VantError('EMEMORY: Data too large: max ' + this.maxDataSize + ' bytes', { code: errors.CODES.UNKNOWN });
        }

        const exp = {
            type,
            data: sanitized,
            timestamp: Date.now(),
            vector: await embed.generate(JSON.stringify(data))
        };

        this.experiences.push(exp);

        // Trim old
        if (this.experiences.length > this.maxExperiences) {
            this.experiences = this.experiences.slice(-this.maxExperiences);
        }

        // Index
        if (!this.patterns.has(type)) {
            this.patterns.set(type, []);
        }
        this.patterns.get(type).push(exp);

        // Persist
        await this._save();

        // Event + Audit
        this._emit('memory:remembered', { type, size });
        this._auditLog('memory_remember', { type, size });

        return { remembered: true, total: this.experiences.length };
    }

    /**
     * Find similar experiences (semantic search)
     * @param {string} query - Search query
     * @param {object} options - { topK: 5, type: null }
     * @returns {array} Matching experiences
     */
    async find(query, options = {}) {
        _checkRead(`memory:search`);
        const { topK = 5, type = null } = options;
        const queryVec = await embed.generate(query);

        let candidates = type
            ? (this.patterns.get(type) || [])
            : this.experiences;

        // Score by cosine similarity
        const scored = candidates.map(exp => ({
            exp,
            score: embed.cosineSimilarity(queryVec, exp.vector)
        }));

        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, topK).map(s => ({
            type: s.exp.type,
            data: s.exp.data,
            score: s.score,
            timestamp: s.exp.timestamp
        }));
    }

    // ==================== DOCUMENT ====================

    /**
     * Learn content (document storage)
     * Stores as markdown in brain - human readable
     * @param {string} key - Document key (category/key format)
     * @param {string} content - Content to learn
     * @param {object} opts - { ttl, expiresAt }
     * @returns {object} Result
     */
    async learn(key, content, opts = {}) {
        _checkWrite(`doc:${key}`);
        const { ttl, expiresAt, brain: brainName } = opts;
        const learnTTL = this._normalizeTTL(ttl, expiresAt);

        // Parse key as category/key
        const parts = key.split('/');
        const category = parts[0] || 'learnings';
        const fileKey = parts.slice(1).join('/') || 'default.md';

        // Write to brain (security included)
        // Support per-brain storage via brain option
        if (brainName) {
            await brain.write(category, fileKey, content, { brain: brainName });
        } else {
            await brain.write(category, fileKey, content);
        }

        // Memoize for fast recall (per-brain, matching query cache key format)
        const cacheKey = (brainName || 'default') + ':learn:' + key;
        this._cache.set(cacheKey, {
            content,
            expiresAt: Date.now() + learnTTL
        });

        // Event + Audit
        this._emit('memory:learned', { key, category, contentLength: content.length });
        this._auditLog('memory_learn', { key, category, contentLength: content.length });

        return { success: true, key, ttl: learnTTL };
    }

    /**
     * Query learned content
     * @param {string} key - Document key
     * @returns {string|null} Content or null
     */
    async query(key, opts = {}) {
        _checkRead(`doc:${key}`);
        const { brain: brainName } = opts;

        // Check cache first (per-brain)
        const cacheKey = (brainName || 'default') + ':learn:' + key;
        const cached = this._cache.get(cacheKey);
        if (cached && !this._isExpired(cached)) {
            return cached.content;
        }

        // Load from brain
        const parts = key.split('/');
        const category = parts[0] || 'learnings';
        const fileKey = parts.slice(1).join('/') || 'default.md';

        try {
            let data;
            // brain.load APPENDS '.md' itself — hand it the key WITHOUT the
            // extension or the read path doubles it (default.md.md) and the
            // query misses what learn wrote. (Funnel audit find: the CLI's
            // own learn->query example never round-tripped across processes,
            // because same-process queries hit the memo cache and skipped
            // this exact path.)
            const loadName = category + '/' + fileKey.replace(/\.md$/, '');
            if (brainName) {
                // (pass 70) Load from a specific brain via brain.load's
                // options.brain route - symmetric with learn's
                // brain.write({ brain }). The old name-prefixing built
                // 'brain/category/key' and dual-mode read it UNDER the
                // current brain root: a double-brain path that could never
                // exist on disk.
                data = await brain.load(loadName, { brain: brainName });
            } else {
                data = await brain.load(loadName);
            }
            if (data && data.content) {
                return data.content;
            }
        } catch (e) {}

        return null;
    }

    // ==================== STATE ====================

    /**
     * Store state (key-value with TTL)
     * @param {string} key - State key
     * @param {any} value - Value to store
     * @param {object} opts - { ttl, expiresAt, brain }
     * @returns {object} Result
     */
    async state(key, value, opts = {}) {
        const ws = this._resolveWorkspace(opts);
        const storeKey = this._stateKey(key, ws);
        _checkWrite(`state:${storeKey}`);
        const { ttl, expiresAt, brain: brainName } = opts;
        const stateTTL = this._normalizeTTL(ttl, expiresAt);

        const entry = {
            value,
            expiresAt: Date.now() + stateTTL,
            storedAt: Date.now()
        };

        // (B0 versioned note store, issue #253) NOTE-ENVELOPE MERGE. A
        // value that is an object carrying a `body` is the note shape: on an
        // overwrite of the same key the store now carries the provenance the
        // memory discipline family grades — revision spins up, writers
        // UNION (no vanished author), and a body change by writers the
        // prior revision never saw is flagged as a conflict instead of
        // blending into single-provenance silence. Latest content still
        // wins (the value is replaced); what gains provenance is the
        // envelope AROUND it.
        const isNoteShape = value !== null && typeof value === 'object' && !Array.isArray(value)
            && Object.prototype.hasOwnProperty.call(value, 'body');
        if (isNoteShape) {
            try {
                const prior = await this._readStateEntry(storeKey, { brain: brainName, fresh: true });
                const prevWriters = (prior && Array.isArray(prior.writers)) ? prior.writers : [];
                const nextWriters = Array.isArray(value.writers) ? value.writers
                    : (value.writers != null && value.writers !== '' ? [value.writers] : []);
                // First write records its own provenance too — a revision 1
                // with its writers line is the floor the merge builds on.
                entry.revision = prior ? (Number(prior.revision) || 0) + 1 : 1;
                const union = prevWriters.slice();
                for (const w of nextWriters) {
                    if (!union.includes(w)) union.push(w);
                }
                if (union.length) entry.writers = union;
                // Conflict requires DISJOINT provenance AND a content change:
                // two writers asserting different bodies for the same key.
                if (prevWriters.length && nextWriters.length
                    && !prevWriters.some((w) => nextWriters.includes(w))) {
                    entry.conflict = { between: prevWriters, and: nextWriters, revision: entry.revision };
                }
            } catch (e) { /* prior envelope is opportunistic - never blocks the write */ }
        }

        // Cache with brain prefix. storeKey carries the workspace namespace,
        // so acme:proj and globex:proj never collide in-process.
        const cacheKey = (brainName || 'default') + ':state:' + storeKey;
        this._cache.set(cacheKey, entry);

        // Also persist to brain for recovery (workspace-scoped filename when
        // a namespace resolved: state/ws<wsLen>.<ws>.<key>.json.md)
        try {
            if (brainName) {
                await brain.write(STATE_CATEGORY, storeKey + '.json', JSON.stringify(entry), { brain: brainName });
            } else {
                await brain.write(STATE_CATEGORY, storeKey + '.json', JSON.stringify(entry));
            }
        } catch (e) {}

        // Event + Audit
        this._emit('memory:stated', { key: storeKey, workspace: ws, brain: brainName });
        this._auditLog('memory_state', { key: storeKey, workspace: ws, brain: brainName });

        return { success: true, key, storeKey, workspace: ws || null, ttl: stateTTL };
    }

    /**
     * Recall state (key-value retrieval)
     * @param {string} key - State key
     * @param {object} opts - { brain, fresh }
     *   fresh: (pass 97) bypass the in-process cache and re-read the brain row.
     *   The cross-process habitat save-merge needs to see a PEER's latest
     *   write, but the shared memory singleton would otherwise serve back our
     *   own cached snapshot (masking the peer) and defeat the merge.
     * @returns {any} Stored value or undefined
     */
    async recall(key, opts = {}) {
        const ws = this._resolveWorkspace(opts);
        const storeKey = this._stateKey(key, ws);
        _checkRead(`state:${storeKey}`);
        const { brain: brainName } = opts;

        // Check memory cache (per-brain; storeKey carries the namespace)
        const cacheKey = (brainName || 'default') + ':state:' + storeKey;
        const entry = opts.fresh ? undefined : this._cache.get(cacheKey);
        if (entry && !this._isExpired(entry)) {
            if (opts.envelope) return await this._noteEnvelope(entry, opts, ws, brainName);
            return entry.value;
        }

        // Try brain. A resolved workspace reads ONLY its own namespace -
        // no flat fallback (namespaces are isolating, not additive).
        try {
            let data;
            const name = STATE_CATEGORY + '/' + storeKey + '.json';  // brain appends .md
            // (pass 97) opts.fresh also bypasses the BRAIN cache, not just this
            // module's cache - otherwise a peer's on-disk write stays invisible.
            const freshOpt = opts.fresh ? { fresh: true } : {};
            if (brainName) {
                // (pass 70) options.brain route - symmetric with state's
                // brain.write({ brain }) path.
                data = await brain.load(name, { brain: brainName, ...freshOpt });
            } else {
                data = await brain.load(name, freshOpt);
            }
            if (data) {
                // brain.load returns a WRAPPER ({ name, content, source,
                // brain }) — the JSON payload lives in .content. Parsing the
                // wrapper directly yields parsed.value === undefined and the
                // recall misses what state stored. (Same funnel-audit find as
                // the query fix: in-process this path is masked by the cache.)
                const raw = (data && typeof data === 'object' && typeof data.content === 'string') ? data.content : data;
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (parsed && !this._isExpired(parsed)) {
                    this._cache.set(cacheKey, parsed);
                    if (opts.envelope) return await this._noteEnvelope(parsed, opts, ws, brainName);
                    return parsed.value;
                }
            }
        } catch (e) {}

        // (Issue #174 QC) LEARN-LAYOUT FALLBACK. learn(key, content) parses
        // its key as category/fileKey and writes the learn layout —
        // learn('qc-wake', 'HQ') lands at <category-or-'qc-wake'>/default.md
        // on disk, NOT in state/ — while recall() only ever looked in the
        // state layout. The MCP door advertises learn↔recall as a pair, so
        // the wake-cycle contract ("learn on day one, recall after restart")
        // must round-trip across processes on the SAME key. Mirror query()'s
        // read path exactly (cache-then brain.load without the .md suffix).
        // state() writes remain findable FIRST (callers using state/retrieve
        // semantics are unaffected); this is strictly additive fallback.
        try {
            const parts = key.split('/');
            const learnCategory = parts[0] || 'learnings';
            const learnFileKey = parts.slice(1).join('/') || 'default.md';
            const loadName = learnCategory + '/' + learnFileKey.replace(/\.md$/, '');
            let learnData;
            if (brainName) {
                learnData = await brain.load(loadName, { brain: brainName, ...(opts.fresh ? { fresh: true } : {}) });
            } else {
                learnData = await brain.load(loadName, opts.fresh ? { fresh: true } : {});
            }
            // query() reads brain.load's WRAPPER — unwrap to the content
            // string the caller expects (learn→recall must mirror what a
            // human would read; NOT the wrapper object).
            const unwrapped = (learnData && typeof learnData === 'object' && typeof learnData.content === 'string')
                ? learnData.content
                : learnData;
            if (unwrapped !== null && unwrapped !== undefined) {
                // cache on the learn: cache format so query() sees the same
                // hit (one memo entry per layout, no format confusion).
                this._cache.set((brainName || 'default') + ':learn:' + key, {
                    content: unwrapped,
                    expiresAt: Date.now() + 86400000 // 1 day soft TTL; disk row remains the truth
                });
                return unwrapped;
            }
        } catch (e2) {}

        return undefined;
    }

    /**
     * (B0, issue #253) Read the raw STATE-layout entry off disk, bypassing
     * every cache. Used by state()'s note-envelope merge (the prior
     * revision must be seen even when the writer's own cache is hot) and
     * by envelope/ref probes. Returns the parsed entry object or null.
     * Does NOT include the learn-layout fallback: the merge reports the
     * prior STATE row, nothing else.
     */
    async _readStateEntry(storeKey, opts = {}) {
        const freshOpt = opts.fresh ? { fresh: true } : {};
        const brain = require('./brain');
        const name = STATE_CATEGORY + '/' + storeKey + '.json';
        try {
            const data = opts.brain
                ? await brain.load(name, { brain: opts.brain, ...freshOpt })
                : await brain.load(name, freshOpt);
            const raw = (data && typeof data === 'object' && typeof data.content === 'string') ? data.content : data;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return (parsed && !this._isExpired(parsed)) ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * (B0, issue #253) NOTE ENVELOPE. The read-layer view of a note:
     * the stored note fields, the versioned provenance state() tracked,
     * and the read-time flags the memory discipline rows grade -
     * summary/body contradiction (deterministic digit disagreement) and
     * unresolved refs (each ref probed against the state namespace the
     * caller names, so a ghost claim surfaces as data instead of silence).
     * Non-object values read back as { body } so envelopes keep one shape.
     * Computed here, never stored: flags always describe THIS read.
     */
    async _noteEnvelope(parsed, opts = {}, ws = null, brainName = null) {
        const value = parsed && typeof parsed === 'object' ? parsed.value : undefined;
        const out = (value && typeof value === 'object' && !Array.isArray(value))
            ? { ...value }
            : { body: value };

        // Versioned provenance first: the envelope merge wrote this onto
        // the entry, the raw caller value never carried it.
        const revision = Number(parsed.revision) || 0;
        out.revision = revision;
        if (Array.isArray(parsed.writers)) out.writers = parsed.writers.slice();
        if (parsed.conflict) out.conflict = parsed.conflict;

        // Read-time flag: summary contradicts body. Deterministic, global
        // marker honesty accepted by every discipline family. Digit tokens
        // are the ordinary drift carriers ("invoice total: 42" vs body 87);
        // digits named in the summary must survive into the body.
        if (typeof out.summary === 'string' && typeof out.body === 'string') {
            const digitTokens = (s) => Array.from(new Set((String(s).match(/\d+/g) || []).map(Number)));
            const sDigits = digitTokens(out.summary);
            if (sDigits.length) {
                const bDigits = digitTokens(out.body);
                const missing = sDigits.filter((d) => !bDigits.includes(d));
                if (missing.length) {
                    out.summaryContradiction = { summary: out.summary, bodyDigits: bDigits, missing };
                }
            }
        }

        // Read-time flag: refs that resolve to no live state row in the
        // caller's namespace are unresolved claims. Probes read the state
        // layout directly (no fallback, no recursion into envelopes).
        const refNamespace = typeof opts.refNamespace === 'string' ? opts.refNamespace : null;
        if (refNamespace && Array.isArray(out.refs) && out.refs.length) {
            const probes = out.refs.filter((r) => r != null && String(r).length > 0)
                .map(async (ref) => {
                    try {
                        const probeKey = this._stateKey(refNamespace + String(ref), ws);
                        const row = await this._readStateEntry(probeKey, { brain: brainName, fresh: true });
                        return row ? null : String(ref);
                    } catch (e) {
                        return null; // probe failure is not a ghost verdict
                    }
                });
            const missing = (await Promise.all(probes)).filter((r) => r !== null);
            if (missing.length) {
                out.unresolvedRefs = missing;
            }
        }

        return out;
    }

    // ==================== GEOMETRIC ====================

    /**
     * Store at geometric address (quasicrystal)
     * Uses brain.geoStore() for NSC9-compliant, brain-aware storage
     * @param {string} data - Data to store
     * @param {object} opts - Additional options (brain, type)
     * @returns {string} Barcode address
     */
    async address(data, opts = {}) {
        _checkWrite(`geo:address`);

        // Generate a deterministic key for the barcode
        const key = `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Use brain.geoStore() for proper NSC9 barcode + brain-aware path
        const brain = require('./brain');
        const brainName = opts.brain || this._getBrainName();
        const type = opts.type || 'private';

        const result = await brain.geoStore(key, data, { brain: brainName, type });

        if (result.error) {
            throw new errors.VantError('geo: ' + result.error, { code: errors.CODES.STORAGE_ERROR });
        }

        // Event + Audit
        this._emit('memory:addressed', { barcode: result.barcode });
        this._auditLog('memory_address', { barcode: result.barcode, brain: brainName });

        return result.barcode;
    }

    /**
     * Store at a specific barcode (deterministic - for deterministic storage)
     * Uses brain-aware path via brain.js's path resolution
     * @param {string} barcode - Specific barcode address (NSC9 format preferred)
     * @param {any} data - Data to store
     * @param {object} opts - Additional options (brain, type)
     * @returns {object} Result
     */
    async geoStore(barcode, data, opts = {}) {
        _checkWrite(`geo:${barcode}`);

        // Use brain's proper path resolution
        const brain = require('./brain');
        const brainName = opts.brain || this._getBrainName();
        const type = opts.type || 'private';
        const basePath = brain.getGeometryPath(brainName, type);

        await geometry.store(barcode, data, basePath, opts);

        this._emit('memory:geoStored', { barcode, brain: brainName });
        this._auditLog('memory_geoStore', { barcode, brain: brainName });

        return { barcode, stored: true, brain: brainName };
    }

    /**
     * Locate and retrieve from geometric address
     * Uses brain.geoLoad() for proper brain-aware path resolution
     * @param {string} barcode - Geometric address (NSC9 format)
     * @param {object} opts - Options (brain, type)
     * @returns {any} Stored data
     */
    async locate(barcode, opts = {}) {
        _checkRead(`geo:${barcode}`);

        // Use brain.geoLoad() for brain-aware retrieval
        const brain = require('./brain');
        const brainName = opts.brain || this._getBrainName();
        const type = opts.type || 'private';

        const result = await brain.geoLoad(barcode, { brain: brainName, type });

        if (result.error) {
            return { error: result.error, barcode };
        }

        return result.data;
    }

    // ==================== UTILITIES ====================

    /**
     * Get memory statistics
     * @returns {object} Stats
     */
    getStats() {
        const typeCounts = {};
        for (const [type, exps] of this.patterns) {
            typeCounts[type] = exps.length;
        }

        return {
            semantic: {
                total: this.experiences.length,
                types: typeCounts,
                capacity: this.maxExperiences
            },
            state: this._cache.size,
            categories: typeCounts,
            learn: this._learnDocCount()
        };
    }

    /**
     * Count documents in the learn store (memory learn / memory query).
     * (R3-F6, #193) `getStats()` used to report the in-process state cache
     * and semantic dict only - everything `memory learn` wrote was
     * invisible, so `vant memory list` showed `state:0 categories:{} `
     * right after a successful learn. Docs live as markdown under the
     * ACTIVE brain root (see learn(): brain.write(category, fileKey)), so
     * count non-empty .md categories there, excluding the module's own
     * bookkeeping trees (memory/state/geometry) that are not learn keys.
     * Best-effort: an unreadable brain reports learn: 0 rather than
     * throwing - stats must never be the thing that crashes the CLI.
     * @returns {number} learn-document count
     */
    _learnDocCount() {
        try {
            const fs = require('fs');
            const path = require('path');
            const b = require('./brain');
            // getBrainPath() resolves the ACTIVE brain's directory (the same
            // root learn() writes into via brain.write -> storage), so the
            // learn store = the category subdirs of that root.
            const root = path.resolve(b.getBrainPath());
            if (!fs.existsSync(root)) return 0;
            const LEARN_EXCLUDE = new Set(['memory', 'state', 'geometry']);
            let count = 0;
            for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue;
                if (LEARN_EXCLUDE.has(entry.name)) continue;
                let dir;
                try { dir = fs.readdirSync(path.join(root, entry.name)); } catch (e) { continue; }
                count += dir.filter(f => f.toLowerCase().endsWith('.md')).length;
            }
            return count;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Clear all memory (reset)
     * @returns {object} Result
     */
    async clear() {
        this.patterns.clear();
        this.experiences = [];
        this._cache.clear();
        await this._save();

        this._emit('memory:cleared', {});
        this._auditLog('memory_clear', {});

        return { cleared: true };
    }

    /**
     * Clear specific memory type
     * @param {string} type - Type to clear
     * @returns {object} Result
     */
    async clearType(type) {
        if (type === 'semantic') {
            this.patterns.clear();
            this.experiences = [];
        } else if (type === 'state') {
            this._cache.clear();
        }

        await this._save();
        return { cleared: type };
    }
}

// Singleton instance
const memory = new Memory();

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get stats from all brains in the stack
 * @returns {Object} Combined stats
 */
function getStackStats() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        totalNeurons: 0,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const s = memory.getStats();
            results.byBrain[brainName] = s;
            results.totalNeurons += s.neurons || 0;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Find memories across all brains in the stack
 * @param {string} query - Query string
 * @param {Object} options - Options
 * @returns {Array} Combined results
 */
function findStack(query, options = {}) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const found = memory.find(query, options);
            if (Array.isArray(found)) {
                found.forEach(f => {
                    results.push({ ...f, brain: brainName });
                });
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// Export both class and instance
module.exports = {
    Memory,
    memory,

    // State persistence (used by Habitat)
    state: (key, value, opts) => memory.state(key, value, opts),
    recall: (key, opts) => memory.recall(key, opts),

    // (pass 85) Composite key builder - the single source of truth for
    // where a scoped state row lands on disk (tests + tooling).
    stateKey: (ws, key) => memory._stateKey(key, ws),

    // Semantic memory
    remember: (type, data) => memory.remember(type, data),
    find: (query, opts) => memory.find(query, opts),

    // Document memory
    learn: (key, content, opts) => memory.learn(key, content, opts),
    query: (key) => memory.query(key),

    // Geometric memory
    address: (data, opts) => memory.address(data, opts),
    geoStore: (barcode, data, opts) => memory.geoStore(barcode, data, opts),
    locate: (barcode) => memory.locate(barcode),

    // Utilities
    getStats: () => memory.getStats(),
    clear: () => memory.clear(),

    // Duality - Brain-Geometry Bridge

    // Multibrain Stack
    getStackStats,
    findStack
};
