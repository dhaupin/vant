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
function _checkBudget(cost, agentId, workspace) {
    if (typeof cost !== 'number' || !Number.isFinite(cost)) {
        return { allowed: true };
    }
    const escrow = _getEscrow();
    if (!escrow || !escrow.canSpend) {
        return { allowed: true };
    }

    try {
        // (pass 83) context.workspace present -> the buyer draws from its
        // habitat workspace's org pool (workspace budgets); absent -> legacy
        // flat agent budget, untouched.
        return escrow.canSpend(agentId, cost, workspace ? { workspace } : undefined);
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
// (pass 99) Ids this process has ever SEEN (hydrated, adopted, or created).
// Append-only today (no market op hard-deletes an id), so these mirror the
// live maps — but they make the merge tombstone-ready BY CONSTRUCTION: the
// moment a delete path lands (drop a listing/bid/trade) it just removes the
// row from the live map and the id stays here, so adopt-unseen can never
// resurrect it from a peer's stale snapshot. Insurance, not dead code.
const _seenListings = new Set();
const _seenBids = new Set();
const _seenTrades = new Set();
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
const lock = require('./lock');
const MARKET_STATE_FILE = 'state/market.json';

// (pass 174) TREE TIER — market is the FOURTH live consumer of the state
// spine's tree tier (WIRING.md step ③; trust 172, node-registry 173,
// consensus 174). Listings/bids/trades mirror into one StateTree on
// hydrate and every merged persist; the root hash rides
// state:saved/state:hydrated + audit, so "same market state?" across
// processes is one string comparison. Mirror only — disk state stays in
// state/market.json.
let _tree = null;
function _stateTree() {
    if (!_tree) _tree = new stateStore.StateTree();
    return _tree;
}

function _serializeListings() {
    return Array.from(_listings.values()).map((l) => {
        const out = { ...l, supply: l.supply === Infinity ? null : l.supply };
        // (live-fire fix) _reserved is a HOT-state field (in-memory reservation
        // counts) — it rode as `_reserved: undefined`, which fine for the
        // JSON file (stringify drops undefined) but POISONED the tree tier:
        // canonical.encode refuses undefined → persistMerged failed, the
        // .state-anchor.jsonl row never landed, and the tier read as
        // 'never anchored'. Omit the key instead — _applyMarket resets it.
        delete out._reserved;
        return out;
    });
}

function _applyMarket(data) {
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.listings)) {
        for (const l of data.listings) {
            if (!l || typeof l.id !== 'string' || !l.type) continue;
            if (_listings.has(l.id)) { _seenListings.add(l.id); continue; } // in-memory wins (hot state)
            if (_seenListings.has(l.id)) continue; // seen-but-absent = local delete tombstone — never resurrect
            const restored = { ...l, _reserved: 0 };
            restored.supply = (l.supply === null || l.supply === undefined) ? Infinity : l.supply;
            _listings.set(l.id, restored);
            _seenListings.add(l.id);
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
            if (!b || typeof b.id !== 'string') continue;
            if (_bids.has(b.id)) { _seenBids.add(b.id); continue; }
            if (_seenBids.has(b.id)) continue; // local delete tombstone
            _bids.set(b.id, b);
            _seenBids.add(b.id);
        }
    }
    if (Array.isArray(data.trades)) {
        for (const t of data.trades) {
            if (!t || typeof t.id !== 'string') continue;
            if (_trades.has(t.id)) { _seenTrades.add(t.id); continue; }
            if (_seenTrades.has(t.id)) continue; // local delete tombstone
            _trades.set(t.id, t);
            _seenTrades.add(t.id);
        }
    }
}

/**
 * (pass 100) Adopt a peer's committed trade count from disk for a listing we
 * already hold. `_applyMarket` skips held listings (in-memory wins), so a
 * peer's committed `trades` never reached us — the scarcity reserve then saw
 * a stale count and two processes could each sell a supply-1 listing.
 * Called under the per-listing trade lock, immediately before the reserve, so
 * the check sees every committed sale.
 */
function _adoptCommittedTrades(listingId) {
    const local = _listings.get(listingId);
    if (!local) return;
    try {
        const { store, file } = stateStore.getStore(MARKET_STATE_FILE);
        if (!store.has(file)) return;
        const disk = JSON.parse(store.read(file));
        if (!disk || !Array.isArray(disk.listings)) return;
        const row = disk.listings.find((l) => l && l.id === listingId);
        if (row && Number.isFinite(row.trades) && row.trades > (local.trades || 0)) {
            local.trades = row.trades;
        }
    } catch (e) { /* best-effort: a read failure degrades to the in-memory count */ }
}

let _marketHydrated = false;
function _hydrate() {
    if (_marketHydrated) return;
    _marketHydrated = true;
    stateStore.hydrate({ moduleName: 'market', stateFile: MARKET_STATE_FILE, apply: _applyMarket, tree: _stateTree() });
}

function _persist() {
    // (pass 98) Cross-process merge: re-read the on-disk snapshot and adopt
    // unseen rows before writing the union. (pass 99) Listing/bid/trade ids
    // are append-only TODAY, but _applyMarket now tombstones seen-but-absent
    // ids, so a peer's stale snapshot cannot resurrect anything a future
    // delete path removes.
    stateStore.persistMerged({
        moduleName: 'market',
        stateFile: MARKET_STATE_FILE,
        merge: _applyMarket,
        serialize: () => ({
            listings: _serializeListings(),
            bids: Array.from(_bids.values()),
            trades: Array.from(_trades.values())
        }),
        tree: _stateTree()
    });
}

_hydrate();

const crypto = require('crypto');
const hash = require('./hash'); // (Wave U6) payload hashing — ONE hash source only

