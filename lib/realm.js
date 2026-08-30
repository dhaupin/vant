/**
 * Realm - Unified Decision Space (v0.9.0-axolotl)
 * 
 * Ties together: Forum + Consensus + Governance + Teams
 * 
 * Concept: A geometric space where ideas emerge, get validated,
 * delegate through roles, and reach consensus democratically.
 * 
 * Architecture:
 * - Palette: Ideas/threads (from forum)
 * - Proposals: Decisions with voting (from consensus)
 * - Governance: Ethics validation (principles)
 * - Roles: Delegation and permissions (from teams)
 * 
 * Usage:
 *   const realm = require('./realm');
 *   
 *   realm.create('My Realm', { orgId: 'org_xxx' });
 *   realm.palette.add({ title: 'Idea', summary: '...' });
 *   realm.propose({ question: 'Should we do X?', options: ['yes', 'no'] });
 *   realm.vote({ proposalId: 'xxx', choice: 'yes', agent: 'euclid' });
 */

const events = require('events');
const eventEmitter = new events.EventEmitter();

// ==================== DEPENDENCIES ====================

// Lazy-load dependencies (OS pattern)
let _forum = null;
function _getForum() {
    if (!_forum) {
        try { _forum = require('./forum'); } catch (e) { return null; }
    }
    return _forum;
}

let _consensus = null;
function _getConsensus() {
    if (!_consensus) {
        try { _consensus = require('./consensus'); } catch (e) { return null; }
    }
    return _consensus;
}

let _governance = null;
function _getGovernance() {
    if (!_governance) {
        try { _governance = require('./governance'); } catch (e) { return null; }
    }
    return _governance;
}

let _teams = null;
function _getTeams() {
    if (!_teams) {
        try { _teams = require('./teams'); } catch (e) { return null; }
    }
    return _teams;
}

let _pipeline = null;
function _getPipeline() {
    if (!_pipeline) {
        try { _pipeline = require('./pipeline'); } catch (e) { return null; }
    }
    return _pipeline;
}

// ==================== EMITTER ====================

function _emit(ev, data) {
    eventEmitter.emit(ev, data);
}

// ==================== REALM (Main) ====================

class Realm {
    constructor(id, config = {}) {
        this.id = id;
        this.name = config.name || 'Unnamed Realm';
        this.orgId = config.orgId || null;
        this.created = Date.now();
        
        // Instance-specific maps
        this._paletteItems = new Map();
        this._proposalItems = new Map();
    }
    
    // ========== PALETTE ==========
    
