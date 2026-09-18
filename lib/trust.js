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

// Sandbox - Capability checks
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) { return null; }
    }
    return _sandbox;
}

// QoS - Rate limiting
let _qos = null;
function _getQoS() {
    if (!_qos) {
        try { _qos = require('./qos'); } catch (e) { return null; }
    }
    return _qos;
}

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

function _checkCapability(capability) {
    const sandbox = _getSandbox();
    if (!sandbox || !sandbox.can) {
        return { allowed: true };
    }
    try {
        return { allowed: sandbox.can(capability) };
    } catch (e) {
        return { allowed: false, error: e.message };
    }
}

function _checkRateLimit(key, limit) {
    const qos = _getQoS();
    if (!qos || !qos.check) {
        return { allowed: true };
    }
    try {
        return qos.check(key, limit);
    } catch (e) {
        return { allowed: false, error: e.message };
    }
}

const crypto = require('crypto');

// Trust storage
const _trustScores = new Map();     // agentId -> score
const _histories = new Map();        // agentId -> [{type, delta, note, timestamp}]
const _karma = new Map();            // agentId -> karma points
const _roleTrust = new Map();        // roleId -> required score

// Defaults
const _defaults = {
    initialScore: 0.5,               // Start at 0.5 (neutral)
    maxScore: 1.0,
    gatherState,
    restoreState,
    minScore: 0.0,
    gatherState,
    restoreState,
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
        const capability = _checkCapability('canWrite');
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
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
            delta,
    gatherState,
    restoreState,
            note: data.note || '',
    gatherState,
    restoreState,
            timestamp: Date.now()
        });
        _histories.set(entityId, history);

        // Update karma
        const currentKarma = _karma.get(entityId) || 0;
        _karma.set(entityId, currentKarma + (delta > 0 ? 1 : -1));

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
    gatherState,
    restoreState,
            value: this.config.tradeWeight
        });

        // Buyer loses a bit (they got value)
        this.record(buyerId, 'trade', {
            positive: false,
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
            hurt: history.filter(h => h.delta < 0).length,
    gatherState,
    restoreState,
            total: history.length
        };

        // Calculate chain
        const chain = {
            score: this.getScore(entityId),
    gatherState,
    restoreState,
            karma: this.getKarma(entityId),
    gatherState,
    restoreState,
            interactions,
    gatherState,
    restoreState,
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

        _emit('trust:reset', { entityId });
    }

    /**
     * Import/export trust data
     */
    export() {
        return {
            scores: Object.fromEntries(_trustScores),
    gatherState,
    restoreState,
            karma: Object.fromEntries(_karma),
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
        brains: stack,
    gatherState,
    restoreState,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const trust = getTrust();
            const history = trust.getHistory();
            results.byBrain[brainName] = {
                karma: trust.getKarma(),
    gatherState,
    restoreState,
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
    gatherState,
    restoreState,
    getTrust,
    gatherState,
    restoreState,

    // Convenience methods
    getScore: (...args) => getTrust().getScore(...args),
    gatherState,
    restoreState,
    record: (...args) => getTrust().record(...args),
    gatherState,
    restoreState,
    recordTrade: (...args) => getTrust().recordTrade(...args),
    gatherState,
    restoreState,
    can: (...args) => getTrust().can(...args),
    gatherState,
    restoreState,
    setRequired: (...args) => getTrust().setRequired(...args),
    gatherState,
    restoreState,
    getHistory: (...args) => getTrust().getHistory(...args),
    gatherState,
    restoreState,
    getKarma: (...args) => getTrust().getKarma(...args),
    gatherState,
    restoreState,
    getChain: (...args) => getTrust().getChain(...args),
    gatherState,
    restoreState,
    leaderboard: (...args) => getTrust().leaderboard(...args),
    gatherState,
    restoreState,
    reset: (...args) => getTrust().reset(...args),
    gatherState,
    restoreState,
    export: (...args) => getTrust().export(...args),
    gatherState,
    restoreState,
    import: (...args) => getTrust().import(...args),
    gatherState,
    restoreState,

    // Multibrain Stack
    getStackTrustStats
};

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return {
        trustScores: Array.from(_trustScores.entries()),
    gatherState,
    restoreState,
        histories: Array.from(_histories.entries()),
    gatherState,
    restoreState,
        karma: Array.from(_karma.entries()),
    gatherState,
    restoreState,
        roleTrust: Array.from(_roleTrust.entries()),
    gatherState,
    restoreState,
        count: _trustScores.size,
    gatherState,
    restoreState,
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
