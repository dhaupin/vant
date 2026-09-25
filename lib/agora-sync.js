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
        clearTimeout(pending.timer);
        _pending.delete(pendingKey(bus, payload.reqId));
        pending.resolve({ pulled: payload.ledger ? true : false, reason: payload.ledger ? null : 'not_found', envelope: { from: env.from }, ledger: payload.ledger || null });
    });

    return { installed: true, already: false };
}

function busName(bus) {
    return (bus.status && bus.status().name) || null;
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
        _pending.set(pendingKey(bus, reqId), { resolve, timer });

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
        _pending.set(pendingKey(bus, reqId), { resolve, timer });
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

module.exports = { install, pull, push, vote };
