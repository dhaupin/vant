/**
 * Agora State Sync (pass 49 / next-wave candidate 2)
 *
 * Cross-machine consensus sync over the crew-bus. The hazard: protocol
 * state is per-node (per-brain state/ files); a peer that never saw topic
 * X could not vote on it, and a peer with stale state could not count the
 * votes cast after its last hydration. demo-v02's re-hydrate trick only
 * works for same-disk processes — real nodes are on different machines.
 *
 * Design: a PULL round-trip, not replication. The node that is missing a
 * topic asks the node that owns it:
 *
 *   A -> B  crew.state.request  { topic }            (signed, scope-gated)
 *   B -> A  crew.state        { ledger, from }       (signed, scope-gated)
 *
 * B answers by re-reading its LIVE ledger at reply time (stale-cache-
 * proof: B may have voted after A's last view). A merges via
 * consensus.mergeTopic, which re-derives ALL derived fields (status,
 * outcomes, hash) locally — the wire never declares a topic passed.
 * Scope rides the payload: crew-bus drops scoped envelopes for non-
 * members (pass 40 rule), so a team-private topic is invisible to
 * outsiders on BOTH legs.
 *
 * Security posture: rides crew-bus's HMAC envelope auth (pass 42,
 * fail-closed), the webhook inbound gate, and the scope gate. No new
 * crypto. The reply handler validates before merge (consensus side).
 *
 * Usage (node B, the owner):
 *   const sync = require('./agora-sync');
 *   sync.install(bus);            // wires dispatchers
 *
 * Usage (node A, the peer missing a topic):
 *   const result = await sync.pull(bus, 'node-b', 'topic-name');
 *   // -> { pulled: true, merged: { adopted, created } } or { pulled: false, reason }
 */

const crypto = require('crypto');

// One listener set per bus instance (install is idempotent per bus).
const _installed = new WeakSet();
// (pass 56) Strong refs to installed buses for status() — install() already
// holds them via the dispatchers; these just make the roster inspectable.
const _busRefs = new Map(); // label -> bus

/**
 * Wire the crew.state.request / crew.state dispatchers onto a bus.
 * Call once per node on the OWNER side (the node whose consensus is the
 * source of truth for its topics). Idempotent.
 *
 * @param {object} bus - a createBus() instance (or the singleton)
 * @param {object} [opts] - { maxTopicLength, replyTimeoutMs }
 */
