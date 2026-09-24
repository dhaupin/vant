/**
 * Trust - Reputation & Trust Score System (v0.8.6)
 * WITH EVENT EMISSIONS - trust operations emit globally
 *
 * Unified trust system across agents, teams, and orgs.
 * Integrates with succession, teams, and market.
 *
 * SECURITY CHAIN INTEGRATION:
 * - VAF: Input validation
 * - Sandbox: Capability checks
 * - QoS: Rate limiting
 * - Governance: Ethics checks
 *
 * Concepts:
 * - Trust Score: 0-1 float (0 = untrusted, 1 = fully trusted)
 * - History: Record of all interactions
 * - Karma: Cumulative trust over time
 * - Roles: Trust requirements per role
 *
 * Usage:
 *   const trust = require('./trust');
 *
 *   // Get trust score
 *   const score = trust.getScore(agentId);
 *
 *   // Record positive interaction
 *   trust.record(agentId, 'help', { positive: true, value: 0.1 });
 *
 *   // Record trade
 *   trust.recordTrade(sellerId, buyerId, price);
 *
 *   // Check if trusted enough
 *   trust.can(agentId, 'write_brain');
 *
 *   // Get trust chain
 *   const chain = trust.getChain(agentId);
 */

const EventEmitter = require('events');

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

// ==================== SECURITY CHAIN ====================

// VAF - Input validation
let _vaf = null;
function _getVAF() {
    if (!_vaf) {
        try { _vaf = require('./vaf'); } catch (e) { return null; }
    }
    return _vaf;
}

// Sandbox - Capability checks now via shared gate (lib/gate.js).
// QoS - Rate limiting via shared gate.
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) { return null; }
    }
    return _sandbox;
}

const gate = require('./gate');

// Governance - Ethics
let _governance = null;
function _getGovernance() {
    if (!_governance) {
        try { _governance = require('./governance'); } catch (e) { return null; }
    }
    return _governance;
}

// ==================== SECURITY HELPERS ====================

