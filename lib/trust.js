/**
 * Trust - Reputation & Trust Score System (v0.9.0)
 * WITH EVENT EMISSIONS - trust operations emit globally
 * 
 * Unified trust system across agents, teams, and orgs.
 * Integrates with succession, teams, and market.
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
     */
    record(entityId, type, data = {}) {
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

// Export
module.exports = {
    Trust,
    getTrust,
    
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
    import: (...args) => getTrust().import(...args)
};