function install(bus, opts = {}) {
    if (!bus || typeof bus.onDispatch !== 'function') {
        throw new Error('agora-sync.install: bus required');
    }
    if (_installed.has(bus)) return { installed: true, already: true };
    _installed.add(bus);
    _busRefs.set(busName(bus) || ('bus-' + _busRefs.size), bus);

    const MAX_TOPIC = Math.min(parseInt(opts.maxTopicLength, 10) || 100, 100);

    // A peer asks us for a topic we (may) own. Re-read LIVE state at reply
    // time — never a cached view. Reply over the SAME shared-secret channel
    // by looking the requester up in OUR registered peers.
    bus.onDispatch('state.request', (env) => {
        const from = env && env.from;
        const topic = env && env.payload && env.payload.topic;
        if (typeof topic !== 'string' || topic.length < 1 || topic.length > MAX_TOPIC) {
            return; // malformed ask: drop silently (bad actors learn nothing)
        }
        let peers;
        try { peers = bus.nodes(); } catch (e) { peers = []; }
        if (!peers.some((p) => p.name === from)) {
            // Only answer registered peers — an unknown origin does not get
            // a state oracle, even though the envelope was signed.
            return;
        }
        let ledger = null;
        try {
            const consensus = require('./consensus');
            ledger = consensus.exportTopic(topic);
        } catch (e) { ledger = null; }
        // Reply even when null ({ ledger: null }) so the asker can stop
        // retrying instead of timing out. Null reply is NOT distinguishable
        // from "exists but scope-hidden" by design (crew-bus scope gate
        // already dropped the latter before we saw it).
        const reply = bus.send(from, 'state', { ledger, from: busName(bus), reqId: env.payload.reqId || null })
            .catch(() => { /* reply is best-effort; asker has a timeout */ });
        if (reply && typeof reply.catch === 'function') { /* floating on purpose */ }
    });

    // (pass 50 / next-wave 3) Distributed agora: a peer casts a vote on
    // OUR topic by envelope. The OWNER runs consensus's FULL gate stack
    // locally — scope resolves where the team registry lives (owner),
    // requireRegistry verifies the voter against the owner's registry,
    // quarantine + one-vote + deadline all apply unchanged. The wire
    // carries only { topic, outcome, agentId }; every trust decision stays
    // local. Remote agents must be PRE-REGISTERED (vetted) in the owner's
    // node-registry — the genesis flow — or the ack returns the denial.
    bus.onDispatch('vote', (env) => {
        const from = env && env.from;
        const p = env && env.payload;
        if (!p || typeof p.topic !== 'string' || typeof p.outcome !== 'string' || !p.outcome || typeof p.agentId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(p.agentId)) {
            return; // malformed ballot: drop
        }
        let peers;
        try { peers = bus.nodes(); } catch (e) { peers = []; }
        if (!peers.some((n) => n.name === from)) return; // registered peers only
        // consensus.vote is lock-wrapped (returns a PROMISE). Keep this
        // dispatcher synchronous (crew-bus try/catch won't see async
        // rejections) and ack from the promise's own resolution.
        Promise.resolve()
            .then(() => require('./consensus').vote(p.topic, p.outcome, p.agentId))
            .then((result) => {
                // Ack with the verdict (trimmed — no ledger dump on the vote leg).
                return bus.send(from, 'vote.ack', {
                    reqId: p.reqId || null,
                    result: {
                        error: result && result.error ? String(result.error).slice(0, 120) : null,
                        code: result && result.code ? String(result.code).slice(0, 40) : null,
                        status: result && result.status ? String(result.status).slice(0, 20) : null,
                        totalVotes: result && Number.isFinite(result.totalVotes) ? result.totalVotes : null
                    },
                    from: busName(bus)
                });
            })
            .catch((e) => {
                // Gate threw or ack failed — try to ack the error once.
                bus.send(from, 'vote.ack', {
                    reqId: p.reqId || null,
                    result: { error: 'vote_failed: ' + String(e.message).slice(0, 100), code: null, status: null, totalVotes: null },
                    from: busName(bus)
                }).catch(() => { /* ack is best-effort */ });
            });
    });

    // (pass 50) The vote ACK leg: resolves the voter's pending promise.
    // A dedicated dispatcher — the ack is a crew.vote.ack envelope, and
    // without this handler a REAL bus would silently drop it (the stub
    // test caught exactly that).
    bus.onDispatch('vote.ack', (env) => {
        const payload = env && env.payload;
        if (!payload || typeof payload !== 'object' || !payload.result) return;
        const pending = _pending.get(pendingKey(bus, payload.reqId));
        if (!pending) return; // unsolicited / late ack — drop
        // (pass 51 / live-fire) Sender binding: the ack must come from the
        // node the ballot was addressed to. reqId alone is not proof — a
        // hostile registered peer that observes a reqId must not be able
        // to forge a "vote accepted" verdict onto our pending promise.
        if (pending.from && env.from !== pending.from) return;
        clearTimeout(pending.timer);
        _pending.delete(pendingKey(bus, payload.reqId));
        pending.resolve({
            voted: !payload.result.error,
            reason: payload.result.error || null,
            code: payload.result.code || null,
            tally: payload.result.status ? { status: payload.result.status, totalVotes: payload.result.totalVotes } : null
        });
    });

    // (pass 49) Return leg: a peer that VOTED on a synced topic pushes
    // its updated ledger back so the owner's tally reflects the crew's
    // votes, not just local ones. Same merge invariants: adopt only
    // unknown agents' votes, in-memory wins on conflict, status re-derived
    // locally by tally() — a push can never declare a topic passed, it can
    // only add ballots the owner then tallies itself.
    bus.onDispatch('state.push', (env) => {
        const from = env && env.from;
        const ledger = env && env.payload && env.payload.ledger;
        if (!ledger || typeof ledger !== 'object') return;
        let peers;
        try { peers = bus.nodes(); } catch (e) { peers = []; }
        if (!peers.some((p) => p.name === from)) return; // registered peers only
        try {
            require('./consensus').mergeTopic({ ...ledger, syncedFrom: from });
        } catch (e) { /* malformed push: drop — sender's ack shows 0 handlers */ }
    });

    // The reply leg: merge the ledger (consensus.mergeTopic re-derives
    // everything). Registered so the owner side ALSO tolerates pulls from
    // peers it owns topics for (symmetric install is normal).
    bus.onDispatch('state', (env) => {
        const payload = env && env.payload;
        if (!payload || typeof payload !== 'object') return;
        const pending = _pending.get(pendingKey(bus, payload.reqId));
        if (!pending) return; // unsolicited / late reply — drop
        // (pass 51 / live-fire) Sender binding, pull leg: the ledger reply
        // must come from the node that was ASKED. A third peer replaying
        // (or forging) a reqId it observed must not be able to feed our
        // merge path a snapshot of its choosing.
        if (pending.from && env.from !== pending.from) return;
        clearTimeout(pending.timer);
        _pending.delete(pendingKey(bus, payload.reqId));
        pending.resolve({ pulled: payload.ledger ? true : false, reason: payload.ledger ? null : 'not_found', envelope: { from: env.from }, ledger: payload.ledger || null });
    });

    // (pass 58 / Wave C) Gossip summary leg: a registered peer asks what
    // topics we have. OWN-SIDE SCOPE FILTER: we summarize OUR ledgers and
    // strip every scoped topic the asker cannot access — scope resolves
    // HERE where the team registry lives (pass-50 rule); the asker's
    // member set never rides the wire and a scoped topic is never NAMED
    // to a non-member. Only topic names leave; details ride the gated
    // pull legs. Bounded summary.
    bus.onDispatch('gossip.request', (env) => {
        const from = env && env.from;
        const p = env && env.payload;
        if (!p) return;
        let peers;
        try { peers = bus.nodes(); } catch (e) { peers = []; }
        if (!peers.some((n) => n.name === from)) return; // registered peers only
        let topics = [];
        try {
            const scope = require('./scope');
            const consensus = require('./consensus');
            topics = consensus.list().filter((l) => {
                if (!l.scoped) return true; // public topic: nameable
                const ledger = consensus.get(l.topic);
                try {
                    return !!(ledger && ledger.scope && scope.canAccess({ scope: ledger.scope }, from));
                } catch (e) { return false; } // scope error: fail-closed (name withheld)
            }).map((l) => l.topic).slice(0, 200);
        } catch (e) { topics = []; }
        bus.send(from, 'gossip.reply', { reqId: p.reqId || null, topics, from: busName(bus) }).catch(() => { /* best-effort */ });
    });

    // (pass 58) The summary reply resolves the asker's pending gossipAsk.
    // Sender-bound like every reply leg (pass-51 rule): a peer that merely
    // observed the reqId cannot feed us a summary.
    bus.onDispatch('gossip.reply', (env) => {
        const payload = env && env.payload;
        if (!payload || !Array.isArray(payload.topics)) return;
        const pending = _pending.get(pendingKey(bus, payload.reqId));
        if (!pending) return; // unsolicited / late reply — drop
        if (pending.from && env.from !== pending.from) return;
        clearTimeout(pending.timer);
        _pending.delete(pendingKey(bus, payload.reqId));
        pending.resolve({
            asked: true,
            topics: payload.topics.filter((t) => typeof t === 'string' && /^[a-zA-Z0-9_-]+$/.test(t) && t.length <= 100).slice(0, 200)
        });
    });

    return { installed: true, already: false };
}

