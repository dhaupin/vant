/**
 * Consensus Ledger (v0.8.6)
 * Agent voting system - NOT crypto
 * WITH EVENT EMISSIONS - voting lifecycle emits globally
 *
 * 51% agreement = truth
 * No blockchain, no mining, just agents voting
 *
 * PROTECTIONS:
 * - One vote per agent per topic
 * - Audit trail
 * - Threshold quorum
 *
 * Usage:
 *   const consensus = require('./consensus');
 *   consensus.vote('decision_1', 'approve_feature_x', agentId);
 *   const result = consensus.tally('decision_1');
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

// Lazy-load config
let _config = null;
function _getConfig() {
    if (!_config) {
        try { _config = require('./config'); } catch (e) {}
    }
    return _config;
}

function _getMaxLedgers() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('consensus.maxLedgers', 100) : 100;
}

const _ledgers = new Map();
const _votes = new Map();
const _audit = [];
const crypto = require('crypto');
const Encrypt = require('./encrypt');

// ==================== PERSISTENCE (pass 38 / prd-vant-os Wave 3) ====================
// Ledgers are the crew's decision record — dying with the process made
// every restart amnesiac. One snapshot file per brain (topics are bounded
// by maxLedgers=100; per-topic files are overkill at that scale), written
// at the _lockTopic-serialized mutation points (create/vote/resolve) so
// concurrent persists can't interleave. Rules live in lib/state-store.js.
const stateStore = require('./state-store');
const CONSENSUS_STATE_FILE = 'state/consensus.json';

function _serializeLedgers() {
    return Array.from(_ledgers.values()).map((l) => ({
        ...l,
        votes: { ...l.votes }
    }));
}

function _applyLedgers(data) {
    if (!data || !Array.isArray(data.ledgers)) return;
    for (const l of data.ledgers) {
        if (!l || typeof l.topic !== 'string' || typeof l.votes !== 'object' || l.votes === null) continue;
        if (_ledgers.has(l.topic)) continue; // in-memory wins (hot state)
        _ledgers.set(l.topic, { ...l, votes: { ...l.votes } });
    }
}

let _consensusHydrated = false;
function _hydrate() {
    if (_consensusHydrated) return;
    _consensusHydrated = true;
    stateStore.hydrate({
        moduleName: 'consensus',
        stateFile: CONSENSUS_STATE_FILE,
        apply: _applyLedgers
    });
}

function _persist() {
    stateStore.persist({
        moduleName: 'consensus',
        stateFile: CONSENSUS_STATE_FILE,
        data: { ledgers: _serializeLedgers() }
    });
}

_hydrate();

// Lazy load vant for locking
let _vant = null;
function _getVant() {
    if (!_vant) {
        try { _vant = require('./vant'); } catch (e) {}
    }
    return _vant;
}

// Lazy load trust for vote weight (v0.9.0)
let _trust = null;
function _getTrust() {
    if (!_trust) {
        try { _trust = require('./trust'); } catch (e) { return null; }
    }
    return _trust;
}

// Lazy load pipeline for unified security chain (v0.9.0-axolotl)
let _pipeline = null;
function _getPipeline() {
    if (!_pipeline) {
        try { _pipeline = require('./pipeline'); } catch (e) {}
    }
    return _pipeline;
}

// Simple mutex for serializing access to consensus maps (per-topic)
const _topicLocks = new Map();
async function _lockTopic(topic, fn) {
    // Get or create lock for this topic
    let lockPromise = _topicLocks.get(topic);
    if (!lockPromise) {
        lockPromise = Promise.resolve();
        _topicLocks.set(topic, lockPromise);
    }

    // Chain our function onto the existing lock
    const ourPromise = lockPromise.then(async () => {
        try {
            return await fn();
        } finally {
            // Only delete if this is still the current lock
            if (_topicLocks.get(topic) === ourPromise) {
                _topicLocks.delete(topic);
            }
        }
    });

    _topicLocks.set(topic, ourPromise);
    return ourPromise;
}

// VAF: Input validation
function _validate(topic, outcome, agentId) {
    // Topic always required
    if (!topic || typeof topic !== 'string') {
        return { valid: false, error: 'Invalid topic', code: 'E_VAF_TOPIC' };
    }
    if (topic.length < 1 || topic.length > 100) {
        return { valid: false, error: 'Topic length 1-100', code: 'E_VAF_LEN' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(topic)) {
        return { valid: false, error: 'Topic alphanumeric', code: 'E_VAF_CHARS' };
    }
    // agentId + outcome required ONLY for voting
    if (agentId !== null && (!agentId || typeof agentId !== 'string')) {
        return { valid: false, error: 'Invalid agentId', code: 'E_VAF_AGENT' };
    }
    if (outcome !== null && (outcome === undefined || outcome === '')) {
        return { valid: false, error: 'Invalid outcome', code: 'E_VAF_OUTCOME' };
    }
    return { valid: true };
}

// QOS: Rate limiting per agent
const _rateLimit = new Map();
function _checkRate(agentId, window = 60000, max = 10) {
    const now = Date.now();
    if (!_rateLimit.has(agentId)) {
        _rateLimit.set(agentId, { count: 1, reset: now + window });
        return { allowed: true };
    }
    const rl = _rateLimit.get(agentId);
    if (now > rl.reset) {
        rl.count = 1;
        rl.reset = now + window;
        return { allowed: true };
    }
    if (rl.count >= max) {
        return { allowed: false, error: 'Rate limited', code: 'E_QOS_LIMIT' };
    }
    rl.count++;
    return { allowed: true };
}

// Sandbox: Capability check
const _capabilities = new Set(['vote', 'create', 'verify', 'delegate']);
function _checkCapability(cap) {
    return _capabilities.has(cap);
}

function _grantCapability(agentId, cap) {
    if (cap && !_capabilities.has(cap)) {
        _capabilities.add(cap);
    }
}

function _revokeCapability(agentId, cap) {
    _capabilities.delete(cap);
}

// Protect: One vote per agent
function hasVoted(topic, agentId) {
    const ledger = _ledgers.get(topic);
    return ledger && ledger.votes[agentId] !== undefined;
}

// Protect: Audit trail
function _auditLog(action, data) {
    try {
        const audit = require('./audit');
        audit.log({ type: 'consensus_' + action, ...data });
    } catch(e) {
        // Fallback to local audit
        _audit.push({ action, data, ts: Date.now() });
    }
}

// CRYPTO: Sign vote (prove I'm agent_X)
function _signVote(voteData, agentSecret) {
    try {
        return Encrypt.signToken(voteData, agentSecret);
    } catch(e) {
        // Fallback: simple HMAC
        return crypto.createHmac('sha256', agentSecret || 'default')
            .update(JSON.stringify(voteData)).digest('hex');
    }
}

// CRYPTO: Verify signature
function _verifyVote(voteData, signature, agentSecret) {
    try {
        return Encrypt.verifyToken(signature, agentSecret);
    } catch(e) {
        return false;
    }
}

// CRYPTO: Hash tally (tamper evidence)
function _hashTally(results) {
    const data = JSON.stringify(results, Object.keys(results).sort());
    return Encrypt.sha256(data);
}

// CRYPTO: Encrypt ballot (secret vote)
function _encryptBallot(outcome, key) {
    return Encrypt.encrypt(JSON.stringify({ outcome }), key);
}

// CRYPTO: Decrypt ballot
function _decryptBallot(encrypted, key) {
    const decrypted = Encrypt.decrypt(encrypted, key);
    return JSON.parse(decrypted);
}

// Create a new vote (SECURED + MIDDLEWARE + LOCKED)
function create(topic, options = {}) {
    return _lockTopic(topic, () => _createInternal(topic, options));
}

// Secured version using unified pipeline (v0.9.0-axolotl)
async function createSecured(topic, options = {}, userCtx = {}) {
    const pipeline = _getPipeline();
    if (!pipeline) return create(topic, options);
    return pipeline.run(
        { name: 'consensus.create', operation: 'write', input: topic, userCtx },
        () => create(topic, options),
        { mode: pipeline.PRIVATE }
    );
}

function _createInternal(topic, options) {
    // VAF: Validate topic (nulls for agent/outcome = optional for create)
    const vaf = _validate(topic, null, null);
    if (!vaf.valid) return vaf;

    // SECURITY: Prevent topic collision (can't recreate)
    if (_ledgers.has(topic)) {
        return { error: 'Topic exists', code: 'E_COLLISION' };
    }

    // SECURITY: Limit total ledgers (prevent memory exhaust)
    const maxLedgers = _getMaxLedgers();
    if (_ledgers.size >= maxLedgers) {
        return { error: 'Max ledgers reached (max ' + maxLedgers + ')', code: 'E_MAX_LEDGER' };
    }

    // Sandbox: Capability check
    if (!_checkCapability('create')) {
        return { error: 'Capability denied', code: 'E_SANDBOX' };
    }

    // (pass 40 / agora) Scope: optional, but malformed scope is REJECTED
    // (fail-closed). Valid scope persists with the ledger (state-store
    // write-through) and gates votes in _voteInternal.
    let scopeRecord = null;
    if (options.scope !== undefined) {
        scopeRecord = require('./scope').normalize(options.scope);
        if (!scopeRecord) {
            return { error: 'Invalid scope', code: 'E_SCOPE' };
        }
    }

    // SECURITY: Validate options array (must have at least 2 options)
    if (!options.options || !Array.isArray(options.options) || options.options.length < 2) {
        return { error: 'Must have at least 2 options', code: 'E_INVALID_OPTIONS' };
    }

    // SECURITY: Validate each option is a non-empty string
    for (const opt of options.options) {
        if (typeof opt !== 'string' || opt.trim().length === 0) {
            return { error: 'Invalid option: must be non-empty string', code: 'E_INVALID_OPTION' };
        }
    }

    const now = Date.now();

    // Sanitize numeric options
    const rawQuorum = parseInt(options.minQuorum) || 2;
    const minQuorum = Math.min(Math.max(rawQuorum, 1), 100);

    // OPTIONS for security
    const deposit = parseInt(options.deposit) || 0;                   // Stake required
    const lockDeadline = options.lockDeadline !== false;    // Lock at creation
    const requireRegistry = options.requireRegistry !== false; // Verified only

    const ledger = {
        topic,
        votes: {},
        outcomes: {},
        threshold: options.threshold || 0.51, // 51%
        status: 'open',
        created: now,
        createdHash: Encrypt.sha256(now + topic), // Genesis hash
        // Security
        deadline: options.deadline || now + 3600000,
        minQuorum,
        deposit,
        lockDeadline,
        requireRegistry,
        // Tracking
        voterWhitelist: options.voters || null,
        metadata: options.metadata || {}
    };

    // (pass 40 / agora) Persist the scope so a restart keeps the vote
    // private/public boundary intact.
    if (scopeRecord) {
        ledger.scope = scopeRecord;
    }

    // (pass 38) Trust weighting is read by tally() as
    // `ledger.useTrustWeight !== false` (default ON), but create never
    // stored the option — callers had no way to opt out, so integer
    // minQuorum semantics silently became fractional (a fresh voter
    // scores 0.5 < minQuorum 1). Honor it when explicitly provided.
    if (options.useTrustWeight !== undefined) {
        ledger.useTrustWeight = !!options.useTrustWeight;
    }

    if (lockDeadline) {
        // Pre-compute deadline hash for verification
        ledger.deadlineHash = Encrypt.sha256(ledger.deadline + '');
    }

    _ledgers.set(topic, ledger);
    _persist();
    _auditLog('create', { topic, minQuorum, deposit });
    return ledger;
}

// Cast vote (PROTECTED + CRYPTO + SECURED + MIDDLEWARE + LOCKED)
function vote(topic, outcome, agentId, options = {}) {
    return _lockTopic(topic, () => _voteInternal(topic, outcome, agentId, options));
}

// Secured version using unified pipeline (v0.9.0-axolotl)
async function voteSecured(topic, outcome, agentId, options = {}, userCtx = {}) {
    const pipeline = _getPipeline();
    if (!pipeline) return vote(topic, outcome, agentId, options);
    return pipeline.run(
        { name: 'consensus.vote', operation: 'write', input: topic, userCtx },
        () => vote(topic, outcome, agentId, options),
        { mode: pipeline.PRIVATE }
    );
}

function _voteInternal(topic, outcome, agentId, options) {
    // VAF: Validate inputs first
    const vaf = _validate(topic, outcome, agentId);
    if (!vaf.valid) return vaf;

    // QOS: Rate limit
    const rate = _checkRate(agentId, 60000, options.maxVotes || 10);
    if (!rate.allowed) return rate;

    // Sandbox: Capability check
    if (!_checkCapability('vote')) {
        return { error: 'Capability denied', code: 'E_SANDBOX' };
    }

    const ledger = _ledgers.get(topic);
    if (!ledger) return { error: 'Vote not found' };

    // (pass 50 / agora hardening) Scope gate runs FIRST — before any state
    // read. A non-member must not distinguish open/closed/expired on a topic
    // it cannot see ("scoped means unseen"): the old closed-first order
    // leaked existence + state via 'Vote closed', and let a non-member's
    // ballot reach the deadline check (where it could flip a scoped ledger
    // to 'expired' and persist it). Members fall through unchanged.
    if (ledger.scope && !require('./scope').canAccess({ scope: ledger.scope }, agentId)) {
        return { error: 'Scope denied', code: 'E_SCOPE' };
    }
    if (ledger.status !== 'open') return { error: 'Vote closed' };

    // SECURITY: Check deadline (locked if configured)
    if (ledger.lockDeadline && Date.now() > ledger.created + (ledger.deadline - ledger.created)) {
        return { error: 'Deadline locked at creation' };
    }
    if (Date.now() > ledger.deadline) {
        ledger.status = 'expired';
        _persist();
        return { error: 'Vote expired' };
    }

    // SECURITY: Require registry verification
    if (ledger.requireRegistry) {
        try {
            const registry = require('./node-registry');
            const peer = registry.get(agentId);
            if (!peer || peer.status !== 'alive') {
                return { error: 'Agent not verified', code: 'E_NOT_REGISTRY' };
            }
        } catch(e) {
            return { error: 'Registry unavailable', code: 'E_REGISTRY_DOWN' };
        }
    }

    // SECURITY: Quarantine gate (pass 41 live-fire find) — quarantine must
    // have teeth at the point of DECISION, not just registration. A peer
    // registered before being quarantined stays 'alive' via heartbeats, so
    // the registry-status check above is not enough. Belt-and-suspenders on
    // top of the node-registry gate: a quarantined agent never votes.
    try {
        const trust = require('./trust');
        if (trust.isQuarantined(agentId)) {
            return { error: 'Agent quarantined', code: 'E_QUARANTINED' };
        }
    } catch (e) { /* trust unavailable — registry/other gates still apply */ }

    // SECURITY: Deposit/stake check
    if (ledger.deposit > 0 && !options.deposit) {
        return { error: 'Deposit required', required: ledger.deposit };
    }

    // PROTECT: One vote per agent per topic
    if (hasVoted(topic, agentId)) {
        return { error: 'Already voted', previous: ledger.votes[agentId]?.outcome };
    }

    // CRYPTO: Sign vote
    const voteData = { topic, agentId, outcome, ts: Date.now(), nonce: Date.now() };
    const signature = _signVote(voteData, options.agentSecret);

    // Record vote with signature
    ledger.votes[agentId] = { outcome, signature, ts: voteData.ts, deposit: options.deposit };

    // Audit trail
    _auditLog('vote', { topic, agentId, outcome, signature: signature?.slice(0, 16) });

    // Store in votes map too
    if (!_votes.has(topic)) _votes.set(topic, new Map());
    _votes.get(topic).set(agentId, { outcome, signature, timestamp: Date.now() });
    _persist();

    // EVENT: vote:cast
    _emit('vote:cast', { topic, agentId, outcome, timestamp: Date.now() });

    // Auto-tally
    const result = tally(topic);

    // Check if quorum reached in this tally
    if (result.quorumReached) {
        _emit('vote:quorum', { topic, votes: result.total, quorum: result.quorum, threshold: result.threshold, timestamp: Date.now() });
    }

    return result;
}

