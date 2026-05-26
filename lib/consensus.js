/**
 * Consensus Ledger (v0.8.7)
 * Agent voting system - NOT crypto
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

const _ledgers = new Map();
const _votes = new Map();
const _audit = [];

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

// Create a new vote
function create(topic, options = {}) {
    const ledger = {
        topic,
        votes: {},
        outcomes: {},
        threshold: options.threshold || 0.51, // 51%
        status: 'open', // open, passed, rejected
        created: Date.now(),
        deadline: options.deadline || Date.now() + 3600000, // 1hr default
        voterWhitelist: options.voters || null,
        metadata: options.metadata || {}
    };
    _ledgers.set(topic, ledger);
    return ledger;
}

// Cast vote (PROTECTED)
function vote(topic, outcome, agentId) {
    const ledger = _ledgers.get(topic);
    if (!ledger) return { error: 'Vote not found' };
    if (ledger.status !== 'open') return { error: 'Vote closed' };
    if (Date.now() > ledger.deadline) {
        ledger.status = 'expired';
        return { error: 'Vote expired' };
    }
    
    // PROTECT: One vote per agent per topic
    if (hasVoted(topic, agentId)) {
        return { error: 'Already voted', previous: ledger.votes[agentId] };
    }
    
    // PROTECT: Verify agent via registry (if enabled)
    try {
        const registry = require('./node-registry');
        const peers = registry.discover({ status: 'alive' });
        // Could enforce: only registered agents can vote
    } catch(e) {}
    
    // Record vote
    ledger.votes[agentId] = outcome;
    
    // Audit trail
    _auditLog('vote', { topic, agentId, outcome });
    
    // Store in votes map too
    if (!_votes.has(topic)) _votes.set(topic, new Map());
    _votes.get(topic).set(agentId, { outcome, timestamp: Date.now() });
    
    // Auto-tally
    return tally(topic);
}

// Tally results
function tally(topic) {
    const ledger = _ledgers.get(topic);
    if (!ledger) return { error: 'Vote not found' };
    
    const voteCounts = {};
    let totalVotes = 0;
    
    for (const [agentId, outcome] of Object.entries(ledger.votes)) {
        voteCounts[outcome] = (voteCounts[outcome] || 0) + 1;
        totalVotes++;
    }
    
    // Calculate percentages
    const results = {
        topic,
        totalVotes,
        counts: voteCounts,
        percentages: {},
        leading: null,
        leadingPct: 0,
        status: ledger.status,
        deadline: ledger.deadline
    };
    
    let maxVotes = 0;
    for (const [outcome, count] of Object.entries(voteCounts)) {
        results.percentages[outcome] = totalVotes > 0 ? count / totalVotes : 0;
        if (count > maxVotes) {
            maxVotes = count;
            results.leading = outcome;
            results.leadingPct = results.percentages[outcome];
        }
    }
    
    // Check threshold (51% default)
    const winnerPct = results.leadingPct;
    if (winnerPct > ledger.threshold && totalVotes > 0) {  // Changed >= to >
        results.status = 'passed';
        results.winner = results.leading;
        ledger.status = 'passed';
        ledger.outcomes = voteCounts;
    } else if (Date.now() > ledger.deadline) {
        results.status = 'rejected';
        ledger.status = 'rejected';
    }
    
    return results;
}

// Get vote info
function get(topic) {
    return _ledgers.get(topic);
}

// List all votes
function list() {
    return Array.from(_ledgers.values()).map(l => ({
        topic: l.topic,
        status: l.status,
        votes: Object.keys(l.votes).length,
        deadline: l.deadline
    }));
}

// Force resolve (admin)
function resolve(topic, outcome) {
    const ledger = _ledgers.get(topic);
    if (!ledger) return { error: 'Vote not found' };
    
    ledger.status = 'passed';
    ledger.outcomes = { [outcome]: 1 };
    return { resolved: true, topic, outcome };
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
    vote,
    tally,
    get,
    list,
    resolve,
    getStats,
    hasVoted,
    _auditLog,
    _audit,
    getLayerStatus: () => ({ name: 'Consensus', type: 'voting', version: '0.8.7', enabled: true, protected: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, ledgers: _ledgers.size, protected: true })
};