    _addIdea(item) {
        const id = 'pal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const paletteItem = {
            id,
            title: item.title,
            summary: item.summary,
            author: item.author || 'anonymous',
            tags: item.tags || [],
            created: Date.now(),
            status: 'pending',
            proposals: []
        };
        this._paletteItems.set(id, paletteItem);
        _emit('realm:palette:add', paletteItem);
        return paletteItem;
    }
    
    _listIdeas(filter = {}) {
        let items = Array.from(this._paletteItems.values());
        if (filter.status) items = items.filter(i => i.status === filter.status);
        if (filter.tag) items = items.filter(i => i.tags.includes(filter.tag));
        return items;
    }
    
    // Expose palette API
    get palette() {
        return {
            add: (item) => this._addIdea(item),
            list: (filter) => this._listIdeas(filter),
            get: (id) => this._paletteItems.get(id)
        };
    }
    
    // ========== PROPOSALS ==========
    
    _createProposal(config) {
        const id = 'prop_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const proposal = {
            id,
            paletteId: config.paletteId,
            question: config.question,
            options: config.options || ['yes', 'no'],
            delegations: config.delegations || [],
            threshold: config.threshold || 0.51,
            status: 'open',
            votes: {},
            created: Date.now(),
            closed: null
        };
        this._proposalItems.set(id, proposal);
        if (config.paletteId) {
            const pal = this._paletteItems.get(config.paletteId);
            if (pal) pal.proposals.push(id);
        }
        _emit('realm:proposal:create', proposal);
        return proposal;
    }
    
    _listProposals(filter = {}) {
        let items = Array.from(this._proposalItems.values());
        if (filter.status) items = items.filter(i => i.status === filter.status);
        return items;
    }
    
    // Expose proposals API
    get proposals() {
        return {
            create: (config) => this._createProposal(config),
            list: (filter) => this._listProposals(filter),
            get: (id) => this._proposalItems.get(id)
        };
    }
    
    // ========== PALETTE METHODS ==========
    
    /**
     * Add idea to palette with governance validation
     */
    async addIdea(item, context = {}) {
        const gov = _getGovernance();
        
        // Governance check - skip if no governance or not enabled
        if (gov && typeof gov.isAllowed === 'function') {
            try {
                const allowed = await gov.isAllowed('realm:addIdea', {
                    requiresConsent: context.requiresConsent !== undefined ? context.requiresConsent : false,
                    consentGiven: context.consentGiven || true,
                    benefitScore: context.benefitScore || 0.5
                });
                if (!allowed) {
                    return { error: 'Governance: idea not allowed', code: 'E_GOVERNANCE' };
                }
            } catch (e) {
                // Governance check failed, allow anyway
            }
        }
        
        return this._addIdea(item);
    }
    
    /**
     * Create proposal with governance validation
     */
    async propose(config, context = {}) {
        const gov = _getGovernance();
        
        // Governance check - skip if no governance or not enabled
        if (gov && typeof gov.isAllowed === 'function') {
            try {
                const allowed = await gov.isAllowed('realm:propose', {
                    requiresConsent: context.requiresConsent !== undefined ? context.requiresConsent : false,
                    consentGiven: context.consentGiven || true,
                    benefitScore: context.benefitScore || 0.6
                });
                if (!allowed) {
                    return { error: 'Governance: proposal not allowed', code: 'E_GOVERNANCE' };
                }
            } catch (e) {
                // Governance check failed, allow anyway
            }
        }
        
        return this._createProposal(config);
    }
    
    /**
     * Cast vote with role validation
     */
    async vote({ proposalId, agentId, choice, role }, context = {}) {
        const proposal = this._proposalItems.get(proposalId);
        if (!proposal) {
            return { error: 'Proposal not found', code: 'E_NOT_FOUND' };
        }
        
        if (proposal.status !== 'open') {
            return { error: 'Proposal is closed', code: 'E_CLOSED' };
        }
        
        // Role validation via teams
        const teams = _getTeams();
        if (teams && role) {
            const assignment = teams.getAssignment(agentId);
            if (assignment && assignment.role !== role) {
                return { error: 'Role mismatch', code: 'E_ROLE' };
            }
        }
        
        // Record vote
        proposal.votes[agentId] = { choice, timestamp: Date.now() };
        _emit('realm:proposal:vote', { proposalId, agentId, choice });
        
        // Emit for consensus integration
        const consensus = _getConsensus();
        if (consensus) {
            await consensus.vote(proposalId, agentId, choice);
        }
        
        return { voted: true, proposalId, agentId, choice };
    }
    
    /**
     * Get tally of votes
     */
    tally(proposalId) {
        const proposal = this._proposalItems.get(proposalId);
        if (!proposal) return null;
        
        const counts = {};
        proposal.options.forEach(opt => counts[opt] = 0);
        
        Object.values(proposal.votes).forEach(v => {
            if (counts[v.choice] !== undefined) counts[v.choice]++;
        });
        
        const total = Object.keys(proposal.votes).length;
        const threshold = Math.ceil(total * proposal.threshold);
        
        let leading = null, maxCount = 0;
        Object.entries(counts).forEach(([opt, count]) => {
            if (count > maxCount) { maxCount = count; leading = opt; }
        });
        
        return {
            proposalId,
            total,
            counts,
            leading,
            threshold,
            required: threshold,
            passed: maxCount >= threshold && leading !== null,
            status: maxCount >= threshold && leading ? 'passed' : (total > 0 ? 'pending' : 'open')
        };
    }
    
    /**
     * Close proposal and determine outcome
     */
    close(proposalId) {
        const proposal = this._proposalItems.get(proposalId);
        if (!proposal) return null;
        
        const tally = this.tally(proposalId);
        proposal.status = tally.passed ? 'passed' : 'failed';
        proposal.closed = Date.now();
        proposal.result = tally;
        
        // Update palette status
        if (proposal.paletteId) {
            const pal = this._paletteItems.get(proposal.paletteId);
            if (pal) pal.status = proposal.status === 'passed' ? 'accepted' : 'rejected';
        }
        
        _emit('realm:proposal:close', proposal);
        return proposal;
    }
    
    /**
     * Get realm stats
     */
    stats() {
        return {
            id: this.id,
            name: this.name,
            palette: this._listIdeas().length,
            proposals: this._listProposals().length,
            open: this._listProposals({ status: 'open' }).length,
            passed: this._listProposals({ status: 'passed' }).length
        };
    }
}