function busName(bus) {
    return (bus.status && bus.status().name) || null;
}

/**
 * (pass 56 / Wave A) Sync-surface status for the MCP/CLI layer: which
 * buses have dispatchers installed and whether the node has an agentId
 * (remote ballots attribute to it). Read-only; no secrets.
 */
function status() {
    const buses = [];
    _busRefs.forEach((bus, label) => {
        const s = (bus.status && bus.status()) || {};
        buses.push({
            bus: label,
            name: s.name || null,
            agentId: s.agentId || null,
            configured: !!s.configured,
            listening: !!s.listening,
            peers: Array.isArray(s.peers) ? s.peers.length : 0
        });
    });
    return {
        installedBuses: buses.length,
        buses,
        pending: _pending.size
    };
}

// Pull round-trips in flight: bus-specific key -> { resolve, timer }.
// WeakMap would be nicer but the key must be a string (bus has no stable
// object key); buses are few and long-lived, so a Map is fine — entries
// always resolve or time out.
const _pending = new Map();
function pendingKey(bus, reqId) {
    return (busName(bus) || 'bus') + ':' + String(reqId);
}

/**
 * Pull a topic's ledger from a peer. Resolves
 *   { pulled: true, merged: { adopted, created } }   — got it + merged
 *   { pulled: false, reason }                        — not found / timeout / refused
 * Never throws for wire-level failures (returns { pulled: false }).
 *
 * @param {object} bus - configured bus with the peer registered
 * @param {string} nodeName - peer to ask
 * @param {string} topic - consensus topic name
 * @param {object} [opts] - { timeoutMs: 8000 }
 */