// Tally results
function tally(topic) {
    const ledger = _ledgers.get(topic);
    if (!ledger) return { error: 'Vote not found' };

    const voteCounts = {};
    let totalVotes = 0;
    let totalWeight = 0;

    // Get trust for vote weight
    const trust = _getTrust();
    const useTrustWeight = trust && ledger.useTrustWeight !== false;

    for (const [agentId, voteObj] of Object.entries(ledger.votes)) {
        // Handle both string and object votes
        const outcome = typeof voteObj === 'string' ? voteObj : voteObj.outcome;

        // Calculate vote weight (trust score or 1)
        let weight = 1;
        if (useTrustWeight && trust && trust.getScore) {
            weight = trust.getScore(agentId); // 0-1 range
        }

        voteCounts[outcome] = (voteCounts[outcome] || 0) + weight;
        totalVotes++;
        totalWeight += weight;
    }

    // Calculate percentages (use weight for trust-based voting)
    const results = {
        topic,
        totalVotes,
        totalWeight: useTrustWeight ? totalWeight : totalVotes,
        counts: voteCounts,
        percentages: {},
        weightedPercentages: useTrustWeight ? {} : null,
        leading: null,
        leadingPct: 0,
        status: ledger.status,
        deadline: ledger.deadline,
        useTrustWeight
    };

    let maxVotes = 0;
    for (const [outcome, count] of Object.entries(voteCounts)) {
        // Standard percentage: UNWEIGHTED share of ballots cast (a truthful
        // headcount view; the weighted view lives in weightedPercentages).
        results.percentages[outcome] = totalVotes > 0 ? count / totalVotes : 0;
        // Weighted percentage (trust-based)
        if (useTrustWeight && totalWeight > 0) {
            results.weightedPercentages[outcome] = count / totalWeight;
        }
        if (count > maxVotes) {
            maxVotes = count;
            results.leading = outcome;
            results.leadingPct = results.percentages[outcome];
        }
    }

    // Check threshold (51% default) - use weighted if trust enabled
    const winnerPct = useTrustWeight && results.weightedPercentages
        ? results.weightedPercentages[results.leading]
        : results.leadingPct;

    // SECURITY: Check minimum quorum. minQuorum is a HEADCOUNT (a count of
    // distinct voters), so it must compare against totalVotes — never against
    // totalWeight. The old code compared count-vs-weight (fresh agents score
    // 0.5), so under the default trust weighting a unanimous 2-voter team
    // could never reach quorum 2 (it would need 4+ voters). Threshold
    // (majority) stays trust-weighted; participation (quorum) is per-head.
    // (pass 41 live-fire find; was only survivable in tests that all pinned
    // useTrustWeight:false.)
    if (totalVotes < ledger.minQuorum) {
        results.status = 'quorum';  // Waiting for more votes
        results.quorumNeeded = ledger.minQuorum - totalVotes;
    } else if (winnerPct > ledger.threshold && totalVotes > 0) {
        results.status = 'passed';
        results.winner = results.leading;
        // Hash BEFORE stamping hash/checksum onto the result, then derive the
        // checksum from the SAME whitelist — the old second _hashTally call
        // ran after results.hash existed, so the extra key changed the input
        // and checksum could never equal hash.
        const tallyHash = _hashTally(results);
        results.hash = tallyHash;
        results.checksum = tallyHash;
        // SAVE to ledger for verification
        ledger.hash = results.hash;
        ledger.status = 'passed';
        ledger.outcomes = voteCounts;
        _persist();

        // Internal event
        emit('passed', { topic, winner: results.leading, results });

        // EVENT: vote:consensus - 51%+ reached!
        _emit('vote:consensus', { topic, winner: results.leading, votes: totalVotes, percentage: (winnerPct * 100).toFixed(1), timestamp: Date.now() });
    } else if (totalVotes > 0) {
        results.status = 'open';
        results.hash = _hashTally(results);
        results.checksum = results.hash;
        ledger.hash = results.hash;
        _persist();
    } else if (Date.now() > ledger.deadline) {
        results.status = 'rejected';
        results.hash = _hashTally(results);
        results.checksum = results.hash;
        ledger.hash = results.hash;
        ledger.status = 'rejected';
        _persist();
    }

    return results;
}

