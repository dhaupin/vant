/**
 * Market - Knowledge & Insight Trading (v0.8.6)
 * WITH EVENT EMISSIONS - market operations emit globally
 *
 * A marketplace where agents can trade knowledge, insights, and memories.
 * Protected by Vant OS security chains.
 *
 * SECURITY CHAIN INTEGRATION:
 * - VAF: Input validation and sanitization
 * - Sandbox: Capability checks
 * - QoS: Rate limiting
 * - Escrow: Budget checks
 * - Governance: Ethics checks
 *
 * Concepts:
 * - Listings: Knowledge/insights offered for trade
 * - Bids: Requests for specific knowledge
 * - Exchange: Swap knowledge for knowledge, or knowledge for favors
 * - Reputation: Trust score affects trade success
 *
 * Usage:
 *   const market = require('./market');
 *
 *   // List knowledge
 *   await market.list('insight', {
 *     title: 'How to fix X',
 *     summary: 'The root cause is...',
 *     tags: ['bug', 'fix', 'security']
 *   });
 *
 *   // Request knowledge
 *   await market.bid('Looking for Y', {
 *     reward: 'knowledge:how_to_fix_x'
 *   });
 *
 *   // Trade
 *   await market.trade(listingId, agentId);
 *
 *   // Browse
 *   const listings = await market.search({ tags: ['security'] });
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

// Escrow - Budget
let _escrow = null;
function _getEscrow() {
    if (!_escrow) {
        try { _escrow = require('./escrow'); } catch (e) { return null; }
    }
    return _escrow;
}

// Governance - Ethics
let _governance = null;
function _getGovernance() {
    if (!_governance) {
        try { _governance = require('./governance'); } catch (e) {}
    }
    return _governance;
}

// Trust - Reputation
let _trust = null;
function _getTrust() {
    if (!_trust) {
        try { _trust = require('./trust'); } catch (e) { return null; }
    }
    return _trust;
}

// Config
let _config = null;
function _getConfig() {
    if (!_config) {
        try { _config = require('./config'); } catch (e) {}
    }
    return _config;
}

// ==================== SECURITY HELPERS ====================

/**
 * Validate and sanitize input using VAF
 */