async function pull(bus, nodeName, topic, opts = {}) {
    if (!bus || typeof bus.send !== 'function') {
        throw new Error('agora-sync.pull: bus required');
    }
    if (typeof topic !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(topic) || topic.length > 100) {
        return { pulled: false, reason: 'invalid_topic' };
    }
    const timeoutMs = Math.min(parseInt(opts.timeoutMs, 10) || 8000, 60000);
    const reqId = crypto.randomBytes(8).toString('hex');

    // Install reply leg on demand (pull-only nodes never installed).
    if (!_installed.has(bus)) install(bus);

    const result = await new Promise((resolve) => {
        const timer = setTimeout(() => {
            _pending.delete(pendingKey(bus, reqId));
            resolve({ pulled: false, reason: 'timeout' });
        }, timeoutMs);
        _pending.set(pendingKey(bus, reqId), { resolve, timer, from: nodeName });

        bus.send(nodeName, 'state.request', { topic, reqId }).catch((e) => {
            clearTimeout(timer);
            _pending.delete(pendingKey(bus, reqId));
            resolve({ pulled: false, reason: 'send_failed: ' + e.message });
        });
    });

    if (!result.pulled) return result;

    // Merge through consensus's validating seam — re-derives all derived
    // fields locally; the wire never declares status.
    let merged;
    try {
        merged = require('./consensus').mergeTopic({ ...result.ledger, syncedFrom: result.envelope.from });
    } catch (e) {
        return { pulled: true, merged: { merged: false, reason: 'merge_error: ' + e.message } };
    }
    return { pulled: true, merged };
}

/**
 * (pass 50 / next-wave 3) Distributed agora: cast a ballot on a PEER's
 * topic by envelope. The OWNER applies its full local gate stack (scope
 * resolves where the team lives; requireRegistry verifies the voter
 * against the OWNER's registry; quarantine; one vote) and acks the
 * verdict. Resolves:
 *   { voted: true, tally: { status, totalVotes } }   — accepted
 *   { voted: false, reason, code }                    — denied by a gate
 *   { voted: false, reason: 'timeout' | 'send_failed: …' }
 *
 * @param {object} bus - configured bus with the peer registered
 * @param {string} nodeName - the topic owner node
 * @param {string} topic - consensus topic name
 * @param {string} outcome - the ballot choice
 * @param {object} [opts] - { agentId (defaults to the bus agentId), timeoutMs: 8000 }
 */
async function vote(bus, nodeName, topic, outcome, opts = {}) {
    if (!bus || typeof bus.send !== 'function') {
        throw new Error('agora-sync.vote: bus required');
    }
    if (typeof topic !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(topic) || topic.length > 100) {
        return { voted: false, reason: 'invalid_topic' };
    }
    if (typeof outcome !== 'string' || !outcome) {
        return { voted: false, reason: 'invalid_outcome' };
    }
    const agentId = typeof opts.agentId === 'string' && opts.agentId
        ? opts.agentId
        : ((bus.status && bus.status().agentId) || busName(bus));
    if (!agentId) {
        return { voted: false, reason: 'no_agent_id' };
    }
    const timeoutMs = Math.min(parseInt(opts.timeoutMs, 10) || 8000, 60000);
    const reqId = crypto.randomBytes(8).toString('hex');

    if (!_installed.has(bus)) install(bus);

    const acked = await new Promise((resolve) => {
        const timer = setTimeout(() => {
            _pending.delete(pendingKey(bus, reqId));
            resolve({ voted: false, reason: 'timeout' });
        }, timeoutMs);
        _pending.set(pendingKey(bus, reqId), { resolve, timer, from: nodeName });
        bus.send(nodeName, 'vote', { topic, outcome, agentId, reqId }).catch((e) => {
            clearTimeout(timer);
            _pending.delete(pendingKey(bus, reqId));
            resolve({ voted: false, reason: 'send_failed: ' + e.message });
        });
    });
    return acked;
}