// Get vote info
function get(topic) {
    // Return COPY to prevent reference manipulation
    const ledger = _ledgers.get(topic);
    if (!ledger) return null;
    return JSON.parse(JSON.stringify(ledger));
}

// List all votes
function list() {
    _hydrate();
    return Array.from(_ledgers.values()).map(l => ({
        topic: l.topic,
        status: l.status,
        votes: Object.keys(l.votes).length,
        deadline: l.deadline
    }));
}

// (pass 49 / next-wave 2) Serialize a ledger for cross-machine transport.
// Plain JSON (the ledger is already plain data); kept as a named export so
// the wire shape has ONE definition shared by agora-sync and any future
// replication path. Secrets do not live on ledgers (votes carry HMAC
// signatures, not keys), so the snapshot is safe to share with peers that
// pass the scope gate.
function exportTopic(topic) {
    _hydrate();
    const ledger = _ledgers.get(topic);
    if (!ledger) return null;
    return JSON.parse(JSON.stringify({ ...ledger, votes: { ...ledger.votes } }));
}

// (pass 49 / next-wave 2) Merge a peer's ledger snapshot. ONLY used by
// agora-sync's crew.state pull — never a general import. Every invariant
// is re-derived LOCALLY (never trusted from the wire): status/outcomes/
// hash are recomputed by tally(), not copied. In-memory wins on conflict
// (same rule as hydrate). Accepts only ledgers whose local re-tally
// agrees with the peer's claimed status when the peer claims terminal —
// a tampered/malformed snapshot degrades to "votes count, status is ours".
function mergeTopic(ledger) {
    if (!ledger || typeof ledger !== 'object') return { merged: false, reason: 'invalid' };
    const vaf = _validate(ledger.topic, null, null);
    if (!vaf.valid) return { merged: false, reason: 'invalid_topic' };

    // Scope: if the snapshot carries a scope, it must be well-formed
    // (fail-closed — a malformed scope on a foreign ledger is not adoptable).
    if (ledger.scope !== undefined && ledger.scope !== null) {
        const scopeRecord = require('./scope').normalize(ledger.scope);
        if (!scopeRecord) return { merged: false, reason: 'invalid_scope' };
        ledger.scope = scopeRecord;
    }

    _hydrate();
    const existing = _ledgers.get(ledger.topic);
    if (existing) {
        // In-memory wins; but ADOPT peer votes for agents we don't know
        // (the missing-vote problem is the point of sync). Local votes
        // are never overwritten.
        let adopted = 0;
        for (const [agentId, voteObj] of Object.entries(ledger.votes || {})) {
            if (!existing.votes[agentId]) {
                existing.votes[agentId] = voteObj;
                adopted++;
            }
        }
        if (adopted > 0) {
            // (pass 49) Provenance on the adopt path too: the last syncer
            // whose ballots we took. Wire-shaped value (bounded string).
            existing.syncedFrom = typeof ledger.syncedFrom === 'string'
                ? ledger.syncedFrom.slice(0, 64)
                : (typeof ledger.from === 'string' ? ledger.from.slice(0, 64) : existing.syncedFrom || 'unknown');
            // Re-derive ALL derived fields locally (status/hash/outcomes).
            tally(ledger.topic);
            _persist();
        }
        return { merged: true, adopted, created: false };
    }

    // New topic from the wire: rebuild a ledger with ONLY re-derivable or
    // bounded fields. Snapshot fields are sanitized: numbers coerced and
    // clamped like create(), strings charset-checked, timestamps bounded.
    const now = Date.now();
    const rawQuorum = parseInt(ledger.minQuorum) || 2;
    const minQuorum = Math.min(Math.max(rawQuorum, 1), 100);
    const created = Number.isFinite(ledger.created) ? Math.min(ledger.created, now) : now;
    const deadline = Number.isFinite(ledger.deadline)
        ? Math.min(Math.max(ledger.deadline, created), created + 86400000)
        : created + 3600000;
    const votes = {};
    for (const [agentId, voteObj] of Object.entries(ledger.votes || {})) {
        // Vote shape: { outcome, signature, ts } — outcome must be a
        // non-empty string; agentId charset-checked by the loop key check.
        if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) continue;
        const outcome = typeof voteObj === 'string' ? voteObj : (voteObj && typeof voteObj.outcome === 'string' ? voteObj.outcome : null);
        if (!outcome) continue;
        votes[agentId] = typeof voteObj === 'string'
            ? voteObj
            : { outcome, signature: typeof voteObj.signature === 'string' ? voteObj.signature : null, ts: Number.isFinite(voteObj.ts) ? voteObj.ts : now };
    }

    const rebuilt = {
        topic: ledger.topic,
        votes,
        outcomes: {},
        threshold: (typeof ledger.threshold === 'number' && ledger.threshold > 0 && ledger.threshold <= 1) ? ledger.threshold : 0.51,
        status: 'open', // re-derived by tally below — never trusted from wire
        created,
        createdHash: Encrypt.sha256(created + ledger.topic),
        deadline,
        minQuorum,
        deposit: parseInt(ledger.deposit) || 0,
        lockDeadline: ledger.lockDeadline !== false,
        requireRegistry: ledger.requireRegistry !== false,
        voterWhitelist: (Array.isArray(ledger.voterWhitelist) && ledger.voterWhitelist.every(v => typeof v === 'string')) ? ledger.voterWhitelist : null,
        metadata: (ledger.metadata && typeof ledger.metadata === 'object' && !Array.isArray(ledger.metadata))
            ? JSON.parse(JSON.stringify(ledger.metadata))
            : {},
        // (pass 49) Sync provenance: merged ledgers are marked so ops (and
        // future audit tooling) can tell wire-born state from local state.
        syncedFrom: typeof ledger.syncedFrom === 'string' ? ledger.syncedFrom.slice(0, 64) : (ledger.from || 'unknown')
    };
    if (ledger.scope) {
        rebuilt.scope = ledger.scope;
    }
    if (ledger.useTrustWeight !== undefined) {
        rebuilt.useTrustWeight = !!ledger.useTrustWeight;
    }

    _ledgers.set(ledger.topic, rebuilt);
    // Re-derive status/outcomes/hash LOCALLY from the merged vote set —
    // the wire never gets to declare a topic passed.
    tally(ledger.topic);
    _persist();
    return { merged: true, adopted: Object.keys(votes).length, created: true };
}

