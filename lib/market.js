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

// Capability/rate-limit gates delegate to the shared safe-by-default gate
// (lib/gate.js) - single implementation shared by trust, market, memory.
function _checkCapability(capability) {
    return gate.checkCapability(capability, { scope: 'market', sandbox: gate.getSandbox() });
}

function _checkCapabilitySafe(capability) {
    return _checkCapability(capability);
}

/**
 * Rate limit check using QoS
 */
function _checkRateLimit(key, limit) {
    return gate.checkRateLimit(key, limit, { scope: 'market' });
}

/**
 * Budget check using Escrow - just checks if can spend.
 * (pass 38) Barter prices ('favor:review', 'knowledge:xyz') are not numeric
 * amounts: escrow.canSpend compares available >= amount, and a string price
 * made that NaN (1000 >= 'favor:review' === false), so EVERY barter trade
 * was denied with 'Insufficient budget'. Non-numeric prices carry no escrow
 * cost — skip the budget check; trust/governance/sandbox still gate the
 * trade. Numeric amounts (credit-mode) flow through escrow unchanged.
 */
function _checkBudget(cost, agentId) {
    if (typeof cost !== 'number' || !Number.isFinite(cost)) {
        return { allowed: true };
    }
    const escrow = _getEscrow();
    if (!escrow || !escrow.canSpend) {
        return { allowed: true };
    }

    try {
        return escrow.canSpend(agentId, cost);
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

// ==================== PERSISTENCE (pass 38 / prd-vant-os Wave 3) ====================
// The knowledge market's ledgers survive restarts. Serialization deltas:
//   - supply: Infinity ⇄ null (JSON has no Infinity; the scarcity opt-out
//     must round-trip or a restored open listing would silently cap at 1)
//   - _reserved: NEVER persists — it is in-flight reserve accounting from
//     the atomic trade path; a crash mid-trade must NOT resurrect a
//     phantom reservation (hydrate resets it to 0; the supply check then
//     reflects only committed trades).
// Persist points: list/bid (creation), trade commit + cancelTrade (the
// settle points AFTER the reserve/rollback dance completes), and
// restoreState (so the horcrux seam keeps disk in sync). Rules live in
// lib/state-store.js (E_STATE_READ on denial, warn+fresh on corruption).
const stateStore = require('./state-store');
const MARKET_STATE_FILE = 'state/market.json';

function _serializeListings() {
    return Array.from(_listings.values()).map((l) => ({
        ...l,
        supply: l.supply === Infinity ? null : l.supply,
        _reserved: undefined
    }));
}

function _applyMarket(data) {
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.listings)) {
        for (const l of data.listings) {
            if (!l || typeof l.id !== 'string' || !l.type) continue;
            if (_listings.has(l.id)) continue; // in-memory wins (hot state)
            const restored = { ...l, _reserved: 0 };
            restored.supply = (l.supply === null || l.supply === undefined) ? Infinity : l.supply;
            _listings.set(l.id, restored);
            // Rebuild the search index for restored listings
            if (!_index.byType.has(l.type)) _index.byType.set(l.type, []);
            _index.byType.get(l.type).push(l.id);
            if (Array.isArray(l.tags)) {
                for (const tag of l.tags) {
                    if (!_index.byTags.has(tag)) _index.byTags.set(tag, []);
                    _index.byTags.get(tag).push(l.id);
                }
            }
            if (!_index.byAgent.has(l.seller)) _index.byAgent.set(l.seller, []);
            _index.byAgent.get(l.seller).push(l.id);
        }
    }
    if (Array.isArray(data.bids)) {
        for (const b of data.bids) {
            if (b && typeof b.id === 'string' && !_bids.has(b.id)) _bids.set(b.id, b);
        }
    }
    if (Array.isArray(data.trades)) {
        for (const t of data.trades) {
            if (t && typeof t.id === 'string' && !_trades.has(t.id)) _trades.set(t.id, t);
        }
    }
}

let _marketHydrated = false;
function _hydrate() {
    if (_marketHydrated) return;
    _marketHydrated = true;
    stateStore.hydrate({ moduleName: 'market', stateFile: MARKET_STATE_FILE, apply: _applyMarket });
}

function _persist() {
    stateStore.persist({
        moduleName: 'market',
        stateFile: MARKET_STATE_FILE,
        data: {
            listings: _serializeListings(),
            bids: Array.from(_bids.values()),
            trades: Array.from(_trades.values())
        }
    });
}

