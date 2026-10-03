/**
 * Vant Notices — the federation noticeboard (frame.md §5 gap 5, pass 68 Wave I).
 *
 * INTER-org broadcast + durable catch-up. Agora is where deliberation
 * happens (consensus, votes, scoped ledgers); the board is where the
 * Post goes up: plain announcements any member node can read, durable
 * across restarts, catch-up-able after downtime. The decision→board
 * bridge absorbs the pass-52 manual broadcast (the exercise's step-6
 * "scoped + plain notice" leg becomes one call).
 *
 * WIRE (two legs, both registered-peers-only, sender-checked like the
 * pass-51/67 pins):
 *   notice.post    { notes: [Note], from }   push: source → peers
 *   notice.request { reqId, from }           catch-up ask
 *   notice.board   { notes: [Note], reqId, from }  ack (pull result)
 *
 * Note shape (plain Post, no secrets, no scope):
 *   { id, from, title, body, ts, ttlMs, ref }
 *   - id: 'note-<ts>-<seq>' (unique per posting node)
 *   - ttlMs: 0 = sticky (default); else expiry = ts + ttlMs
 *   - ref: optional provenance pointer (e.g. the consensus topic)
 *
 * RULES:
 *   - merge-only adoption: a note id is adopted once; re-posts never
 *     overwrite (first writer wins — mirrors the member.intro rule)
 *   - TTL-pruned on read and on demand; capped (oldest evicted)
 *   - dirty write-through: mutations persist on the next board touch —
 *     no timers, the board is durable the moment anything reads it
 *   - decisions bridge only when UNSCOPED: a scoped topic's existence
 *     is never nameable to the commons (frame §4 — membership facts
 *     federate, scope-internal content does not)
 */

const crypto = require('crypto');

const BOARD_STATE_FILE = 'state/notices.json';
const MAX_TITLE = 120;
const MAX_BODY = 2000;
const MAX_REF = 120;
const MAX_NOTES = 200;                       // board cap: oldest evicted
const MAX_TTL_MS = 30 * 24 * 3600 * 1000;    // 30 days
const PULL_TIMEOUT_MS = 5000;

// NOTE ids sort by (ts, seq): a monotone per-process seq breaks ties
// when two notes land in the same millisecond — newest-first reads stay
// stable across nodes.
let _seq = 0;

const _state = {
    hydrated: false,
    dirty: false,
    notes: new Map() // id -> Note
};

// Pull-pending map, agora-sync convention: key = busLabel + reqId,
// sender-bound so an observed reqId cannot be forged by a third peer.
const _pending = new Map();
const _installed = new WeakSet();

// ---------- board store (kind-marked protocol state) ----------

function _busName(bus) {
    try { const s = bus.status(); return s && s.name; } catch (e) { return null; }
}

function _ensureHydrated() {
    if (_state.hydrated) return;
    _state.hydrated = true;
    try {
        const store = require('./state-store');
        store.hydrate({
            moduleName: 'notices',
            stateFile: BOARD_STATE_FILE,
            apply: (data) => {
                if (!data || data.module !== 'notices' || !Array.isArray(data.notes)) return;
                for (const n of data.notes) {
                    if (n && n.id && typeof n.id === 'string') _state.notes.set(n.id, n);
                }
            }
        });
    } catch (e) { /* unreadable board = empty board; persist repairs */ }
}

function _persistIfDirty() {
    if (!_state.dirty) return;
    const store = require('./state-store');
    const notes = [..._state.notes.values()];
    store.persist({
        moduleName: 'notices',
        stateFile: BOARD_STATE_FILE,
        data: { notes, savedCount: notes.length }
    });
    _state.dirty = false;
}

function _expired(n, now) {
    return n.ttlMs > 0 && (n.ts + n.ttlMs) <= now;
}

// Merge-only: adopt unknown ids only. Returns true when adopted.
function _mergeNote(note) {
    if (!note || typeof note.id !== 'string' || !note.id) return false;
    if (_state.notes.has(note.id)) return false; // first writer wins
    _state.notes.set(note.id, note);
    _state.dirty = true;
    return true;
}

// ---------- public: the board ----------