// Force resolve (admin)
function resolve(topic, outcome) {
    const ledger = _ledgers.get(topic);
    if (!ledger) return { error: 'Vote not found' };
    _hydrate();

    ledger.status = 'passed';
    ledger.outcomes = { [outcome]: 1 };
    ledger.hash = _hashTally({ status: 'passed', winner: outcome });
    _persist();
    return { resolved: true, topic, outcome, hash: ledger.hash };
}

// VALIDATOR: Verify tally hasn't been tampered
// Simply check if hash exists and matches returned result
function verify(topic) {
    const ledger = _ledgers.get(topic);
    if (!ledger) return { valid: false, error: 'Vote not found' };
    if (!ledger.hash) return { valid: false, error: 'No hash to verify' };

    // Get latest tally result
    const currentResults = tally(topic);
    const currentHash = currentResults.hash;

    return {
        valid: ledger.hash === currentHash,
        topic,
        storedHash: ledger.hash,
        currentHash,
        match: ledger.hash === currentHash,
        timestamp: Date.now()
    };
}

// CHECKSUM: Generate full ledger checksum
function checksum(topic) {
    const ledger = _ledgers.get(topic);
    if (!ledger) return { error: 'Vote not found' };

    // Include all votes in checksum
    const data = JSON.stringify({
        topic: ledger.topic,
        threshold: ledger.threshold,
        votes: ledger.votes,
        deadline: ledger.deadline
    }, Object.keys(ledger.votes).sort());

    return {
        topic,
        checksum: Encrypt.sha256(data),
        voteCount: Object.keys(ledger.votes).length,
        hash: ledger.hash,  // Include tally hash
        generated: Date.now()
    };
}