// (Wave A stage 2, pass 193) Private EventEmitter base RETIRED: every
// market event was already dual-emitted onto the shared bus through _emit()
// above — the instance's .on() surface had zero consumers, so the base
// class was dead weight. All market events ride _emit() → lib/event.js.
class Market {
    constructor(options = {}) {
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
            // (live-fire fix) summary rides only when given: an undefined
            // value makes the persisted listing non-JSON (canonical.encode
            // refuses undefined) — persist failed and the listing was lost
            // on restart (caught live in cross-process fire). Absent key ≡
            // nowhere (search reads l.summary via optional chaining).
            ...(data.summary !== undefined ? { summary: String(data.summary) } : {}),
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
            trades: 0,
            // (U6.5 productize) Skill-listing fields PERSIST now: payloadKind
            // (delivery validation reads it off the stored listing),
            // capabilityTag + attestation (buyer-visible). The prototype
            // passed them through listingData but list() dropped everything
            // it didn't name — skillStatus reported payloadKind:null and
            // deliverSkill validated against a silent 'text' default.
            ...(data.payloadKind !== undefined ? { payloadKind: String(data.payloadKind) } : {}),
            ...(data.capabilityTag ? { capabilityTag: String(data.capabilityTag) } : {}),
            ...(data.attestation ? { attestation: data.attestation } : {})
        };

        // (pass 40 / agora) Scope: optional, malformed REJECTED (fail-closed).
        // Scoped listings are invisible to non-members in search/get and
        // untradable by them. Persists with the listing (state-store).
        if (data.scope !== undefined) {
            // (census live-fire find) CREATE-PATH VALIDATION: this gate used
            // only normalize()+null-check, but scope's documented rule is
            // "create paths REJECT" (lib/scope isValid). An owner-less object
            // ({visibility:'private'} with no owner field) normalized to
            // {owner:null, visibility:'public'}: a private-intent listing
            // SILENTLY WIDENED to public. isValid() refuses the malformed
            // shape typed (fail-closed); every legit agent/org/dept/team
            // shape still stores exactly as before.
            if (!require('./scope').isValid(data.scope)) {
                _emit('market:blocked', { reason: 'scope', operation: 'list' });
                return { error: 'Invalid scope', code: 'E_SCOPE' };
            }
            const scopeRecord = require('./scope').normalize(data.scope);
            if (!scopeRecord) {
                _emit('market:blocked', { reason: 'scope', operation: 'list' });
                return { error: 'Invalid scope', code: 'E_SCOPE' };
            }
            listing.scope = scopeRecord;
        }