/**
 * Post a note to THIS node's board. Local write — sync legs are
 * explicit (push/broadcast). The caller may pass a bus purely so the
 * note's `from` is the node name on the wire; no send happens here.
 *
 * @param {object} opts - { title, body?, ttlMs?, ref?, bus?, now? }
 * @returns {{ ok, note }} or { ok: false, reason }
 */
function post(opts = {}) {
    _ensureHydrated();
    const title = typeof opts.title === 'string' ? opts.title.trim().slice(0, MAX_TITLE) : '';
    if (!title) return { ok: false, reason: 'title_required' };
    const body = typeof opts.body === 'string' ? opts.body.slice(0, MAX_BODY) : '';
    let ttlMs = 0;
    if (opts.ttlMs !== undefined && opts.ttlMs !== null) {
        ttlMs = parseInt(opts.ttlMs, 10);
        if (!Number.isFinite(ttlMs) || ttlMs < 0) return { ok: false, reason: 'invalid_ttl' };
        ttlMs = Math.min(ttlMs, MAX_TTL_MS);
    }
    const ref = typeof opts.ref === 'string' ? opts.ref.slice(0, MAX_REF) : null;
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const note = {
        id: 'note-' + now + '-' + (++_seq) + '-' + crypto.randomBytes(3).toString('hex'),
        from: _busName(opts.bus) || 'local',
        title,
        body,
        ts: now,
        ttlMs,
        ref
    };
    _mergeNote(note);
    _evictOldest(MAX_NOTES);
    _persistIfDirty();
    return { ok: true, note };
}

// Cap enforcement: evict OLDEST first (ts asc). Sticky and expiring
// notes compete on ts alone — age, not stickiness, decides eviction.
function _evictOldest(cap) {
    if (_state.notes.size <= cap) return;
    const sorted = [..._state.notes.values()].sort((a, b) => a.ts - b.ts);
    while (_state.notes.size > cap) {
        _state.notes.delete(sorted.shift().id);
        _state.dirty = true;
    }
}

/**
 * Read the live board (newest first). Expired notes are pruned on read
 * and the prune persisted when it changed anything.
 *
 * @param {object} [opts] - { now?, includeExpired? }
 * @returns {Array<Note>}
 */
function list(opts = {}) {
    _ensureHydrated();
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const out = [];
    let pruned = false;
    for (const [id, n] of _state.notes) {
        if (!opts.includeExpired && _expired(n, now)) {
            _state.notes.delete(id);
            pruned = true;
            continue;
        }
        out.push(n);
    }
    if (pruned) {
        _state.dirty = true;
        _persistIfDirty();
    }
    out.sort((a, b) => (b.ts - a.ts) || ((b.seq || 0) - (a.seq || 0)));
    return out;
}

/**
 * Drop every expired note. Returns the ids pruned.
 *
 * @param {object} [opts] - { now? }
 */
function prune(opts = {}) {
    _ensureHydrated();
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const pruned = [];
    for (const [id, n] of _state.notes) {
        if (_expired(n, now)) {
            _state.notes.delete(id);
            pruned.push(id);
        }
    }
    if (pruned.length) {
        _state.dirty = true;
        _persistIfDirty();
    }
    return { pruned };
}

// ---------- wire: push-on-post legs + catch-up ----------

/**
 * Wire the notice dispatchers onto a bus. Idempotent per bus. Both
 * legs answer REGISTERED PEERS ONLY (agora-sync convention — an unknown
 * origin gets no board oracle even when its envelope is signed).
 *
 * @param {object} bus - a createBus() instance (or the singleton)
 */