// ==================== REALMS ====================

const _realms = new Map();

function create(name, config = {}) {
    const id = 'realm_' + Date.now().toString(36);
    const realm = new Realm(id, { name, ...config });
    _realms.set(id, realm);
    _emit('realm:create', realm);
    return realm;
}

function get(id) {
    return _realms.get(id);
}

function list() {
    return Array.from(_realms.values());
}

// ==================== PIPELINE SECURED ====================

/**
 * Add idea with pipeline security
 */
async function addIdeaSecured(realmId, item, userCtx = {}) {
    const pipeline = _getPipeline();
    const realm = get(realmId);
    if (!realm) return { error: 'Realm not found' };
    
    if (!pipeline) {
        return realm.addIdea(item);
    }
    
    return pipeline.run(
        { name: 'realm.addIdea', operation: 'write', input: item.title, userCtx },
        () => realm.addIdea(item),
        { mode: pipeline.PRIVATE }
    );
}

/**
 * Create proposal with pipeline security
 */
async function proposeSecured(realmId, config, userCtx = {}) {
    const pipeline = _getPipeline();
    const realm = get(realmId);
    if (!realm) return { error: 'Realm not found' };
    
    if (!pipeline) {
        return realm.propose(config);
    }
    
    return pipeline.run(
        { name: 'realm.propose', operation: 'write', input: config.question, userCtx },
        () => realm.propose(config),
        { mode: pipeline.PRIVATE }
    );
}

/**
 * Vote with pipeline security
 */
async function voteSecured(realmId, voteConfig, userCtx = {}) {
    const pipeline = _getPipeline();
    const realm = get(realmId);
    if (!realm) return { error: 'Realm not found' };
    
    if (!pipeline) {
        return realm.vote(voteConfig);
    }
    
    return pipeline.run(
        { name: 'realm.vote', operation: 'write', input: voteConfig.proposalId, userCtx },
        () => realm.vote(voteConfig),
        { mode: pipeline.PRIVATE }
    );
}

// ==================== EXPORTS ====================

module.exports = {
    // Core
    create,
    get,
    list,
    
    // Instance methods (via Realm class)
    Realm,
    
    // Proposal shortcuts (first realm)
    propose: (config) => {
        const realms = list();
        if (realms.length === 0) {
            const realm = create('Default Realm');
            return realm.propose(config);
        }
        return realms[0].propose(config);
    },
    vote: (config) => {
        const realms = list();
        if (realms.length === 0) {
            return { error: 'No realm' };
        }
        return realms[0].vote(config);
    },
    tally: (proposalId) => {
        const realms = list();
        if (realms.length === 0) return null;
        return realms[0].tally(proposalId);
    },
    close: (proposalId) => {
        const realms = list();
        if (realms.length === 0) return null;
        return realms[0].close(proposalId);
    },
    
    // Pipeline-secured variants
    addIdeaSecured,
    proposeSecured,
    voteSecured,
    
    // Events
    on: (ev, fn) => eventEmitter.on(ev, fn),
    off: (ev, fn) => eventEmitter.off(ev, fn)
};