        // Store
        _listings.set(listing.id, listing);
        _seenListings.add(listing.id);
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
            // (census live-fire find) the twin of the market.list summary
            // bug this file already fixed: an undefined description made the
            // persisted state non-JSON (canonical.encode refuses undefined),
            // so _persist failed and the WHOLE market map was lost on
            // restart — the disk file never existed after a description-less
            // bid. Absent key = nowhere, exactly like list()'s summary law.
            ...(data.description !== undefined ? { description: String(data.description) } : {}),
            tags: data.tags || [],
            // (census live-fire find, same law) reward was the third
            // undefined-prone field: a reward-less bid re-found the persist
            // failure after the description fix. What they'll give:
            // 'knowledge:xyz' or 'favor:...' — absent key = nowhere.
            ...(data.reward !== undefined ? { reward: String(data.reward) } : {}),
            bidder: data.bidder || 'anonymous',
            created: Date.now(),
            fulfilled: false
        };

        _bids.set(bid.id, bid);
        _seenBids.add(bid.id);
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

        // (pass 40 / agora) Scope gate on trade: a scoped listing is only
        // tradable by its member set (the buyer context carries agentId).
        if (listing.scope && !require('./scope').canAccess(listing, agentId || buyerId)) {
            _emit('market:blocked', { reason: 'scope', operation: 'trade', listingId });
            return { error: 'Scope denied', code: 'E_SCOPE' };
        }

        // (pass 101) Pre-flight gates run OUTSIDE any lock: budget, escrow
        // hold, trust, and governance touch the BUYER's budget/reputation and
        // the trade's ethics — never the listing's scarcity accounting — so
        // they need no cross-process serialization and must not lengthen the
        // critical section below. Hoisting the awaits here is what lets the
        // lock (when taken) span a fully synchronous reserve→commit body.

        // 3. Escrow: Budget check + hold funds
        // (pass 83) context.workspace scopes the spend to the buyer's
        // habitat workspace org pool (workspace budgets).
        const budget = await _checkBudget(listing.price || 1, agentId || buyerId, context.workspace);
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
            const _buyerTrust = trust.getScore(buyerId);

            if (sellerTrust < 0.3) {
                // (pass 101) release the hold — every early return after the
                // hold must not leak a persisted escrow hold (leaks accumulate
                // to escrow.maxHolds and then fail ALL later trades).
                _releaseBudget(holdId);
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
                _releaseBudget(holdId);
                _emit('market:blocked', { reason: 'governance', operation: 'trade' });
                return { error: 'Governance: trade not allowed' };
            }
        }

        // ---- Cross-process critical section (SYNCHRONOUS) ----
        // (pass 31, stress A3) ATOMIC scarcity reserve + (pass 48) escrow
        // debit + settle. (pass 100) added cross-process serialization;
        // (pass 101) restructured so the lock spans ONLY this synchronous
        // body — every await moved above. Reserving and committing the
        // `trades` counter now happen with no interleaving await, so the
        // reservation cannot outlive the lock and a peer always re-reads a
        // settled counter. `_reserved` still covers same-process in-flight
        // reservations (JS single-thread), the file lock covers peers.
        const _commit = () => {
            const scarce = listing.supply !== Infinity;

            // (pass 100) Re-read the committed `trades` counter from disk.
            // Under the per-listing lock (scarce path) this makes the supply
            // check see every peer sale; for open-ended listings it is a
            // best-effort stat refresh (no scarcity to protect).
            _adoptCommittedTrades(listingId);

            if (scarce) {
                const open = listing.supply - listing.trades - (listing._reserved || 0);
                if (open <= 0) {
                    _releaseBudget(holdId);
                    _emit('market:blocked', { reason: 'sold_out', operation: 'trade', listingId });
                    return { error: 'Listing sold out' };
                }
                listing._reserved = (listing._reserved || 0) + 1;
            }

            // (pass 48 / next-wave 1) Escrow DEBIT at the settle point. The
            // hold never moved budget (escrow.hold records a condition entry;
            // release deletes it) — trades "paid" nothing, so market credit
            // was reserved, never spent. Debit the buyer now that every gate
            // has passed, mirroring _checkBudget's price normalization:
            // missing/zero price costs the default 1; barter strings carry no
            // escrow cost. recordSpend is instance-level (module exports spin
            // fresh persisted instances per call), so build one here.
            const debitPrice = listing.price || 1;
            const debitIdentity = agentId || buyerId;
            // (pass 83) workspace draw on settle: same scoping as the check.
            const debitWorkspace = context.workspace;
            let debitResult = null;
            if (typeof debitPrice === 'number' && Number.isFinite(debitPrice)) {
                const escrowMod = _getEscrow();
                if (escrowMod) {
                    const escrowInstance = escrowMod.create
                        ? escrowMod.create()
                        : new escrowMod.Escrow();
                    debitResult = escrowInstance.recordSpend(debitIdentity, debitPrice, debitWorkspace ? { workspace: debitWorkspace } : undefined);
                    if (!debitResult || debitResult.recorded !== true) {
                        // Debit refused (runaway guard or budget anomaly):
                        // no partial settlement — unwind reservation + hold.
                        if (scarce) listing._reserved = Math.max(0, (listing._reserved || 0) - 1);
                        _releaseBudget(holdId);
                        _emit('market:blocked', { reason: 'escrow_debit', operation: 'trade', error: debitResult && debitResult.error });
                        return { error: 'Could not debit budget: ' + ((debitResult && debitResult.error) || 'unknown'), code: (debitResult && debitResult.code) || 'E_DEBIT' };
                    }
                }
            }

            const trade = {
                id: 'trade_' + crypto.randomBytes(4).toString('hex'),
                listingId,
                seller: listing.seller,
                buyer: buyerId,
                price: listing.price,
                holdId: holdId,  // Escrow hold ID
                debit: debitResult ? { agent: debitIdentity, amount: debitPrice } : null, // (pass 48) actual escrow debit
                timestamp: Date.now(),
                completed: true  // Trade completed - funds released to seller
            };

            // 6. Escrow: Release held funds to seller
            const releaseResult = _releaseBudget(holdId);

            // Mark listing as traded — consumes the atomic reservation.
            listing.trades++;
            if (scarce) listing._reserved = Math.max(0, (listing._reserved || 0) - 1);

            _trades.set(trade.id, trade);
            _seenTrades.add(trade.id);
            _persist();

            _emit('market:trade', { trade, listing, escrowRelease: releaseResult });
            return trade;
        };

        // (pass 101) Open-ended listings have no scarcity to protect: skip
        // the per-listing cross-process lock entirely, so concurrent trades
        // are not serialized. The lock exists ONLY to make the supply check
        // and counter commit atomic across processes.
        if (listing.supply === Infinity) {
            return _commit();
        }

        // (pass 100/101) CROSS-PROCESS scarcity serialization for scarce
        // listings: hold a per-listing lock across the synchronous
        // reserve→commit body. FAIL-CLOSED — if the lock cannot be taken we
        // refuse the trade instead of degrading to unlocked (an unlocked
        // reserve can double-sell a supply-1 listing: the exact pass-100 bug).
        // The buyer's held budget is released on refusal.
        const tradeLock = lock.pathFor('market-trade', listingId);
        const res = await lock.withLock(tradeLock, () => _commit(), { staleMs: 10000, waitMs: 8000, failMode: 'closed' });
        if (res && res.ok === false && res.aborted) {
            _releaseBudget(holdId);
            _emit('market:blocked', { reason: 'trade_lock', operation: 'trade', listingId });
            return { error: 'Listing busy — could not acquire trade lock', code: 'E_TRADE_LOCK' };
        }
        return res;
    }

    /**
     * Search listings
     * (pass 40 / agora) Scoped listings are filtered by the caller's agentId:
     * a scoped listing is visible to its member set only (visibility rules
     * in lib/scope.js); unscoped/legacy listings stay public.
     */
    async search(filters = {}) {
        let results = Array.from(_listings.values()).filter((l) => {
            if (!l.scope) return true; // legacy/unscoped = public
            return filters.agentId
                ? require('./scope').canAccess(l, filters.agentId)
                : false; // scoped listing, anonymous search = invisible
        });

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
     * (pass 40 / agora) Scoped listings need canAccess; pass options.agentId
     * (second arg, optional). Unscoped listings behave as before.
     */
    get(listingId, options = {}) {
        const listing = _listings.get(listingId) || null;
        if (!listing) return null;
        if (listing.scope && !require('./scope').canAccess(listing, options.agentId)) {
            return null; // invisible, not 404-vs-403 — scoped means unseen
        }
        return listing;
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
    stats(agentId = null) {
        // (pass 41 live-fire fix) The byType/byTags indexes expose LISTING IDS
        // — a scoped listing showed up in the tags index of any caller, so
        // "scoped means unseen" leaked through the stats door. Non-member
        // callers get COUNTS ONLY; members (or admin/tool contexts with an
        // agentId that can see the listing) keep the useful index views.
        const scope = require('./scope');
        const canSee = (l) => !l.scope || (agentId && scope.canAccess(l, agentId));
        const visibleListings = [..._listings.values()].filter(canSee);
        const byType = {};
        const byTags = {};
        for (const l of visibleListings) {
            (byType[l.type] = byType[l.type] || []).push(l.id);
            for (const t of l.tags || []) {
                (byTags[t] = byTags[t] || []).push(l.id);
            }
        }
        return {
            listings: _listings.size,
            visible: visibleListings.length,
            bids: _bids.size,
            trades: _trades.size,
            types: byType,
            tags: byTags
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
// ==================== (Wave U6, prd-universe.md) SKILLS PROTOTYPE ============
// Credentialed marketplace: skills are paid digital labor. Buyers pay
// BEFORE seeing the payload, so the contract is: escrow holds the money,
// delivery must be verifiable, trust punishes mis-delivery. FULL DESIGN:
// labs/prototype-marketplace.md (schema, reputation, delivery contract,
// failure modes). GATE: market.skillsEnabled — OFF by default; every op
// returns typed E_SKILLS_DISABLED when the gate is off (inert, not absent).

const SKILLS_ENABLED_KEY = 'market.skillsEnabled';

function _skillsEnabled() {
    try {
        const config = require('./config');
        if (typeof config.get !== 'function') return false;
        // (U6.5 wiring) Consult BOTH layers: runtime flags/global config AND
        // the current brain's persisted config.json — `vant market skill-gate
        // on` writes the brain config (setConfig, pass-95 precedent), and a
        // brainless get() could not see it (the same gap config's own CLI
        // fixed). Precedence: runtime setFlag > env > brain config > off.
        let v = config.get(SKILLS_ENABLED_KEY);
        if (v === undefined || v === null || v === false) {
            const brainCfg = typeof config._currentBrainName === 'function' ? config._currentBrainName() : null;
            const brainName = brainCfg || process.env.VANT_BRAIN || 'vant';
            v = config.get(SKILLS_ENABLED_KEY, null, { brain: brainName });
        }
        return v === true || v === 'true' || v === 1;
    } catch (e) { return false; }
}
function _skillsDisabled() {
    return { error: 'skills prototype disabled (set ' + SKILLS_ENABLED_KEY + ' true)', code: 'E_SKILLS_DISABLED' };
}

function _validateSkillPayload(payloadKind, payload) {
    // (U6.6 disposition) The KIND check comes first and never inspects the
    // payload — listing-time validation has no payload yet (payloads are
    // validated at delivery), so a listing-time call passes payload=undefined
    // and still reads as a pure kind check. The whole credentialed-execution
    // class ('launch', 'eval', 'exec', anything not text|code) is one
    // documented boundary with one threat model that does not exist; the
    // refusal carries the WHY.
    if (payloadKind !== 'text' && payloadKind !== 'code') {
        return { error: 'unsupported payloadKind ' + JSON.stringify(payloadKind) + ' (supported: text|code; anything executed is a documented boundary — credentialed execution needs a sandboxed eval surface and a threat model that does not exist yet)', code: 'E_SKILL_PAYLOAD_KIND' };
    }
    if (typeof payload === 'undefined') return null; // kind-only probe (listing time)
    if (typeof payload !== 'string' || payload.trim().length === 0) {
        return { error: 'payload must be a non-empty string', code: 'E_SKILL_PAYLOAD' };
    }
    if (payload.length > 65536) {
        return { error: 'payload exceeds 64KB (prototype cap)', code: 'E_SKILL_PAYLOAD' };
    }
    return null;
}

/**
 * (U6.2) listSkill — list a skill listing. Rides market.list's gates by
 * delegating to it, then stamps the skill-specific REQUIRED fields.
 */
async function listSkill(data = {}, context = {}) {
    if (!_skillsEnabled()) return _skillsDisabled();
    const payloadKind = data.payloadKind || 'text';
    // (U6.6 disposition) ANY unsupported payloadKind is refused at listing
    // time — not just 'launch'. The whole class of credentialed/execute
    // kinds (launch, eval, exec, ...) shares one threat model that does
    // not exist; text|code is the complete supported surface. Getting here
    // with anything else is a typed refusal, never accepted-and-ignored.
    const kindCheck = _validateSkillPayload(payloadKind, undefined);
    if (kindCheck) return kindCheck;
    if (!data || !data.title || typeof data.title !== 'string') {
        return { error: 'title required', code: 'E_SKILL_TITLE' };
    }
    if (data.price !== undefined && (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 0)) {
        return { error: 'price must be a non-negative number', code: 'E_SKILL_PRICE' };
    }

    const listingData = {
        title: data.title,
        // market.list carries the seller in DATA (seller: data.seller ||
        // 'anonymous') — pass the CONTEXT identity through so skills credit
        // the real seller (reputation + delivery scoping anchor on it).
        seller: context.agentId || context.userId || data.seller || undefined,
        summary: data.description ? String(data.description).slice(0, 300) : '',
        price: typeof data.price === 'number' ? data.price : 1,
        payloadKind,
        capabilityTag: data.capabilityTag || null,
        attestation: data.attestation || null,
        tags: Array.isArray(data.tags) ? data.tags.slice(0, 8) : ['skill'],
        // (QC pass-204 — supply semantics) market.list defaults a listing to
        // supply 1 (a listing IS a scarce artifact). A SKILL is labor — the
        // contract's refute/timeout paths restore supply so the same unit
        // resells, and the settle flow re-delivers per trade — so the DEfault
        // here is unlimited, and scarcity applies ONLY when the seller
        // explicitly passes a finite supply. (QC live-fire caught this: the
        // shill-rep pins listed a re-subscribable service with no supply and
        // my new enforcement refused every buy after the first.)
        supply: data.supply === undefined ? Infinity : data.supply
    };
    const market = getMarket();
    // market.list returns the LISTING itself on success (shape: {id, ...},
    // an error envelope on refusal).
    const listing = await market.list('skill', listingData, context);
    if (listing && listing.error) return listing;
    if (!listing || !listing.id) return { error: 'listing create returned no id', code: 'E_SKILL_LISTING' };
    return { listed: true, listingId: listing.id, listing };
}

/**
 * (U6.2) buySkill — buyer opens a delivery trade: escrow hold (NOT a
 * debit yet), trade row skill_pending_delivery. Debit happens ONLY on
 * the buyer's confirm (hold→deliver→release; the pass-48/198 insight).
 */
async function buySkill(listingId, buyerId, context = {}) {
    if (!_skillsEnabled()) return _skillsDisabled();
    if (!listingId || typeof listingId !== 'string') return { error: 'listingId required', code: 'E_SKILL_LISTING' };
    const listing = _listings.get(listingId);
    if (!listing) return { error: 'Listing not found', code: 'E_SKILL_ABSENT' };
    if (listing.type !== 'skill') return { error: 'not a skill listing', code: 'E_SKILL_LISTING' };
    if (!buyerId) return { error: 'buyerId required', code: 'E_SKILL_BUYER' };
    if (listing.revoked) return { error: 'listing revoked — unsold supply cannot sell', code: 'E_SKILL_REVOKED' };

    // (QC pass-204 fix — the self-dealing hole) The seller buying their own
    // listing is a wash trade: it manufactures settled sales that feed
    // _shillResistantReputation AND let the seller refund-poll a buyer trust
    // leg (E_SKILL_NOT_BUYER used to be the ONLY guard, at settle — after
    // the hold + reservation already moved). Refuse at the START, where the
    // listing is the authoritative seller of record.
    const selfSeller = listing.seller || null;
    if (selfSeller && buyerId === selfSeller) {
        return { error: 'the seller cannot buy their own listing', code: 'E_SKILL_SELF_BUY' };
    }

    // (U6.5 productize fix — the double-charge) buySkill previously
    // delegated to market.trade(), whose pass-48 settle path DEBITS AT
    // TRADE TIME — then settleSkill('confirm') debited AGAIN: a buyer paid
    // twice for one skill. The skill flow now implements its own
    // hold-first contract directly (labs/prototype-marketplace.md §3):
    //   buy    → canSpend check + escrow HOLD (an audit entry, no money
    //            moved) + scarcity-reserving trade row 'pending_delivery'
    //   settle → confirm DEBITS + releases the hold; refute releases
    //            the hold ONLY (and restores the reservation).
    // No market.trade call: the debit point belongs to delivery-verified
    // settlement, not to purchase.
    const price = (typeof listing.price === 'number' && Number.isFinite(listing.price)) ? listing.price : 1;
    // (QC pass-204 fix — SCARCITY) buySkill reserved a trade row but never
    // checked the listing's open supply: a supply-1 skill was resellable
    // forever (two buyers held the same scarce unit; settlement then races
    // who owns the deliverable). Mirror the market.trade reserve contract:
    // re-read the committed `trades` counter (peers' settled sales), check
    // open supply, and serialize the reserve→commit through the SAME
    // per-listing trade lock, fail-closed.
    let holdId = 'skill:' + listingId + ':' + buyerId;
    const _reserveAndCommit = () => {
        if (listing.supply !== Infinity) {
            _adoptCommittedTrades(listingId);
            const open = listing.supply - listing.trades - (listing._reserved || 0);
            if (open <= 0) {
                _emit('market:blocked', { reason: 'sold_out', operation: 'skill_buy', listingId });
                return { error: 'skill sold out — no open supply', code: 'E_SKILL_SOLD_OUT' };
            }
            // Reserve synchronously (single-threaded here, lock held).
            listing._reserved = (listing._reserved || 0) + 1;
        }
        // (QC pass-204 fix — HOLD COLLISION) the hold id was
        // 'skill:<listing>:<buyer>' regardless of concurrent opens: a
        // second buy by the same buyer of the SAME listing overwrote the
        // first hold's escrow row, so one release path (settle/refute) in
        // one trade could strand both. The trade id (assigned after) is
        // the unique scope; mint it FIRST and use it in the hold id.
        holdId = 'skill:' + listingId + ':' + buyerId;
        return null;
    };
    const budget = await _checkBudget(price, buyerId, context.workspace);
    if (!budget.allowed) {
        return { error: 'buyer budget cannot cover the price (' + price + ')', code: 'E_SKILL_BUDGET' };
    }
    // (QC pass-204 fix — THE AWAIT) lock.withLock returns a PROMISE; the
    // un-awaited IIFE handed the guards a live promise object — truthy,
    // with no .held/.error — so a sold-out envelope skipped every guard
    // and the buy proceeded to trade creation anyway (scarce listings
    // were still double-sellable). Await the IIFE so the guards see the
    // real result (envelope | hold receipt).
    const holdResult = await (async function () {
        if (listing.supply === Infinity) {
            const r = _reserveAndCommit();
            if (r) return r;
            return _holdBudget(holdId, price, buyerId);
        }
        return await lock.withLock(lock.pathFor('market-trade', listingId), () => {
            const r = _reserveAndCommit();
            if (r) return r;
            return _holdBudget(holdId, price, buyerId);
        }, { staleMs: 10000, waitMs: 8000, failMode: 'closed' });
    })();
    if (holdResult && (holdResult.error || (holdResult.ok === false && holdResult.aborted))) {
        // (QC pass-204 fix) A typed refusal from the reserve/hold body —
        // sold-out or a busy trade lock — must SURFACE, never fall through
        // to trade creation. (The old guard checked `held === false`, but a
        // refusal envelope is truthy with `held` undefined, so a sold-out
        // buy silently proceeded.) Unwind any reservation first.
        if (listing.supply !== Infinity) listing._reserved = Math.max(0, (listing._reserved || 0) - 1);
        if (holdResult.ok === false && holdResult.aborted) {
            _emit('market:blocked', { reason: 'trade_lock', operation: 'skill_buy', listingId });
            return { error: 'listing busy — could not acquire trade lock', code: 'E_SKILL_TRADE_LOCK' };
        }
        return { error: holdResult.error, code: holdResult.code || 'E_SKILL_BUDGET' };
    }
    if (!holdResult || holdResult.held === false) {
        // Unwind the reservation: the hold failed or was refused — never
        // strand a reserve without its hold (the pass-49 leak class).
        if (listing.supply !== Infinity) listing._reserved = Math.max(0, (listing._reserved || 0) - 1);
        return { error: 'could not hold budget: ' + ((holdResult && holdResult.error) || 'unknown'), code: 'E_SKILL_BUDGET' };
    }

    const trade = {
        id: 'trade_' + crypto.randomBytes(4).toString('hex'),
        listingId,
        seller: listing.seller,
        buyer: buyerId,
        price: listing.price,
        holdId,           // escrow hold (no money moved yet)
        debit: null,      // set ONLY by the buyer's confirm
        timestamp: Date.now(),
        completed: false, // settled != bought; completion is the confirm
        skillState: 'pending_delivery'
    };
    // Commit the atomic reserve into the committed counter (the synchronous
    // `_reserved` unit is exchanged for a permanent `trades` row here — the
    // refute/sweep paths refund the row on release).
    if (listing.supply !== Infinity) {
        listing._reserved = Math.max(0, (listing._reserved || 0) - 1);
        listing.trades = (listing.trades || 0) + 1;
    } else {
        listing.trades = (listing.trades || 0) + 1;
    }
    _trades.set(trade.id, trade);
    _seenTrades.add(trade.id);
    _persist();
    _emit('market:skill:bought', { tradeId: trade.id, listingId, buyerId, holdId });
    return { bought: true, tradeId: trade.id, state: 'pending_delivery', escrowHold: holdId };
}

/**
 * (U6.2) deliverSkill — the SELLER delivers the payload: validated
 * against payloadKind, hashed (lib/hash.js), stored WITH the trade.
 * Delivery never blesses an unverified payload (bytes + hash only; the
 * buyer decides confirm/refute).
 */
async function deliverSkill(tradeId, payload, context = {}) {
    if (!_skillsEnabled()) return _skillsDisabled();
    if (!tradeId || typeof tradeId !== 'string') return { error: 'tradeId required', code: 'E_SKILL_TRADE' };
    const trade = _trades.get(tradeId);
    if (!trade) return { error: 'Trade not found', code: 'E_SKILL_ABSENT' };
    if ((trade.skillState || 'pending_delivery') !== 'pending_delivery') {
        return { error: 'trade not awaiting delivery', code: 'E_SKILL_STATE' };
    }
    const agentId = context.agentId || context.userId || null;
    const lockListing = _listings.get(trade.listingId);
    // The seller of record is the LISTING's seller — the trade row's own
    // `seller` field can be 'anonymous' when market.trade() was not handed
    // the identity (skills list with an explicit agentId; the listing is
    // the authoritative who-made-it).
    const _skillSellerId = (lockListing && lockListing.seller) || trade.seller || null;
    // Trade rows carry the buyer as `buyer` (market.trade shape), not buyerId.
    if (agentId && trade.buyer && agentId === trade.buyer) {
        return { error: 'seller-side delivery refused: caller is the buyer', code: 'E_SKILL_NOT_SELLER' };
    }
    const kindCheck = _validateSkillPayload(lockListing ? (lockListing.payloadKind || 'text') : 'text', payload);
    if (kindCheck) return kindCheck;

    trade.skillPayload = payload;
    trade.skillPayloadHash = hash.sha256(payload);
    trade.skillState = 'delivered';
    trade.deliveredAt = Date.now();
    _persist();
    _emit('market:skill:delivered', { tradeId, listingId: trade.listingId, payloadHash: trade.skillPayloadHash });
    return { delivered: true, tradeId, payloadHash: trade.skillPayloadHash };
}

/**
 * (U6.2) settleSkill — buyer confirm or refute (the ONLY release paths;
 * the seller cannot settle their own sale). Confirm DEBITS (escrow
 * real-money semantics) + records the positive trust feed; refute
 * releases the hold with NO debit + records the negative feed.
 */
async function settleSkill(tradeId, decision, context = {}) {
    if (!_skillsEnabled()) return _skillsDisabled();
    if (!tradeId || typeof tradeId !== 'string') return { error: 'tradeId required', code: 'E_SKILL_TRADE' };
    if (decision !== 'confirm' && decision !== 'refute') {
        return { error: "decision must be 'confirm' or 'refute'", code: 'E_SKILL_DECISION' };
    }
    const trade = _trades.get(tradeId);
    if (!trade) return { error: 'Trade not found', code: 'E_SKILL_ABSENT' };
    if (trade.skillState === 'settled' || trade.skillState === 'refuted') {
        return { error: 'trade already settled (' + trade.skillState + ') — double settlement refused', code: 'E_SKILL_ALREADY_SETTLED' };
    }
    if (trade.skillState !== 'delivered' || !trade.skillPayload) {
        return { error: 'no deliverable payload on this trade yet', code: 'E_SKILL_STATE' };
    }
    const agentId = context.agentId || context.userId || null;
    const settleListing = _listings.get(trade.listingId);
    const skillSellerId = (settleListing && settleListing.seller) || trade.seller || null;
    if (agentId && skillSellerId && agentId === skillSellerId) {
        return { error: 'the seller cannot decide their own sale', code: 'E_SKILL_NOT_BUYER' };
    }
    // (QC pass-204 fix — BUYER-ONLY SETTLE) The settle decision moves REAL
    // money (confirm debits) or releases a hold (refute) — it must belong to
    // the BUYER of record, the way delivery belongs to the seller. The old
    // check only excluded the seller: any third party (or an identity-less
    // MCP call) could settle/confirm someone else's trade and steer the
    // debit. With no caller identity, an identity-anchored trade row
    // (skill flow always writes trade.buyer at buy time) still refuses:
    // "who is settling" is unknowable, and an unknowable settle of a real
    // debit is not a settle.
    const tradeBuyerId = trade.buyer || null;
    if (skillSellerId && tradeBuyerId && skillSellerId === tradeBuyerId) {
        // A wash-used trade row (should be impossible to reach via buySkill
        // post-self-buy guard; defense in depth for restored legacy rows).
        return { error: 'trade row is self-dealing (buyer == seller) — settlement refused', code: 'E_SKILL_SELF_DEAL' };
    }
    if (agentId && tradeBuyerId && agentId !== tradeBuyerId) {
        return { error: 'only the buyer of record (' + tradeBuyerId + ') can settle this trade (caller: ' + agentId + ')', code: 'E_SKILL_NOT_BUYER' };
    }
    if (!agentId && tradeBuyerId) {
        return { error: 'settle requires the buyer identity — this trade was bought as ' + tradeBuyerId, code: 'E_SKILL_IDENTITY_REQUIRED' };
    }

    const buyerName = tradeBuyerId || agentId;
    const price = (typeof trade.price === 'number' && Number.isFinite(trade.price)) ? trade.price : 1;
    const trustMod = _getTrust();

    let trustError = null;
    if (decision === 'confirm') {
        // DEBIT — money moves only on buyer confirmation (once).
        const escrowMod = _getEscrow();
        if (escrowMod) {
            const escrowInstance = escrowMod.create ? escrowMod.create() : new escrowMod.Escrow();
            const debit = escrowInstance.recordSpend(buyerName, price);
            if (!debit || debit.recorded !== true) {
                // Debit refused: the hold stays (no partial settlement).
                return { error: 'could not debit buyer (' + ((debit && debit.error) || 'unknown') + ') — no settlement', code: (debit && debit.code) || 'E_DEBIT' };
            }
            trade.debit = { agent: buyerName, amount: price };
            // The hold is now converted into a real debit — release it.
            _releaseBudget(trade.holdId);
        }
        trade.skillState = 'settled';
        trade.settledAt = Date.now();
        trade.settleDecision = 'confirm';
        // (U6.3) reputation: positive cooperation record scaled by deal size.
        if (trustMod && typeof trustMod.record === 'function' && skillSellerId) {
            try {
                trustMod.record(skillSellerId, 'market_skill_delivery', {
                    positive: true,
                    value: Math.min(0.2, price / 50),
                    note: 'skill settled by buyer',
                    tradeId
                }, { agentId: buyerName });
            } catch (e) { trustError = e.message; }
        }
    } else {
        trade.skillState = 'refuted';
        trade.settledAt = Date.now();
        trade.settleDecision = 'refute';
        // Refute RELEASES THE HOLD ONLY — no debit ever moved, and the
        // listing's supply reservation is restored (an unsold skill).
        _releaseBudget(trade.holdId);
        if (settleListing) settleListing.trades = Math.max(0, (settleListing.trades || 1) - 1);
        if (trustMod && typeof trustMod.record === 'function' && skillSellerId) {
            try {
                trustMod.record(skillSellerId, 'market_skill_delivery', {
                    positive: false,
                    note: 'skill delivery refuted by buyer',
                    tradeId
                }, { agentId: buyerName });
            } catch (e) { trustError = e.message; }
        }
    }
    _persist();
    _emit('market:skill:settled', { tradeId, decision, trustError });
    return { settled: true, decision, tradeId, payloadHash: trade.skillPayloadHash, trustWritten: !trustError };
}

/**
 * (U6.2 aid) skillStatus — buyer-visible pre-trade snapshot: listing
 * health + seller reputation (so reputation is visible BEFORE paying).
 */
async function skillStatus(listingId) {
    if (!_skillsEnabled()) return _skillsDisabled();
    const listing = _listings.get(listingId);
    if (!listing) return { error: 'Listing not found', code: 'E_SKILL_ABSENT' };
    let sellerRep = null;
    try {
        const trustMod = _getTrust();
        const trustInst = trustMod && trustMod.getTrust ? trustMod.getTrust() : null;
        if (trustInst && typeof trustInst.getScore === 'function') sellerRep = trustInst.getScore(listing.seller);
    } catch (e) { sellerRep = null; }
    const awaitingConfirmation = Array.from(_trades.values()).filter(t => t.listingId === listingId && t.skillState === 'delivered').length;
    return {
        listingId,
        title: listing.title,
        description: listing.summary || null,
        price: listing.price || 1,
        payloadKind: listing.payloadKind || null,
        capabilityTag: listing.capabilityTag || null,
        revoked: !!listing.revoked,
        seller: listing.seller,
        sellerReputation: sellerRep,
        awaitingConfirmation,
        // (U6.6) reputation is shill-resistant — surfaced pre-trade.
        reputation: _shillResistantReputation(listing.seller)
    };
}

// ==================== (Wave U6.6) TIMEOUT + EVIDENCE RULES ============
// An unsettled skill trade never resolves on its own: the buyer's escrow
// hold would sit open forever. The playbook said "no automated timeout
// penalty (no evidence)" — the sweep closes that by sweeping ONLY WITH
// typed evidence of what actually happened, never by guessing:
//
//   skillState           age > TTL      resolution
//   -------------------- -------------- -------------------------------
//   pending_delivery     exceeded       hold RELEASED, no debit, supply
//                                       restored, NO trust record — the
//                                       seller may still be slow, that is
//                                       not actionable evidence
//   delivered            exceeded       left ALONE: the buyer owes the
//                                       settle decision; taking it away
//                                       would let ambivalent buyers bury
//                                       confirmations (clock favoring the
//                                       side that never reacts is the
//                                       BLUNT verdict the sweep refuses)
//   settled/refuted      any            left ALONE (terminal)
//
// TTL comes from market.skillsTradeTtlMs (runtime > env alias
// VANT_MARKET_SKILLS_TRADE_TTL_MS > brain config; default 72h). The sweep
// runs ON-DEMAND (explicit call — CLI/MCP/cron `vant market skill-sweep`),
// never a background timer that penalizes a quiet process.
const SKILLS_TTL_KEY = 'market.skillsTradeTtlMs';
function _skillsTtlMs() {
    try {
        const config = require('./config');
        let v = config.get(SKILLS_TTL_KEY);
        if (v === undefined || v === null) {
            const brainName = (typeof config._currentBrainName === 'function' && config._currentBrainName()) || process.env.VANT_BRAIN || 'vant';
            v = config.get(SKILLS_TTL_KEY, null, { brain: brainName });
        }
        const n = typeof v === 'string' ? parseInt(v, 10) : v;
        if (!(typeof n === 'number' && Number.isFinite(n) && n > 0)) return 72 * 60 * 60 * 1000;
        // (QC pass-204 fix) The ENV path clamps in lib/config.js (60s–30d);
        // the brain-config path never did — a 1ms TTL insta-swept fresh
        // trades (a stealth refute). Clamp BOTH paths to the same window.
        return Math.min(Math.max(n, 60 * 1000), 30 * 24 * 60 * 60 * 1000);
    } catch (e) { return 72 * 60 * 60 * 1000; }
}

async function skillSweep(_context = {}) {
    if (!_skillsEnabled()) return _skillsDisabled();
    const ttl = _skillsTtlMs();
    const now = Date.now();
    const expired = [];
    for (const trade of _trades.values()) {
        if (trade.skillState !== 'pending_delivery') continue;
        const age = now - (trade.timestamp || 0);
        if (age <= ttl) continue;
        // Same invariants as a refute — but with the seller-side evidence
        // note instead of a buyer accusation. The listing row may already
        // be gone (revoked + pruned); _releaseBudget tolerates a dead id.
        _releaseBudget(trade.holdId);
        const listing = _listings.get(trade.listingId);
        if (listing) listing.trades = Math.max(0, (listing.trades || 1) - 1);
        trade.skillState = 'timed_out';
        trade.settledAt = now;
        trade.settleDecision = 'timeout';
        trade.evidence = { ttlMs: ttl, agedMs: age, stage: 'pending_delivery' };
        expired.push({ tradeId: trade.id, listingId: trade.listingId, agedMs: age, ttlMs: ttl, stage: 'pending_delivery' });
        _emit('market:skill:timeout', expired[expired.length - 1]);
    }
    if (expired.length) _persist();
    return { swept: true, ttlMs: ttl, timedOut: expired.length, trades: expired };
}

// ==================== (Wave U6.6) SHILL-RESISTANT REPUTATION ==========
// The U6.3 feed writes one trust record per settle outcome. A shill ring
// defeats a raw sum: one buyer confirms a fake listing twenty times →
// sky-high score. The aggregation here re-computes the seller's market
// reputation FROM THE MARKET'S OWN trade legs with three teeth:
//
//   1. Per-buyer cap: a single buyer contributes at most MIN(3, half the
//      seller's sales) MINIMALLY-WEIGHTED settles — burst-pumping is capped
//      even by a whale who honestly pays.
//   2. Distinct-buyer weighting: score is scaled by distinct/total so a
//      seller needs real, separate counterparties for a high score.
//   3. Concentration flag: one buyer owning MOST of the sales is
//      surfaced to the buyer BEFORE paying (refusals stay invisible in
//      the score — that is the tool's honest "we suspect, cannot prove").
function _shillResistantReputation(sellerId) {
    if (!sellerId) return null;
    const settled = [];
    for (const t of _trades.values()) {
        if (t.listingId == null || t.seller !== sellerId) continue;
        if (t.skillState !== 'settled') continue;
        const listing = _listings.get(t.listingId);
        if (!listing) continue;
        settled.push({ buyer: t.buyer, price: t.price, skillSellerId: (listing && listing.seller) || t.seller });
    }
    // Only settles credited to THIS seller key (the listing's seller) count.
    const mine = settled.filter(s => s.skillSellerId === sellerId);
    const transactions = mine.length;
    if (transactions === 0) return { sellerId, transactions: 0, score: 0, distinctBuyers: 0, shillSuspicion: null };
    const byBuyer = new Map();
    for (const s of mine) {
        const b = s.buyer || 'anonymous';
        byBuyer.set(b, (byBuyer.get(b) || 0) + 1);
    }
    const distinctBuyers = byBuyer.size;
    // Weighted sum: a buyer's pull is capped (per tooth 1) and each unit
    // they do contribute is scaled by distinct/total (tooth 2).
    const cap = Math.min(3, Math.ceil(transactions / 2));
    let weighted = 0;
    const scale = distinctBuyers / transactions;
    for (const [, count] of byBuyer) weighted += Math.min(count, cap) * scale;
    const score = Math.min(1, weighted / transactions);
    // Concentration signal: max share owned by a single buyer.
    let maxCount = 0;
    for (const [, c] of byBuyer) maxCount = Math.max(maxCount, c);
    return {
        sellerId,
        transactions,
        distinctBuyers,
        score: Math.round(score * 1000) / 1000,
        maxBuyerShare: transactions ? Math.round((maxCount / transactions) * 100) / 100 : 0,
        shillSuspicion: maxCount / transactions >= 0.5 && transactions >= 3 ? 'concentrated' : null
    };
}

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

    // (Wave U6, prd-universe.md) Skills prototype — GATED (market.skillsEnabled):
    listSkill,
    buySkill,
    deliverSkill,
    settleSkill,
    skillStatus,
    skillSweep,
    SKILLS_ENABLED_KEY,
    SKILLS_TTL_KEY,
    _shillResistantReputation,

    // Multibrain Stack
    getStackMarketStats,
    gatherState,
    restoreState,

    // (pass 38) Persistence seams (test/ops)
    _persistNow: () => _persist(),
    _resetHydration: () => { _marketHydrated = false; },
    // (pass 99) Test seam: drop a row from the live map WITHOUT clearing its
    // seen-set entry — models the hard-delete path that does not exist yet,
    // so the tombstone-aware merge ("seen-but-absent is never re-adopted")
    // can be regression-locked before the delete lands.
    _deleteForTest: (kind, id) => {
        if (kind === 'listing') {
            const l = _listings.get(id);
            if (l) {
                const t = _index.byType.get(l.type); if (t) _index.byType.set(l.type, t.filter((x) => x !== id));
                for (const tag of (l.tags || [])) { const a = _index.byTags.get(tag); if (a) _index.byTags.set(tag, a.filter((x) => x !== id)); }
                const ag = _index.byAgent.get(l.seller); if (ag) _index.byAgent.set(l.seller, ag.filter((x) => x !== id));
            }
            _listings.delete(id);
        } else if (kind === 'bid') { _bids.delete(id); }
        else if (kind === 'trade') { _trades.delete(id); }
        return true;
    },
    clearState: () => { stateStore.clear(MARKET_STATE_FILE); _listings.clear(); _bids.clear(); _trades.clear(); _seenListings.clear(); _seenBids.clear(); _seenTrades.clear(); _index.byType.clear(); _index.byTags.clear(); _index.byAgent.clear(); _tree = null; _marketHydrated = true; return true; },
    // (pass 174) Tree-tier seams (mirror of trust/registry/consensus): root
    // hash of the live mirror (null before first touch).
    _treeRoot: () => (_tree ? _tree.rootHash() : null),
    _stateTree,
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
            // (pass 41 live-fire find) was bare `stats()` — an identifier that
            // does not exist in module scope (the Market METHOD is stats(), the
            // module-level name is getMarket). Every brain returned
            // { error: 'stats is not defined' } and the try/catch swallowed it,
            // so stack stats were permanently empty. Same bare-ref class as
            // the error.js batch (pass 22) and agents emit() (pass 32).
            const marketStats = getMarket().stats();
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
    // (pass 99) Wholesale horcrux restore replaces state — drop tombstones
    // with it and re-mark everything the restore installs as seen.
    _seenListings.clear();
    _seenBids.clear();
    _seenTrades.clear();
    if (data && data.listings) {
        for (const [id, listing] of data.listings) {
            _listings.set(id, { ...listing, _reserved: 0 });
            _seenListings.add(id);
        }
    }
    if (data && data.bids) {
        for (const [id, bid] of data.bids) {
            _bids.set(id, bid);
            _seenBids.add(id);
        }
    }
    if (data && data.trades) {
        for (const [id, trade] of data.trades) {
            _trades.set(id, trade);
            _seenTrades.add(id);
        }
    }
    _persist();
    return { restored: true, listings: _listings.size, bids: _bids.size, trades: _trades.size };
}