function install(bus) {
    if (!bus || typeof bus.onDispatch !== 'function') {
        throw new Error('notices.install: bus required');
    }
    if (_installed.has(bus)) return { installed: true, already: true };
    _installed.add(bus);

    // PUSH leg: a peer's notes arrive for adoption. Merge-only; the
    // whole payload is untrusted — every field is re-clamped here.
    bus.onDispatch('notice.post', (env) => {
        const from = env && env.from;
        const p = env && env.payload;
        if (!p || !Array.isArray(p.notes)) return;
        let peers;
        try { peers = bus.nodes(); } catch (e) { peers = []; }
        if (!peers.some((n) => n.name === from)) return; // registered peers only
        _ensureHydrated();
        let adopted = 0;
        for (const raw of p.notes) {
            if (!raw || typeof raw !== 'object') continue;
            const ts = Number.isFinite(raw.ts) ? raw.ts : Date.now();
            let ttlMs = Number.isFinite(raw.ttlMs) ? Math.max(0, parseInt(raw.ttlMs, 10)) : 0;
            ttlMs = Math.min(ttlMs, MAX_TTL_MS);
            const note = {
                id: String(raw.id || '').slice(0, 80),
                from: String(raw.from || from).slice(0, 64),
                title: typeof raw.title === 'string' ? raw.title.slice(0, MAX_TITLE) : '',
                body: typeof raw.body === 'string' ? raw.body.slice(0, MAX_BODY) : '',
                ts,
                ttlMs,
                ref: typeof raw.ref === 'string' ? raw.ref.slice(0, MAX_REF) : null
            };
            if (!note.id || !note.title) continue;
            if (_mergeNote(note)) adopted++;
        }
        if (adopted > 0) _persistIfDirty();
    });

    // CATCH-UP ask: reply with OUR live board. Reply even when empty —
    // an empty board stops the asker's retry loop (state.request rule).
    bus.onDispatch('notice.request', (env) => {
        const from = env && env.from;
        const p = env && env.payload;
        if (!p || typeof p.reqId !== 'string') return;
        let peers;
        try { peers = bus.nodes(); } catch (e) { peers = []; }
        if (!peers.some((n) => n.name === from)) return;
        const notes = list({}); // live board, expired pruned
        bus.send(from, 'notice.board', { notes, reqId: p.reqId, from: _busName(bus) })
            .catch(() => { /* reply is best-effort; asker has a timeout */ });
    });

    // CATCH-UP ack: resolves the puller's pending promise. Sender-bound
    // to the node the ask was addressed to (pass-51 forged-reqId rule).
    bus.onDispatch('notice.board', (env) => {
        const payload = env && env.payload;
        if (!payload || typeof payload.reqId !== 'string' || !Array.isArray(payload.notes)) return;
        const key = (_busName(bus) || 'bus') + ':' + payload.reqId;
        const pending = _pending.get(key);
        if (!pending) return; // unsolicited / late ack — drop
        if (pending.from && env.from !== pending.from) return; // sender binding
        clearTimeout(pending.timer);
        _pending.delete(key);
        _ensureHydrated();
        let adopted = 0;
        for (const raw of payload.notes) {
            if (!raw || typeof raw !== 'object' || !raw.id || !raw.title) continue;
            if (_mergeNote({
                id: String(raw.id).slice(0, 80),
                from: String(raw.from || env.from).slice(0, 64),
                title: String(raw.title).slice(0, MAX_TITLE),
                body: typeof raw.body === 'string' ? String(raw.body).slice(0, MAX_BODY) : '',
                ts: Number.isFinite(raw.ts) ? raw.ts : Date.now(),
                ttlMs: Number.isFinite(raw.ttlMs) ? Math.min(Math.max(0, parseInt(raw.ttlMs, 10)), MAX_TTL_MS) : 0,
                ref: typeof raw.ref === 'string' ? String(raw.ref).slice(0, MAX_REF) : null
            })) adopted++;
        }
        if (adopted > 0) _persistIfDirty();
        pending.resolve({ ok: true, pulled: adopted, from: env.from });
    });

    return { installed: true, already: false };
}

function _pendingKey(bus) {
    return _busName(bus) || ('bus#' + _pending.size);
}

/**
 * PUSH: send our live board to one peer. The peer adopts merge-only.
 *
 * @param {object} bus - configured bus with the peer registered
 * @param {string} nodeName - peer to push to
 * @returns {Promise<{ pushed, ok?, handlers?, reason? }>}
 */
async function push(bus, nodeName) {
    if (!bus || typeof bus.send !== 'function') throw new Error('notices.push: bus required');
    if (!_installed.has(bus)) install(bus);
    const notes = list({});
    try {
        const r = await bus.send(nodeName, 'notice.post', { notes, from: _busName(bus) });
        return { pushed: true, ok: r.ok, handlers: r.handlers };
    } catch (e) {
        return { pushed: false, reason: 'send_failed: ' + e.message };
    }
}

