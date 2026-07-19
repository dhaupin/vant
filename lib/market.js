/**
 * Market - Knowledge & Insight Trading (v0.9.0)
 * WITH EVENT EMISSIONS - market operations emit globally
 * 
 * A marketplace where agents can trade knowledge, insights, and memories.
 * Protected by Vant OS security chains.
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

// Lazy-load dependencies
let _config = null;
function _getConfig() {
    if (!_config) {
        try { _config = require('./config'); } catch (e) {}
    }
    return _config;
}

let _governance = null;
function _getGovernance() {
    if (!_governance) {
        try { _governance = require('./governance'); } catch (e) {}
    }
    return _governance;
}

let _trust = null;
function _getTrust() {
    if (!_trust) {
        try { _trust = require('./trust'); } catch (e) { return null; }
    }
    return _trust;
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
     */
    async list(type, data) {
        // Governance check
        const gov = _getGovernance();
        if (gov && gov.isAllowed) {
            const allowed = await gov.isAllowed('market:list', {
                requiresConsent: true,
                benefitScore: 0.7
            });
            if (!allowed) {
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
     */
    async bid(title, data) {
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
     */
    async trade(listingId, buyerId) {
        const listing = _listings.get(listingId);
        if (!listing) {
            return { error: 'Listing not found' };
        }
        
        // Trust check
        const trust = _getTrust();
        if (trust && trust.getScore) {
            const sellerTrust = trust.getScore(listing.seller);
            const buyerTrust = trust.getScore(buyerId);
            
            if (sellerTrust < 0.3) {
                return { error: 'Seller trust too low' };
            }
            
            // Record transaction for reputation
            trust.recordTrade(listing.seller, buyerId, listing.price);
        }
        
        const trade = {
            id: 'trade_' + crypto.randomBytes(4).toString('hex'),
            listingId,
            seller: listing.seller,
            buyer: buyerId,
            price: listing.price,
            timestamp: Date.now(),
            completed: false
        };
        
        // Mark listing as traded
        listing.trades++;
        
        _trades.set(trade.id, trade);
        
        _emit('market:trade', { trade, listing });
        
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
    stats: (...args) => getMarket().stats(...args)
};