function _validateInput(input, operation) {
    const vaf = _getVAF();
    if (!vaf || !vaf.validate) {
        return { valid: true };
    }
    try {
        return vaf.validate(input, operation);
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

// Capability/rate-limit gates delegate to the shared safe-by-default gate
// (lib/gate.js) - single implementation shared by trust, market, memory.
function _checkCapability(capability) {
    return gate.checkCapability(capability, { scope: 'trust', sandbox: gate.getSandbox() });
}

function _checkCapabilitySafe(capability) {
    return _checkCapability(capability);
}

function _checkRateLimit(key, limit) {
    return gate.checkRateLimit(key, limit, { scope: 'trust' });
}

const crypto = require('crypto');

// Trust storage
const _trustScores = new Map();     // agentId -> score
const _histories = new Map();        // agentId -> [{type, delta, note, timestamp}]
const _karma = new Map();            // agentId -> karma points
const _roleTrust = new Map();        // roleId -> required score

// ==================== PERSISTENCE (pass 37 / prd-vant-os arch A) ====================
// Scores are consensus/market's currency (tally() is trust-weighted) — they
// must survive restarts. Rules live in lib/state-store.js (single
// implementation: read-denial throws E_STATE_READ, corruption warns+fresh).
const stateStore = require('./state-store');
const TRUST_STATE_FILE = 'state/trust.json';

function _applyState(data) {
    if (!data || typeof data !== 'object') return;
    if (data.scores) for (const [k, v] of Object.entries(data.scores)) _trustScores.set(k, v);
    if (data.karma) for (const [k, v] of Object.entries(data.karma)) _karma.set(k, v);
    if (data.roleTrust) for (const [k, v] of Object.entries(data.roleTrust)) _roleTrust.set(k, v);
    if (data.histories) for (const [k, v] of Object.entries(data.histories)) {
        _histories.set(k, Array.isArray(v) ? v.slice(-100) : []); // bound history on disk too
    }
}

let _trustHydrated = false;
function _hydrate() {
    if (_trustHydrated) return;
    _trustHydrated = true;
    stateStore.hydrate({ moduleName: 'trust', stateFile: TRUST_STATE_FILE, apply: _applyState });
}

function _persist() {
    stateStore.persist({
        moduleName: 'trust',
        stateFile: TRUST_STATE_FILE,
        data: {
            scores: Object.fromEntries(_trustScores),
            karma: Object.fromEntries(_karma),
            roleTrust: Object.fromEntries(_roleTrust),
            histories: Object.fromEntries(_histories)
        }
    });
}

// Hydrate on module load (first import restores the ledger)
_hydrate();

// Defaults
const _defaults = {
    initialScore: 0.5,               // Start at 0.5 (neutral)
    maxScore: 1.0,
    minScore: 0.0,
    decayRate: 0.01,                // Trust decays over time if inactive
    positiveBoost: 0.05,            // Boost for positive interactions
    negativePenalty: 0.1,           // Penalty for negative
    tradeWeight: 0.02,              // Weight per trade
    helpWeight: 0.05                // Weight per help
};

class Trust extends EventEmitter {
    constructor(options = {}) {
        super();

        this.config = { ..._defaults, ...options };

        _emit('trust:initialized', { config: this.config });
    }

    /**
     * Get trust score for an agent/team/org
     */
    getScore(entityId) {
        if (_trustScores.has(entityId)) {
            return _trustScores.get(entityId);
        }

        // Initialize with default
        const initial = this.config.initialScore;
        _trustScores.set(entityId, initial);
        _histories.set(entityId, []);
        _karma.set(entityId, 0);

        return initial;
    }

    /**
     * Record an interaction
     * SECURITY: VAF → Sandbox → QoS → Governance
     */
    record(entityId, type, data = {}, context = {}) {
        const { agentId } = context;

        // 1. VAF: Validate input
        const validation = _validateInput({ entityId, type, ...data }, 'trust:record');
        if (!validation.valid) {
            _emit('trust:blocked', { reason: 'vaf', operation: 'record', error: validation.error });
            return { error: 'Validation failed: ' + validation.error };
        }

        // 2. Sandbox: Check capability (only agents can record trust)
        // Safe-by-default: allow under unconfigured stub, enforce when configured
        const capability = _checkCapabilitySafe('canWrite');
        if (!capability.allowed) {
            _emit('trust:blocked', { reason: 'sandbox', operation: 'record' });
            return { error: 'Capability denied' };
        }

        // 3. QoS: Rate limit
        const rateLimit = _checkRateLimit('trust:record:' + (agentId || 'system'), 20);
        if (!rateLimit.allowed) {
            _emit('trust:blocked', { reason: 'qos', operation: 'record' });
            return { error: 'Rate limit exceeded' };
        }

        // 4. Governance: Ethics check
        const gov = _getGovernance();
        if (gov && gov.isAllowed) {
            const allowed = gov.isAllowed('trust:record', {
                requiresConsent: data.positive,
                benefitScore: data.positive ? 0.6 : 0.3
            });
            if (!allowed) {
                _emit('trust:blocked', { reason: 'governance', operation: 'record' });
                return { error: 'Governance: recording not allowed' };
            }
        }

        const current = this.getScore(entityId);
        let delta = 0;

        if (data.positive) {
            delta = data.value || this.config.positiveBoost;
        } else {
            delta = -(data.value || this.config.negativePenalty);
        }

        // Calculate new score
        let newScore = Math.max(
            this.config.minScore,
            Math.min(this.config.maxScore, current + delta)
        );

        // Apply decay if inactive
        const history = _histories.get(entityId) || [];
        const daysSinceLast = history.length > 0
            ? (Date.now() - history[history.length - 1].timestamp) / (1000 * 60 * 60 * 24)
            : 30;

        if (daysSinceLast > 30) {
            const decay = this.config.decayRate * Math.floor(daysSinceLast / 30);
            newScore = Math.max(this.config.minScore, newScore - decay);
        }

        // Update
        _trustScores.set(entityId, newScore);

        // Record history
        history.push({
            type,
            delta,
            note: data.note || '',
            timestamp: Date.now()
        });
        _histories.set(entityId, history);

        // Update karma
        const currentKarma = _karma.get(entityId) || 0;
        _karma.set(entityId, currentKarma + (delta > 0 ? 1 : -1));
        _persist();

        _emit('trust:record', { entityId, type, delta, newScore });

        return { score: newScore, delta };
    }

    /**
     * Record a trade (for market)
     */
    recordTrade(sellerId, buyerId, price) {
        // Seller gains trust
        this.record(sellerId, 'trade', {
            positive: true,
            value: this.config.tradeWeight
        });

        // Buyer loses a bit (they got value)
        this.record(buyerId, 'trade', {
            positive: false,
            value: this.config.tradeWeight * 0.5
        });

        _emit('trust:trade', { sellerId, buyerId, price });
    }

    /**
     * Check if entity can perform action (based on role trust)
     */
    can(entityId, action) {
        const score = this.getScore(entityId);

        // Get required trust for this action
        const required = _roleTrust.get(action) || 0.3; // Default 0.3

        return score >= required;
    }

    /**
     * Set trust requirement for role/action
     */
    setRequired(action, score) {
        _roleTrust.set(action, score);
        _persist();
        _emit('trust:required', { action, score });
    }

    /**
     * Get trust history
     */
    getHistory(entityId, limit = 10) {
        const history = _histories.get(entityId) || [];
        return history.slice(-limit).reverse();
    }

    /**
     * Get karma
     */
    getKarma(entityId) {
        return _karma.get(entityId) || 0;
    }

    /**
     * Get trust chain (who trusts whom)
     */
    getChain(entityId) {
        const history = _histories.get(entityId) || [];

        // Analyze interactions
        const interactions = {
            helped: history.filter(h => h.delta > 0).length,
            hurt: history.filter(h => h.delta < 0).length,
            total: history.length
        };

        // Calculate chain
        const chain = {
            score: this.getScore(entityId),
            karma: this.getKarma(entityId),
            interactions,
            history: history.slice(-5)
        };

        return chain;
    }

    /**
     * Get leaderboard
     */
    leaderboard(limit = 10) {
        const all = Array.from(_trustScores.entries())
            .map(([id, score]) => ({ id, score, karma: _karma.get(id) || 0 }))
            .sort((a, b) => b.score - a.score);

        return all.slice(0, limit);
    }

    /**
     * Reset trust for entity
     */
    reset(entityId) {
        _trustScores.delete(entityId);
        _histories.delete(entityId);
        _karma.delete(entityId);
        _persist();

        _emit('trust:reset', { entityId });
    }

    /**
     * Import/export trust data
     */
    export() {
        return {
            scores: Object.fromEntries(_trustScores),
            karma: Object.fromEntries(_karma),
            roleTrust: Object.fromEntries(_roleTrust)
        };
    }

    import(data) {
        if (data.scores) {
            for (const [id, score] of Object.entries(data.scores)) {
                _trustScores.set(id, score);
            }
        }
        if (data.karma) {
            for (const [id, karma] of Object.entries(data.karma)) {
                _karma.set(id, karma);
            }
        }
        if (data.roleTrust) {
            for (const [action, score] of Object.entries(data.roleTrust)) {
                _roleTrust.set(action, score);
            }
        }

        _emit('trust:imported', { count: Object.keys(data.scores || {}).length });
        _persist();
    }
}

// Singleton
let _trust = null;

function getTrust() {
    if (!_trust) {
        _trust = new Trust();
    }
    return _trust;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get trust stats from all brains in the stack
 * @returns {Object} Combined trust stats
 */
function getStackTrustStats() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const trust = getTrust();
            const history = trust.getHistory();
            results.byBrain[brainName] = {
                karma: trust.getKarma(),
                historyCount: history.length
            };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// Export
module.exports = {
    Trust,
    getTrust,
    gatherState,
    restoreState,

    // (pass 37) Persistence seams (test/ops)
    _persistNow: () => _persist(),
    _resetHydration: () => { _trustHydrated = false; },
    clearState: () => { stateStore.clear(TRUST_STATE_FILE); _trustScores.clear(); _histories.clear(); _karma.clear(); _roleTrust.clear(); _trustHydrated = true; return true; },
    _stateFile: TRUST_STATE_FILE,

    // Convenience methods
    getScore: (...args) => getTrust().getScore(...args),
    record: (...args) => getTrust().record(...args),
    recordTrade: (...args) => getTrust().recordTrade(...args),
    can: (...args) => getTrust().can(...args),
    setRequired: (...args) => getTrust().setRequired(...args),
    getHistory: (...args) => getTrust().getHistory(...args),
    getKarma: (...args) => getTrust().getKarma(...args),
    getChain: (...args) => getTrust().getChain(...args),
    leaderboard: (...args) => getTrust().leaderboard(...args),
    reset: (...args) => getTrust().reset(...args),
    export: (...args) => getTrust().export(...args),
    import: (...args) => getTrust().import(...args),

    // Multibrain Stack
    getStackTrustStats
};

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return {
        trustScores: Array.from(_trustScores.entries()),
        histories: Array.from(_histories.entries()),
        karma: Array.from(_karma.entries()),
        roleTrust: Array.from(_roleTrust.entries()),
        count: _trustScores.size,
        gatheredAt: Date.now()
    };
}
function restoreState(data) {
    _trustScores.clear();
    _histories.clear();
    _karma.clear();
    _roleTrust.clear();
    if (data) {
        if (data.trustScores) data.trustScores.forEach(([k,v]) => _trustScores.set(k,v));
        if (data.histories) data.histories.forEach(([k,v]) => _histories.set(k,v));
        if (data.karma) data.karma.forEach(([k,v]) => _karma.set(k,v));
        if (data.roleTrust) data.roleTrust.forEach(([k,v]) => _roleTrust.set(k,v));
    }
    return { restored: true, trustScores: _trustScores.size };
}