/**
 * CATCH-UP: pull a peer's live board into ours (the post-restart seam).
 *
 * @param {object} bus - configured bus with the peer registered
 * @param {string} nodeName - peer to pull from
 * @param {object} [opts] - { timeoutMs? }
 * @returns {Promise<{ pulled, from? }>} or { pulled: 0, reason }
 */
async function pull(bus, nodeName, opts = {}) {
    if (!bus || typeof bus.send !== 'function') throw new Error('notices.pull: bus required');
    if (!_installed.has(bus)) install(bus);
    const reqId = 'n-' + crypto.randomBytes(6).toString('hex');
    const timeoutMs = parseInt(opts.timeoutMs, 10) || PULL_TIMEOUT_MS;
    const result = await new Promise((resolve) => {
        const key = _pendingKey(bus) + ':' + reqId;
        const timer = setTimeout(() => {
            _pending.delete(key);
            resolve({ pulled: 0, reason: 'timeout' });
        }, timeoutMs);
        _pending.set(key, { from: nodeName, timer, resolve });
        bus.send(nodeName, 'notice.request', { reqId, from: _busName(bus) })
            .catch((e) => {
                clearTimeout(timer);
                _pending.delete(key);
                resolve({ pulled: 0, reason: 'send_failed: ' + e.message });
            });
    });
    if (result.reason) return { pulled: 0, reason: result.reason };
    return result;
}

/**
 * BROADCAST: push our board to every registered peer (fire-and-forget
 * per peer; results come back per node).
 */
async function broadcast(bus) {
    if (!bus || typeof bus.broadcast !== 'function') throw new Error('notices.broadcast: bus required');
    if (!_installed.has(bus)) install(bus);
    const notes = list({});
    return bus.broadcast('notice.post', { notes, from: _busName(bus) });
}

// ---------- the decision→board bridge ----------

/**
 * Bridge a consensus decision onto the board: the plain-notice leg of
 * the pass-52 broadcast, as one call. SCOPED TOPICS ARE REFUSED — their
 * existence is not nameable to the commons; members who may see them
 * read the agora, not the board.
 *
 * @param {object} [opts] - { bus?, ttlMs?, now? }
 * @returns {{ bridged: true, note }} or { bridged: false, reason }
 */
function bridgeDecision(topic, opts = {}) {
    if (typeof topic !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(topic) || topic.length > 100) {
        return { bridged: false, reason: 'invalid_topic' };
    }
    let row = null;
    let ledger = null;
    try {
        const consensus = require('./consensus');
        // Full internal list (viewerId undefined = trusted-internal read)
        // exists ONLY to check the scoped flag; the summary rows carry no
        // ballots, so scoping is not bypassed by the check itself.
        row = consensus.list(undefined).find((t) => t.topic === topic) || null;
        if (!row) return { bridged: false, reason: 'not_found' };
        if (row.scoped) return { bridged: false, reason: 'scoped_topic' };
        ledger = consensus.exportTopic(topic);
    } catch (e) {
        return { bridged: false, reason: 'export_failed' };
    }
    if (!ledger) return { bridged: false, reason: 'not_found' };
    const votes = Object.keys((ledger && ledger.votes) || {}).length;
    const status = ledger.status || row.status || 'unknown';
    const title = ('Decision: ' + topic + ' — ' + status).slice(0, MAX_TITLE);
    const body = [
        'Status: ' + status,
        'Votes: ' + votes,
        ledger.deadline ? ('Deadline: ' + ledger.deadline) : null,
        'Bridged from the agora by ' + ((_busName(opts.bus)) || 'local') + '.',
        'Deliberation stays in the forum; this board carries the outcome.'
    ].filter(Boolean).join('\n');
    const r = post({ title, body, ttlMs: opts.ttlMs, ref: topic, bus: opts.bus, now: opts.now });
    if (!r.ok) return { bridged: false, reason: r.reason || 'post_failed' };
    return { bridged: true, note: r.note };
}

module.exports = {
    post, list, prune, install, push, pull, broadcast, bridgeDecision,
    BOARD_STATE_FILE, MAX_NOTES, MAX_TTL_MS
};