/**
 * Push a topic's LOCAL ledger to a peer (the return leg after voting on
 * a synced topic). Resolves { pushed: true, ok, handlers } or
 * { pushed: false, reason }. The OWNER side merges with the same
 * validating mergeTopic — never blind trust.
 *
 * @param {object} bus - configured bus with the peer registered
 * @param {string} nodeName - peer to push to (usually the topic owner)
 * @param {string} topic - consensus topic name
 */
async function push(bus, nodeName, topic) {
    if (!bus || typeof bus.send !== 'function') {
        throw new Error('agora-sync.push: bus required');
    }
    if (typeof topic !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(topic) || topic.length > 100) {
        return { pushed: false, reason: 'invalid_topic' };
    }
    if (!_installed.has(bus)) install(bus);
    let ledger;
    try {
        ledger = require('./consensus').exportTopic(topic);
    } catch (e) {
        return { pushed: false, reason: 'export_failed' };
    }
    if (!ledger) return { pushed: false, reason: 'not_found' };
    try {
        const r = await bus.send(nodeName, 'state.push', { ledger, from: busName(bus) });
        return { pushed: true, ok: r.ok, handlers: r.handlers };
    } catch (e) {
        return { pushed: false, reason: 'send_failed: ' + e.message };
    }
}

// ---------- pass 58 / Wave C: ledger hygiene + gossip ----------

const REAP_DEFAULT_MAX_AGE_MS = 24 * 3600 * 1000;  // synced ledgers age out after 24h
const REAP_MIN_INTERVAL_MS = 60 * 1000;             // reaper runs at most once/min per bus (pass-53 throttle precedent)
const GOSSIP_DEFAULT_INTERVAL_MS = 60 * 1000;       // gossip pull cycle
const GOSSIP_MAX_INTERVAL_MS = 30 * 60 * 1000;      // backoff ceiling
const GOSSIP_PEER_MIN_MS = 30 * 1000;               // per-peer pull floor (miss-flood guard)

// Reaper state per bus label: last-run gate only. The reaper NEVER holds
// topic state — the decision is per-ledger, local, re-derived.
const _reapState = new Map();

/**
 * Reap stale SYNCED ledgers (syncedFrom-stamped). Locally created ledgers
 * are UNREACHABLE — consensus.reapSynced refuses any ledger without the
 * stamp (hard guard inside consensus, not a filter here). Rules (prd-mesh
 * §4 Wave C): a synced ledger qualifies when it is past maxAge, OR terminal
 * (passed/rejected/expired) AND unreferenced by local msg. Reaped topics
 * are re-pullable by design — the pull seam is the recovery path.
 *
 * @param {object} [opts] - { maxAgeMs (default 24h), now, bus (labels the throttle key) }
 * @returns {{ reaped: string[], scanned: number, skipped?: 'throttled' }}
 */
function reap(opts = {}) {
    const busLabel = (opts.bus && busName(opts.bus)) || 'node';
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const maxAgeMs = Math.max(parseInt(opts.maxAgeMs, 10) || REAP_DEFAULT_MAX_AGE_MS, 60 * 1000);
    // Throttle: at most once per minute per bus. Miss-floods cannot turn
    // into disk floods (the pass-53 teams-refresh throttle precedent).
    const last = _reapState.get(busLabel) || 0;
    if (now - last < REAP_MIN_INTERVAL_MS) return { reaped: [], scanned: 0, skipped: 'throttled' };
    _reapState.set(busLabel, now);

    // Local references (msg) are read fresh each pass; msg absence degrades
    // to "unreferenced" (msg is an optional subsystem — hygiene cannot
    // require it). Reference convention: a msg conversation whose ID equals
    // the topic name (the JV-standup channel pattern) pins that ledger.
    // Terminal-and-REFERENCED synced ledgers survive the reaper.
    let refs = null;
    try {
        refs = new Set(require('./msg').list().map((c) => c.id));
    } catch (e) { refs = null; }

    const consensus = require('./consensus');
    let scanned = 0;
    const reaped = consensus.reapSynced((topic, v) => {
        scanned++;
        // v is a synced ledger by construction (hard guard in consensus).
        const age = now - v.created;
        if (age > maxAgeMs) return true;                                   // old synced snapshot: age out
        if (['passed', 'rejected', 'expired'].includes(v.status) && !(refs && refs.has(topic))) {
            return true;                                                   // terminal + unreferenced: done
        }
        return false;
    });
    return { reaped, scanned };
}