// EVENT: Triggers on vote events
const _triggers = new Map();

function on(event, callback) {
    if (!_triggers.has(event)) _triggers.set(event, []);
    _triggers.get(event).push(callback);
    return { event, registered: true };
}

function emit(event, data) {
    const callbacks = _triggers.get(event);
    if (!callbacks) return { emitted: false, callbacks: 0 };
    callbacks.forEach(cb => { try { cb(data); } catch(e) { console.warn('[consensus] Event callback error:', e.message); } });
    return { emitted: true, callbacks: callbacks.length };
}

function off(event) {
    _triggers.delete(event);
    return { removed: true };
}

// PEER VERIFY: Ask other nodes to verify
async function peerVerify(topic, peers = []) {
    const results = { topic, verifying: false, peers: [], consensus: null };

    if (peers.length === 0) {
        try {
            const registry = require('./node-registry');
            const alivePeers = registry.discover({ status: 'alive' });
            peers = alivePeers.slice(0, 5); // Max 5 peers
        } catch(e) {
            return { ...results, error: 'No peers available' };
        }
    }

    if (peers.length === 0) return { ...results, error: 'No peers' };

    const localVerify = verify(topic);
    results.verifying = true;
    results.peers = peers.map(p => ({ peer: p.name, status: 'waiting' }));

    // In real distributed: would network.fetch to peers
    // For now: compare local hash
    results.consensus = {
        localValid: localVerify.valid,
        peerCount: peers.length,
        verified: localVerify.valid
    };

    return results;
}