async function _validateInput(input, operation) {
    const vaf = _getVAF();
    if (!vaf || !vaf.validate) {
        return { valid: true };  // No VAF, allow
    }

    try {
        return await vaf.validate(input, operation);
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

/**
 * Check sandbox capabilities
 */
function _checkCapability(capability) {
    const sandbox = _getSandbox();
    if (!sandbox || !sandbox.can) {
        return { allowed: true };  // No sandbox, allow
    }

    try {
        return { allowed: sandbox.can(capability) };
    } catch (e) {
        return { allowed: false, error: e.message };
    }
}

/**
 * Rate limit check using QoS
 */
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

/**
 * Budget check using Escrow - just checks if can spend
 */
async function _checkBudget(cost, agentId) {
    const escrow = _getEscrow();
    if (!escrow || !escrow.canSpend) {
        return { allowed: true };
    }

    try {
        return await escrow.canSpend(agentId, cost);
    } catch (e) {
        return { allowed: false, error: e.message };
    }
}

/**
 * Hold budget in Escrow when trade is initiated
 */
async function _holdBudget(holdId, cost, agentId) {
    const escrow = _getEscrow();
    if (!escrow || !escrow.hold) {
        return { held: true }; // No escrow, allow
    }

    try {
        // escrow.hold(holdId, { amount: cost, agent: agentId, type: 'market_trade' })
        return escrow.hold(holdId, { amount: cost, agent: agentId, type: 'market_trade' });
    } catch (e) {
        return { held: false, error: e.message };
    }
}

/**
 * Release held budget from Escrow
 */
function _releaseBudget(holdId) {
    const escrow = _getEscrow();
    if (!escrow || !escrow.release) {
        return { released: true };
    }

    try {
        return escrow.release(holdId);
    } catch (e) {
        return { released: false, error: e.message };
    }
}

// Storage
const _listings = new Map();  // listingId -> listing
const _bids = new Map();       // bidId -> bid
const _trades = new Map();     // tradeId -> trade
const _index = {               // Search index
    byType: new Map(),         // type -> [listingIds]
    byTags: new Map(),         // tag -> [listingIds]
    byAgent: new Map()         // agentId -> [listingIds]
};

const crypto = require('crypto');

class Market extends EventEmitter {
    constructor(options = {}) {
        super();

        this.marketId = 'market_' + crypto.randomBytes(4).toString('hex');
        this.name = options.name || 'Vant Knowledge Market';
        this.fee = options.fee || 0;  // Trade fee (0 = free)

        _emit('market:created', { marketId: this.marketId, name: this.name });
    }

    /**
     * List knowledge or insight for trade
     * SECURITY: VAF → Sandbox → QoS → Governance
     */
    async list(type, data, context = {}) {
        const { agentId } = context;

        // 1. VAF: Validate input
        const validation = await _validateInput({ type, ...data }, 'market:list');
        if (!validation.valid) {
            _emit('market:blocked', { reason: 'vaf', operation: 'list', error: validation.error });
            return { error: 'Validation failed: ' + validation.error };
        }

        // 2. Sandbox: Check capability
        const capability = _checkCapability('canWrite');
        if (!capability.allowed) {
            _emit('market:blocked', { reason: 'sandbox', operation: 'list' });
            return { error: 'Capability denied' };
        }

        // 3. QoS: Rate limit
        const rateLimit = _checkRateLimit('market:list:' + (agentId || 'anonymous'), 10);
        if (!rateLimit.allowed) {
            _emit('market:blocked', { reason: 'qos', operation: 'list' });
            return { error: 'Rate limit exceeded' };
        }

        // 4. Governance: Ethics check
        const gov = _getGovernance();
        if (gov && gov.isAllowed) {
            const allowed = await gov.isAllowed('market:list', {
                requiresConsent: true,
                consentGiven: context.consentGiven || false,
                benefitScore: 0.7
            });
            if (!allowed) {
                _emit('market:blocked', { reason: 'governance', operation: 'list' });
                return { error: 'Governance: listing not allowed' };
            }
        }

        const listing = {
            id: 'listing_' + crypto.randomBytes(4).toString('hex'),
            type, // 'knowledge', 'insight', 'memory', 'favor'
            title: data.title,
            summary: data.summary,
            tags: data.tags || [],
            price: data.price || null,  // What they want in return
            seller: data.seller || 'anonymous',
            created: Date.now(),
            views: 0,
            trades: 0
        };

        // Store
        _listings.set(listing.id, listing);

        // Index
        if (!_index.byType.has(type)) {
            _index.byType.set(type, []);
        }
        _index.byType.get(type).push(listing.id);

        for (const tag of listing.tags) {
            if (!_index.byTags.has(tag)) {
                _index.byTags.set(tag, []);
            }
            _index.byTags.get(tag).push(listing.id);
        }

        if (!_index.byAgent.has(listing.seller)) {
            _index.byAgent.set(listing.seller, []);
        }
        _index.byAgent.get(listing.seller).push(listing.id);

        _emit('market:listed', { listing });

        return listing;
    }

    /**
     * Bid on knowledge (request something)
     * SECURITY: VAF → QoS → Governance
     */
    async bid(title, data, context = {}) {
        const { agentId } = context;

        // 1. VAF: Validate input
        const validation = await _validateInput({ title, ...data }, 'market:bid');
        if (!validation.valid) {
            _emit('market:blocked', { reason: 'vaf', operation: 'bid', error: validation.error });
            return { error: 'Validation failed: ' + validation.error };
        }

        // 2. QoS: Rate limit
        const rateLimit = _checkRateLimit('market:bid:' + (agentId || 'anonymous'), 5);
        if (!rateLimit.allowed) {
            _emit('market:blocked', { reason: 'qos', operation: 'bid' });
            return { error: 'Rate limit exceeded' };
        }

        // 3. Governance: Ethics check
        const gov = _getGovernance();
        if (gov && gov.isAllowed) {
            const allowed = await gov.isAllowed('market:bid', {
                requiresConsent: true,
                consentGiven: context.consentGiven || false,
                benefitScore: 0.6
            });
            if (!allowed) {
                _emit('market:blocked', { reason: 'governance', operation: 'bid' });
                return { error: 'Governance: bid not allowed' };
            }
        }

        const bid = {
            id: 'bid_' + crypto.randomBytes(4).toString('hex'),
            title,
            description: data.description,
            tags: data.tags || [],
            reward: data.reward,  // What they'll give: 'knowledge:xyz' or 'favor:...'
            bidder: data.bidder || 'anonymous',
            created: Date.now(),
            fulfilled: false
        };

        _bids.set(bid.id, bid);

        _emit('market:bid', { bid });

        return bid;
    }

    /**
     * Execute a trade
     * SECURITY: VAF → Sandbox → Escrow → Trust → Governance
     */
    async trade(listingId, buyerId, context = {}) {
        const { agentId } = context;

        // 1. VAF: Validate input
        const validation = await _validateInput({ listingId, buyerId }, 'market:trade');
        if (!validation.valid) {
            _emit('market:blocked', { reason: 'vaf', operation: 'trade', error: validation.error });
            return { error: 'Validation failed: ' + validation.error };
        }

        // 2. Sandbox: Check capability
        const capability = _checkCapability('canTrade');
        if (!capability.allowed) {
            _emit('market:blocked', { reason: 'sandbox', operation: 'trade' });
            return { error: 'Capability denied' };
        }

        const listing = _listings.get(listingId);
        if (!listing) {
            return { error: 'Listing not found' };
        }

        // 3. Escrow: Budget check + hold funds
        const budget = await _checkBudget(listing.price || 1, agentId || buyerId);
        if (!budget.allowed) {
            _emit('market:blocked', { reason: 'escrow', operation: 'trade' });
            return { error: 'Insufficient budget' };
        }

        // 3b. Escrow: Hold buyer's funds (atomic commitment)
        const holdId = `trade:${listing.id}:${buyerId}`;
        const holdResult = await _holdBudget(holdId, listing.price || 1, agentId || buyerId);
        if (!holdResult.held) {
            _emit('market:blocked', { reason: 'escrow_hold', operation: 'trade' });
            return { error: 'Could not hold budget: ' + (holdResult.error || 'unknown') };
        }

        // 4. Trust: Reputation check
        const trust = _getTrust();
        if (trust && trust.getScore) {
            const sellerTrust = trust.getScore(listing.seller);
            const buyerTrust = trust.getScore(buyerId);

            if (sellerTrust < 0.3) {
                _emit('market:blocked', { reason: 'trust', operation: 'trade', sellerTrust });
                return { error: 'Seller trust too low' };
            }

            // Record transaction for reputation
            trust.recordTrade(listing.seller, buyerId, listing.price);
        }

        // 5. Governance: Final ethics check
        const gov = _getGovernance();
        if (gov && gov.isAllowed) {
            const allowed = await gov.isAllowed('market:trade', {
                requiresConsent: true,
                consentGiven: context.consentGiven || false,
                benefitScore: 0.8
            });
            if (!allowed) {
                _emit('market:blocked', { reason: 'governance', operation: 'trade' });
                return { error: 'Governance: trade not allowed' };
            }
        }

        const trade = {
            id: 'trade_' + crypto.randomBytes(4).toString('hex'),
            listingId,
            seller: listing.seller,
            buyer: buyerId,
            price: listing.price,
            holdId: holdId,  // Escrow hold ID
            timestamp: Date.now(),
            completed: true  // Trade completed - funds released to seller
        };

        // 6. Escrow: Release held funds to seller
        const releaseResult = _releaseBudget(holdId);

        // Mark listing as traded
        listing.trades++;

        _trades.set(trade.id, trade);

        _emit('market:trade', { trade, listing, escrowRelease: releaseResult });

        return trade;
    }

    /**
     * Search listings
     */
    async search(filters = {}) {
        let results = Array.from(_listings.values());

        if (filters.type) {
            results = results.filter(l => l.type === filters.type);
        }

        if (filters.tags && filters.tags.length > 0) {
            results = results.filter(l =>
                filters.tags.some(t => l.tags.includes(t))
            );
        }

        if (filters.seller) {
            results = results.filter(l => l.seller === filters.seller);
        }

        if (filters.query) {
            const q = filters.query.toLowerCase();
            results = results.filter(l =>
                l.title.toLowerCase().includes(q) ||
                l.summary.toLowerCase().includes(q)
            );
        }

        // Update views
        for (const listing of results) {
            listing.views++;
        }

        return results;
    }

    /**
     * Get listing by ID
     */
    get(listingId) {
        return _listings.get(listingId) || null;
    }

    /**
     * Get bids
     */
    getBids(filters = {}) {
        let results = Array.from(_bids.values());

        if (filters.fulfilled !== undefined) {
            results = results.filter(b => b.fulfilled === filters.fulfilled);
        }

        if (filters.tags && filters.tags.length > 0) {
            results = results.filter(b =>
                filters.tags.some(t => b.tags.includes(t))
            );
        }

        return results;
    }

    /**
     * Get market stats
     */
    stats() {
        return {
            listings: _listings.size,
            bids: _bids.size,
            trades: _trades.size,
            types: Object.fromEntries(_index.byType),
            tags: Object.fromEntries(_index.byTags)
        };
    }
    /**
     * Cancel a trade and release escrow hold
     */
    cancelTrade(tradeId, agentId) {
        const trade = _trades.get(tradeId);
        if (!trade) {
            return { error: 'Trade not found' };
        }

        // Only buyer or seller can cancel
        if (trade.buyer !== agentId && trade.seller !== agentId) {
            return { error: 'Not authorized to cancel this trade' };
        }

        if (trade.completed) {
            return { error: 'Trade already completed' };
        }

        // Release escrow hold
        if (trade.holdId) {
            const releaseResult = _releaseBudget(trade.holdId);
            trade.cancelled = true;
            trade.cancelledAt = Date.now();

            _emit('market:trade:cancelled', { trade, escrowRelease: releaseResult });
            return { cancelled: true, trade, escrowRelease: releaseResult };
        }

        return { error: 'No escrow hold to release' };
    }

    /**
     * Get trade by ID
     */
    getTrade(tradeId) {
        return _trades.get(tradeId) || null;
    }
}

// Singleton
let _market = null;

function getMarket() {
    if (!_market) {
        _market = new Market();
    }
    return _market;
}

// Export both class and singleton methods
module.exports = {
    Market,
    getMarket,

    // Convenience methods
    list: (...args) => getMarket().list(...args),
    bid: (...args) => getMarket().bid(...args),
    trade: (...args) => getMarket().trade(...args),
    search: (...args) => getMarket().search(...args),
    get: (...args) => getMarket().get(...args),
    getBids: (...args) => getMarket().getBids(...args),
    getTrade: (...args) => getMarket().getTrade(...args),
    cancelTrade: (...args) => getMarket().cancelTrade(...args),
    stats: (...args) => getMarket().stats(...args),

    // Multibrain Stack
    getStackMarketStats
};

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get market stats from all brains in the stack
 * @returns {Object} Combined market info
 */
function getStackMarketStats() {
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
            const marketStats = stats();
            results.byBrain[brainName] = marketStats;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}