// ---------- gossip pull scheduler (pass 58 / Wave C) ----------

// Per-bus gossip loop state: one timer per bus, backoff on total failure,
// per-peer pull floor so one chatty peer cannot flood the wire.
const _gossip = new Map(); // busLabel -> { bus, timer, intervalMs, peers: Map(name -> lastPullMs), lastRoundMs }

function _gossipKey(bus) { return busName(bus) || ('bus#' + _gossip.size); }

/**
 * Gossip summary leg: what topics does a peer have that we don't?
 * Sends agora.gossip.request; the OWNER filters its OWN summary by the
 * asker's member set — a scoped topic is never named to a non-member
 * (scoped means unseen, the pass-50 rule, now on the summary leg too).
 *
 * @param {object} bus - configured bus with the peer registered
 * @param {string} nodeName - peer to ask
 * @param {object} [opts] - { timeoutMs }
 * @returns {Promise<{ asked: true, topics: string[] } | { asked: false, reason }>} - topics we lack
 */
async function gossipAsk(bus, nodeName, opts = {}) {
    if (!bus || typeof bus.send !== 'function') throw new Error('agora-sync.gossipAsk: bus required');
    const timeoutMs = Math.min(parseInt(opts.timeoutMs, 10) || 8000, 60000);
    const reqId = crypto.randomBytes(8).toString('hex');
    if (!_installed.has(bus)) install(bus);
    const result = await new Promise((resolve) => {
        const timer = setTimeout(() => {
            _pending.delete(pendingKey(bus, reqId));
            resolve({ asked: false, reason: 'timeout' });
        }, timeoutMs);
        _pending.set(pendingKey(bus, reqId), { resolve, timer, from: nodeName });
        bus.send(nodeName, 'gossip.request', { reqId }).catch((e) => {
            clearTimeout(timer);
            _pending.delete(pendingKey(bus, reqId));
            resolve({ asked: false, reason: 'send_failed: ' + e.message });
        });
    });
    if (!result.asked) return { asked: false, reason: result.reason };
    return { asked: true, topics: result.topics };
}

/**
 * One gossip round: ask every registered peer for its topic summary and
 * merge-then-pull details for topics we lack. Bounded by design: summaries
 * first; detail pulls only for topics below local quorum (merge-then-pull,
 * prd-mesh §4 Wave C); per-peer pull floor enforced.
 *
 * @param {object} bus - configured bus (peers = registered nodes)
 * @param {object} [opts] - { timeoutMs, maxPulls (per round), now }
 * @returns {Promise<{ peers: number, topics: number, pulls: { topic, node }[] }>} 
 */