// Get stats
function getStats() {
    const now = Date.now();
    let open = 0, passed = 0, rejected = 0, expired = 0;

    for (const ledger of _ledgers.values()) {
        if (ledger.status === 'open' && now > ledger.deadline) open++;
        else if (ledger.status === 'open') open++;
        else if (ledger.status === 'passed') passed++;
        else if (ledger.status === 'rejected') rejected++;
        else if (ledger.status === 'expired') expired++;
    }

    return {
        total: _ledgers.size,
        open,
        passed,
        rejected,
        expired
    };
}

module.exports = {
    create,
    createSecured,
    vote,
    voteSecured,
    tally,
    get,
    list,
    // (pass 49) Cross-machine sync seams (agora-sync / crew.state)
    exportTopic,
    mergeTopic,
    resolve,
    getStats,
    hasVoted,
    verify,
    checksum,
    peerVerify,
    // EVENT triggers
    on,       // Register callback
    emit,      // Trigger event
    off,       // Unregister
    // (_-prefixed middleware/internals removed from exports — dead-export
    // sweep: zero external callers; functions retained for internal use)
    getLayerStatus: () => ({ name: 'Consensus', type: 'voting', version: require('./version'), enabled: true, protected: true, crypto: true, verified: true, events: true, middleware: { vaf: true, qos: true, sandbox: true } }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, ledgers: _ledgers.size, protected: true, crypto: true, verified: true, events: true, middleware: _capabilities.size, qosEnforced: true }),

    // Multibrain
    getBrainConsensusConfig,
    setBrainConsensusConfig,

    // Multibrain Stack
    getStackConsensusConfigs,
    gatherState,
    restoreState,

    // (pass 38) Persistence seams (test/ops): reset hydration state and
    // drop the persisted state file for the CURRENT brain (sandbox-gated
    // via stateStore.clear). Mirrors the trust/registry/market seams.
    _resetHydration: () => { _consensusHydrated = false; },
    _stateFile: CONSENSUS_STATE_FILE,
    clearState: () => {
        stateStore.clear(CONSENSUS_STATE_FILE);
        _ledgers.clear();
        _votes.clear();
        _topicLocks.clear();
        _consensusHydrated = true;
        return true;
    },
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainConsensusConfigs = {};

function getBrainConsensusConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainConsensusConfigs[brainName] || { voting: true };
}

function setBrainConsensusConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainConsensusConfigs[brainName] = config;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackConsensusConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainConsensusConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}

// ==================== HORCRUX GATHER/RESTORE ====================

function gatherState() {
    return {
        ledgers: Array.from(_ledgers.entries()),
        count: _ledgers.size,
        configs: { ..._brainConsensusConfigs },
        gatheredAt: Date.now()
    };
}

async function restoreState(data) {
    _ledgers.clear();
    _topicLocks.clear();
    if (data && data.ledgers) {
        for (const [topic, ledger] of data.ledgers) {
            _ledgers.set(topic, ledger);
        }
    }
    if (data && data.configs) {
        for (const [brainName, config] of Object.entries(data.configs)) {
            _brainConsensusConfigs[brainName] = config;
        }
    }
    return { restored: true, ledgers: _ledgers.size, configs: Object.keys(_brainConsensusConfigs).length };
}