_hydrate();

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

        // 2. Sandbox: Check capability (safe-by-default)
        const capability = _checkCapabilitySafe('canWrite');
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
        // (pass 38) Pass the caller's consent context through: the flag was
        // hardcoded `true`, so no caller could ever satisfy the consent gate.
        const gov = _getGovernance();
        if (gov && gov.isAllowed) {
            const allowed = await gov.isAllowed('market:list', {
                requiresConsent: context.requiresConsent !== undefined ? context.requiresConsent : true,
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
            // (pass 31, stress A3) Supply: how many trades this listing
            // supports. Default 1 — a listing IS a scarce artifact by
            // default; parallel trades on the last unit race, and the old
            // unbounded default double-sold scarce listings under load.
            // Pass supply: Infinity explicitly for open-ended listings.
            supply: data.supply === Infinity ? Infinity :
                (Number.isFinite(Number(data.supply)) && Number(data.supply) > 0 ? Math.floor(Number(data.supply)) : 1),
            seller: data.seller || 'anonymous',
            created: Date.now(),
            views: 0,
            trades: 0
        };

        // Store
        _listings.set(listing.id, listing);
        _persist();

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
        // (pass 38) Same consent passthrough as list(): the flag was
        // hardcoded `true` (ignored the caller's context entirely).
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
        _persist();

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

        // (pass 31, stress A3) ATOMIC scarcity reserve — must run BEFORE any
        // await so two parallel trades cannot both pass the check (JS is
        // single-threaded; this sync section is the critical section). A
        // dedicated _reserved counter is required: listing.trades only
        // increments AFTER the awaits, so counting trades here still let
        // two interleaved trades both pass. Reserve is rolled back if a
        // later stage rejects.
        if (listing.supply !== Infinity) {
            const open = listing.supply - listing.trades - (listing._reserved || 0);
            if (open <= 0) {
                _emit('market:blocked', { reason: 'sold_out', operation: 'trade', listingId });
                return { error: 'Listing sold out' };
            }
            listing._reserved = (listing._reserved || 0) + 1;
        }
        let reserved = listing.supply !== Infinity;
        // (pass 31) Roll the atomic reserve back on every late rejection so
        // failed attempts don't consume supply.
        const _unreserve = () => {
            if (reserved) {
                listing._reserved = Math.max(0, (listing._reserved || 0) - 1);
                reserved = false;
            }
        };

        // 3. Escrow: Budget check + hold funds
        const budget = await _checkBudget(listing.price || 1, agentId || buyerId);
        if (!budget.allowed) {
            _unreserve();
            _emit('market:blocked', { reason: 'escrow', operation: 'trade' });
            return { error: 'Insufficient budget' };
        }

        // 3b. Escrow: Hold buyer's funds (atomic commitment)
        const holdId = `trade:${listing.id}:${buyerId}`;
        const holdResult = await _holdBudget(holdId, listing.price || 1, agentId || buyerId);
        if (!holdResult.held) {
            _unreserve();
            _emit('market:blocked', { reason: 'escrow_hold', operation: 'trade' });
            return { error: 'Could not hold budget: ' + (holdResult.error || 'unknown') };
        }

        // 4. Trust: Reputation check
        const trust = _getTrust();
        if (trust && trust.getScore) {
            const sellerTrust = trust.getScore(listing.seller);
            const buyerTrust = trust.getScore(buyerId);

            if (sellerTrust < 0.3) {
                _unreserve();
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
                _unreserve();
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

        // Mark listing as traded — consumes the atomic reservation taken at
        // entry (stress A3); _reserved drains back via trades++ accounting.
        listing.trades++;
        if (listing.supply !== Infinity) {
            listing._reserved = Math.max(0, (listing._reserved || 0) - 1);
        }
        reserved = false;

        _trades.set(trade.id, trade);
        _persist();

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
            _persist();

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
    getStackMarketStats,
    gatherState,
    restoreState,

    // (pass 38) Persistence seams (test/ops)
    _persistNow: () => _persist(),
    _resetHydration: () => { _marketHydrated = false; },
    clearState: () => { stateStore.clear(MARKET_STATE_FILE); _listings.clear(); _bids.clear(); _trades.clear(); _index.byType.clear(); _index.byTags.clear(); _index.byAgent.clear(); _marketHydrated = true; return true; },
    _stateFile: MARKET_STATE_FILE,
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

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return {
        listings: Array.from(_listings.entries()),
        bids: Array.from(_bids.entries()),
        trades: Array.from(_trades.entries()),
        count: _listings.size,
        gatheredAt: Date.now()
    };
}
function restoreState(data) {
    _listings.clear();
    _bids.clear();
    _trades.clear();
    if (data && data.listings) {
        for (const [id, listing] of data.listings) {
            _listings.set(id, { ...listing, _reserved: 0 });
        }
    }
    if (data && data.bids) {
        for (const [id, bid] of data.bids) {
            _bids.set(id, bid);
        }
    }
    if (data && data.trades) {
        for (const [id, trade] of data.trades) {
            _trades.set(id, trade);
        }
    }
    _persist();
    return { restored: true, listings: _listings.size, bids: _bids.size, trades: _trades.size };
}