async function gossipRound(bus, opts = {}) {
    if (!bus || typeof bus.nodes !== 'function') throw new Error('agora-sync.gossipRound: bus required');
    if (!_installed.has(bus)) install(bus);
    let peers = [];
    try { peers = (bus.nodes() || []).filter((p) => p && p.name); } catch (e) { peers = []; }
    const maxPulls = Math.max(parseInt(opts.maxPulls, 10) || 10, 1);
    // Per-peer pull floor state: shared with startGossip's scheduler (same
    // map), and lazily created here so STANDALONE rounds are floor-guarded
    // too — a caller hammering gossipRound directly must not bypass the
    // miss-flood guard.
    const key = _gossipKey(bus);
    let state = _gossip.get(key);
    if (!state) {
        state = { bus, timer: null, peers: new Map(), stopped: false, opts: {} };
        _gossip.set(key, state);
    }
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();

    const pulls = [];
    let topics = 0;
    const consensus = require('./consensus');
    const localList = consensus.list();
    for (const p of peers) {
        const lastPull = (state && state.peers.get(p.name)) || 0;
        if (now - lastPull < GOSSIP_PEER_MIN_MS) continue; // per-peer floor
        if (state) state.peers.set(p.name, now);
        let summary;
        try {
            summary = await gossipAsk(bus, p.name, { timeoutMs: opts.timeoutMs });
        } catch (e) { summary = { asked: false, reason: e.message }; }
        if (!summary.asked) continue; // offline peer: skipped (backoff handled at the scheduler level)
        topics += summary.topics.length;
        for (const topic of summary.topics) {
            if (pulls.length >= maxPulls) break;
            const local = consensus.get(topic);
            const view = localList.find((l) => l.topic === topic);
            if (view && ['passed', 'rejected', 'expired'].includes(view.status)) continue; // terminal locally: nothing to learn
            if (local && local.votes && Object.keys(local.votes).length >= (local.minQuorum || 2)) continue; // at/over quorum: no pull
            pulls.push({ topic, node: p.name });
        }
        if (pulls.length >= maxPulls) break;
    }
    for (const job of pulls) {
        // Bounded by the round's timeout: a silent peer must not stretch a
        // gossip round to the pull seam's default 8s per topic.
        await pull(bus, job.node, job.topic, { timeoutMs: opts.timeoutMs }).catch(() => {});
    }
    return { peers: peers.length, topics, pulls };
}

/**
 * Interval gossip scheduler: starts a per-bus timer (one per bus), backs
 * off ×2 on fully-failed rounds (offline peers), capped at 30 min. Returns
 * a stop handle. Idempotent per bus: a second start() replaces nothing —
 * the existing loop keeps running.
 *
 * @param {object} bus - configured bus
 * @param {object} [opts] - { intervalMs (default 60s), maxPulls, timeoutMs }
 * @returns {{ stop: () => void }}
 */
function startGossip(bus, opts = {}) {
    if (!bus) throw new Error('agora-sync.startGossip: bus required');
    const key = _gossipKey(bus);
    // Adopt-or-start: a bare state may exist from standalone gossipRound
    // calls (floor guard) — upgrade it instead of refusing to schedule.
    let state = _gossip.get(key);
    if (state && state.started) return { stop: () => stopGossip(bus), already: true };
    if (!state) {
        state = { bus, timer: null, peers: new Map(), stopped: false, opts: {} };
        _gossip.set(key, state);
    }
    state.started = true;
    state.bus = bus;
    state.stopped = false;
    state.opts = opts;
    state.intervalMs = Math.min(Math.max(parseInt(opts.intervalMs, 10) || GOSSIP_DEFAULT_INTERVAL_MS, 5000), GOSSIP_MAX_INTERVAL_MS);

    function schedule(delayMs) {
        if (state.stopped) return;
        state.timer = setTimeout(async () => {
            if (state.stopped) return;
            try {
                const r = await gossipRound(bus, state.opts);
                // Fully-failed round (peers registered but ALL skipped/failed)
                // → back off; any success resets the interval.
                const failed = r.peers > 0 && r.topics === 0 && r.pulls.length === 0;
                state.intervalMs = failed
                    ? Math.min(state.intervalMs * 2, GOSSIP_MAX_INTERVAL_MS)
                : (parseInt(state.opts.intervalMs, 10) || GOSSIP_DEFAULT_INTERVAL_MS);
            } catch (e) { state.intervalMs = Math.min(state.intervalMs * 2, GOSSIP_MAX_INTERVAL_MS); }
            schedule(state.intervalMs);
        }, delayMs);
    }
    schedule(state.intervalMs);
    return { stop: () => stopGossip(bus), already: false };
}

function stopGossip(bus) {
    const key = _gossipKey(bus);
    const state = _gossip.get(key);
    if (!state) return { stopped: false };
    state.stopped = true;
    if (state.timer) clearTimeout(state.timer);
    _gossip.delete(key);
    return { stopped: true };
}

module.exports = { install, pull, push, vote, status, reap, gossipAsk, gossipRound, startGossip, stopGossip };
