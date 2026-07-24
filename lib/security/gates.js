/**
 * Vant Security Gates (v0.9.0)
 * STATEFUL security tracking for agent connections
 * 
 * INTEGRATES WITH: lib/trust.js
 * - Uses trust.getScore() for trust assessment
 * - Uses trust.record() to track interactions
 * - Uses trust.can() for capability checks
 * 
 * This module tracks:
 * - Trusted agents
 * - Security decisions
 * - Connection history
 * - Risk scores
 * 
 * SECURITY:
 * - Stateful tracking
 * - Audit logging
 * - Risk assessment
 * - Decision history
 * - Trust system integration
 */

const fs = require('fs');
const path = require('path');

// Persistence file
const GATE_DB = '.agent_tmp/security-gates.json';

// Lazy-load trust system
let _trust = null;
function _getTrust() {
    if (!_trust) {
        try { _trust = require('../trust'); } catch (e) { return null; }
    }
    return _trust;
}

/**
 * Security Gates - Stateful tracker
 */
class SecurityGates {
    constructor() {
        this.trusted = new Map();      // Trusted agent IDs
        this.blocked = new Map();     // Blocked agent IDs
        this.history = [];            // Decision history
        this.riskScores = new Map();  // Risk scores by agent
        
        // Load persisted state
        this._load();
    }

    /**
     * Load persisted gate state
     */
    _load() {
        try {
            if (fs.existsSync(GATE_DB)) {
                const data = JSON.parse(fs.readFileSync(GATE_DB, 'utf8'));
                this.trusted = new Map(data.trusted || []);
                this.blocked = new Map(data.blocked || []);
                this.history = data.history || [];
                this.riskScores = new Map(data.riskScores || []);
                console.log('[Security/Gates] Loaded gate state');
            }
        } catch (e) {
            console.log('[Security/Gates] No persisted state');
        }
    }

    /**
     * Persist gate state
     */
    _save() {
        try {
            const dir = path.dirname(GATE_DB);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(GATE_DB, JSON.stringify({
                trusted: Array.from(this.trusted.entries()),
                blocked: Array.from(this.blocked.entries()),
                history: this.history.slice(-100),
                riskScores: Array.from(this.riskScores.entries())
            }, null, 2));
        } catch (e) {
            console.log('[Security/Gates] Failed to persist:', e.message);
        }
    }

    /**
     * Assess risk of connecting to an agent
     */
    assessRisk(agentId, metadata = {}) {
        const factors = [];
        let score = 0;

        if (this.trusted.has(agentId)) {
            factors.push({ factor: 'trusted', impact: -30 });
            score -= 30;
        }

        if (this.blocked.has(agentId)) {
            factors.push({ factor: 'blocked', impact: +50 });
            score += 50;
        }

        const historyEntry = this.history.find(h => h.agentId === agentId);
        if (historyEntry) {
            if (historyEntry.decisions?.filter(d => d.allowed).length > 5) {
                factors.push({ factor: 'good_history', impact: -10 });
                score -= 10;
            }
        }

        if (!metadata.source || metadata.source === 'unknown') {
            factors.push({ factor: 'unknown_source', impact: +20 });
            score += 20;
        }

        if (metadata.hasValidData === false) {
            factors.push({ factor: 'invalid_data', impact: +15 });
            score += 15;
        }

        if (metadata.connectionType === 'remote') {
            factors.push({ factor: 'remote_connection', impact: +10 });
            score += 10;
        }

        score = Math.max(0, Math.min(100, score));
        return { score, factors };
    }

    /**
     * Make a security decision
     * INTEGRATES WITH: trust.js
     */
    decide(agentId, action, allowed, reason) {
        const decision = {
            agentId,
            action,
            allowed,
            reason,
            timestamp: Date.now(),
            riskScore: this.riskScores.get(agentId) || 0
        };

        this.history.push(decision);

        if (allowed) {
            const current = this.riskScores.get(agentId) || 50;
            this.riskScores.set(agentId, Math.max(0, current - 5));
            
            // INTEGRATE: Record positive interaction in trust system
            const trust = _getTrust();
            if (trust && trust.record) {
                try {
                    trust.record(agentId, 'connection_allowed', { 
                        action, 
                        riskScore: this.riskScores.get(agentId),
                        reason 
                    });
                } catch (e) {
                    // Trust system may not be available
                }
            }
        } else {
            const current = this.riskScores.get(agentId) || 50;
            this.riskScores.set(agentId, Math.min(100, current + 20));
            
            // INTEGRATE: Record blocked attempt in trust system
            const trust = _getTrust();
            if (trust && trust.record) {
                try {
                    trust.record(agentId, 'connection_blocked', { 
                        action, 
                        riskScore: this.riskScores.get(agentId),
                        reason 
                    });
                } catch (e) {
                    // Trust system may not be available
                }
            }
        }

        this._save();
        return decision;
    }

    /**
     * Trust an agent
     */
    trust(agentId, reason = '') {
        this.trusted.set(agentId, {
            trustedAt: Date.now(),
            reason,
            trustedBy: 'nova'
        });
        this._save();
    }

    /**
     * Block an agent
     */
    block(agentId, reason = '') {
        this.blocked.set(agentId, {
            blockedAt: Date.now(),
            reason,
            blockedBy: 'nova'
        });
        this._save();
    }

    /**
     * Check if agent is allowed
     * INTEGRATES WITH: trust.js for trust score
     */
    canConnect(agentId, metadata = {}) {
        // 1. Always block known bad agents
        if (this.blocked.has(agentId)) {
            return { allowed: false, reason: 'Agent is blocked' };
        }

        // 2. Check trust system for external trust score
        let trustScore = null;
        const trust = _getTrust();
        if (trust && trust.getScore) {
            try {
                trustScore = trust.getScore(agentId);
            } catch (e) {
                // Trust system may not be available
            }
        }

        // 3. Assess local risk
        const { score, factors } = this.assessRisk(agentId, metadata);

        // 4. Combine local risk with external trust
        let adjustedScore = score;
        
        // If external trust system says agent is trusted, reduce local risk
        if (trustScore !== null && trustScore > 0.7) {
            adjustedScore = Math.max(0, score - 20);
            factors.push({ factor: 'high_trust_score', impact: -20, trustScore });
        }
        
        // If external trust system says agent is untrusted, increase local risk
        if (trustScore !== null && trustScore < 0.3) {
            adjustedScore = Math.min(100, score + 30);
            factors.push({ factor: 'low_trust_score', impact: +30, trustScore });
        }

        // 5. Decision thresholds
        if (adjustedScore >= 70) {
            return { allowed: false, reason: 'High risk score', score: adjustedScore, factors, trustScore };
        }

        if (adjustedScore >= 40) {
            return { allowed: true, reason: 'Allowed with caution', score: adjustedScore, factors, trustScore };
        }

        return { allowed: true, reason: 'Low risk', score: adjustedScore, factors, trustScore };
    }

    /**
     * Get security status
     */
    status() {
        return {
            trusted: this.trusted.size,
            blocked: this.blocked.size,
            history: this.history.length,
            agentsTracked: this.riskScores.size
        };
    }
}

module.exports = { SecurityGates };
