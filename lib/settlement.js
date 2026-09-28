/**
 * Cross-node Settlement (pass 67 / frame.md §5 gap 4 — weights & measures)
 *
 * The first ECONOMIC leg of the Commons. Frame.md §4's sovereignty line
 * says it precisely: budgets are sovereign (Ground — the escrow file
 * never leaves the node that owns it), but "settlement records (escrow
 * notes cross as data)". This module is that leg:
 *
 *   - The DEBIT runs where the budget lives (the buyer's own node,
 *     pass-48's rule — escrow.recordSpend on the partner's books).
 *   - The LISTING OWNER's node records a CLAIM — that a settlement for
 *     its listing happened, at what price, by whom. It never touches
 *     its own escrow on this leg: nothing is owed TO the owner's books
 *     here (credit-side accounting is a deliberate non-goal for v1 —
 *     the owner's record is evidence, not income).
 *
 *   PARTNER (buyer's node)                      OWNER (seller's node)
 *   ----------------------                      ----------------------
 *   invoice = makeInvoice(...)                        |
 *   escrow.canSpend → recordSpend → hold              |
 *   send settle.request ──────HMAC wire──────────▶ validate invoice
 *   (pending, timeout armed)                      registered peers only
 *                                                 listing exists? scope
 *                                                 admits the buyer?
 *                                                 price matches listing?
 *                                                 idempotent by
 *                                                 settlementId
 *   ◀──────────────settle.record (accepted)────── record CLAIM locally
 *   release hold; DONE                            (state-store, merge-
 *                                                  only adoption)
 *   on refusal / timeout:
 *   UNWIND — refund the spend,
 *   release the hold. Money never
 *   hangs in flight.
 *
 * Trust posture (identical to every agora leg — no new crypto, no new
 * trust path):
 *   - Registered peers only: an unknown origin gets no settlement
 *     recorder, signed or not (the agora-sync state-oracle rule).
 *   - Scope resolves OWNER-SIDE where the team registry lives
 *     (pass-50 rule): a scoped listing is only settleable by its
 *     member set, and the buyer's principal is resolved through
 *     node-registry.resolvePrincipal (the pass-59 vetted-identity
 *     fix — transport ids lose to vetted agents).
 *   - Provenance is the ENVELOPE, not the payload: the invoice's
 *     claimed node field is ignored; the settling node is env.from.
 *   - Reply legs are sender-bound and correlation-keyed (pass-51 rule):
 *     a settle.record resolves only the pending invoice it was sent for,
 *     and only from the node that invoice was addressed to.
 *   - Idempotency: the owner records ONE claim per settlementId; a
 *     replayed invoice is re-acked with the SAME record, never
 *     double-recorded. The partner's debit is also idempotent in
 *     effect — a re-accepted invoice does not re-spend (the pending
 *     promise has already resolved; a late duplicate record resolves
 *     nothing).
 *   - Fail-closed everywhere: malformed invoices are dropped silently
 *     (bad actors learn nothing); scope/refusal paths unwind the
 *     partner's money BEFORE the wire leg where possible, and by
 *     refund after.
 *
 * Envelope types (crew.<type>):
 *   settle.request  { invoice }                 partner → owner
 *   settle.record   { settlementId, accepted, reason?, code?, record? }
 *                                               owner → partner
 *   settle.query    { settlementId, reqId }     owner → partner (recon)
 *   settle.status   { settlementId, reqId, status }  partner → owner
 */

const crypto = require('crypto');

// ---------- state (the claims ledger) ----------

const stateStore = require('./state-store');
const SETTLEMENT_STATE_FILE = 'state/settlements.json';

// settlementId -> record. Both roles write here (each record carries
// `role`: 'owner-claim' written by the listing owner's node,
// 'partner-paid' mirrored by the buyer's node). One file, one shape.
const _settlements = new Map();

let _hydrated = false;
function _hydrate() {
    if (_hydrated) return;
    _hydrated = true;
    stateStore.hydrate({
        moduleName: 'settlement',
        stateFile: SETTLEMENT_STATE_FILE,
        apply: (snapshot) => {
            if (snapshot && Array.isArray(snapshot.settlements)) {
                for (const s of snapshot.settlements) {
                    if (s && typeof s.id === 'string' && !_settlements.has(s.id)) {
                        _settlements.set(s.id, s); // merge-only: in-memory wins
                    }
                }
            }
        }
    });
}

function _persist() {
    stateStore.persist({
        moduleName: 'settlement',
        stateFile: SETTLEMENT_STATE_FILE,
        data: { settlements: Array.from(_settlements.values()) }
    });
}
_hydrate();

// ---------- validation helpers ----------

const MAX_PRICE = 1000000;
const AGENT_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SETTLEMENT_ID_RE = /^stl_[a-zA-Z0-9_-]{4,40}$/;

/**
 * Validate an invoice (inbound payload or pre-flight outbound check).
 * Returns a normalized invoice or null when malformed (drop silently —
 * the agora rule: bad actors learn nothing).
 */
function _validInvoice(inv) {
    if (!inv || typeof inv !== 'object' || Array.isArray(inv)) return null;
    if (typeof inv.settlementId !== 'string' || !SETTLEMENT_ID_RE.test(inv.settlementId)) return null;
    if (typeof inv.listingId !== 'string' || inv.listingId.length < 4 || inv.listingId.length > 64) return null;
    if (typeof inv.price !== 'number' || !Number.isFinite(inv.price) || inv.price <= 0 || inv.price > MAX_PRICE) return null;
    if (typeof inv.buyer !== 'string' || !AGENT_RE.test(inv.buyer)) return null;
    if (typeof inv.seller !== 'string' || !AGENT_RE.test(inv.seller)) return null;
    // Optional fields: undefined OR null mean ABSENT (the wire drops
    // undefined keys in JSON, and our own normalization writes null) —
    // a present-but-non-string value is the malformed case, absence is
    // not. (Found by the pin suite: 'null' failed the typeof check and
    // every no-topic invoice was silently refused owner-side.)
    const hasTopic = inv.topic !== undefined && inv.topic !== null;
    const hasMemo = inv.memo !== undefined && inv.memo !== null;
    if (hasTopic && (typeof inv.topic !== 'string' || inv.topic.length > 100)) return null;
    if (hasMemo && (typeof inv.memo !== 'string' || inv.memo.length > 200)) return null;
    return {
        settlementId: inv.settlementId,
        listingId: inv.listingId,
        price: inv.price,
        buyer: inv.buyer,
        seller: inv.seller,
        topic: typeof inv.topic === 'string' ? inv.topic : null,
        memo: typeof inv.memo === 'string' ? inv.memo.slice(0, 200) : null
    };
}

function _freshEscrow() {
    const escrowMod = require('./escrow');
    return escrowMod.create ? escrowMod.create() : new escrowMod.Escrow();
}

function _refundSpend(agentId, amount) {
    try { _freshEscrow().refund(agentId, amount); } catch (e) { /* best-effort unwind */ }
}
function _releaseHold(settlementId) {
    try { _freshEscrow().release('settlement:' + settlementId); } catch (e) { /* best-effort unwind */ }
}

// One listener set + one pending set per bus (install is idempotent per
// bus; twin buses in one process never cross-resolve — the agora-sync
// pattern, keyed per bus instance).
const _installed = new WeakSet();
const _busRefs = new Map(); // label -> bus
const _pendingByBus = new WeakMap(); // bus -> Map(settlementId -> pending)

const DEFAULT_TIMEOUT_MS = 8000;

function busName(bus) {
    return (bus.status && bus.status().name) || null;
}

function _pendingFor(bus) {
    let m = _pendingByBus.get(bus);
    if (!m) {
        m = new Map();
        _pendingByBus.set(bus, m);
    }
    return m;
}

// Owner-side pending reconciliation queries, keyed per bus too.
const _queryPendingByBus = new WeakMap();
function _queryPendingFor(bus) {
    let m = _queryPendingByBus.get(bus);
    if (!m) {
        m = new Map();
        _queryPendingByBus.set(bus, m);
    }
    return m;
}

function pendingKey(bus, reqId) {
    return (busName(bus) || 'bus') + ':' + String(reqId);
}

// Registered-peers-only check (the state-oracle rule).
function _isRegisteredPeer(bus, from) {
    let peers;
    try { peers = bus.nodes(); } catch (e) { peers = []; }
    return peers.some((p) => p.name === from);
}

/**
 * Partner side: the local debit. canSpend → recordSpend → hold, all in
 * one synchronous section (no await between check and spend — the
 * market pass-31 discipline), so two parallel invoices cannot both
 * spend the same available credit. Returns { ok, error?, code? }.
 */
function _debitLocally(inv) {
    const escrow = _freshEscrow();
    const check = escrow.canSpend(inv.buyer, inv.price);
    if (!check || check.allowed !== true) {
        return { ok: false, error: 'Insufficient budget', code: 'E_BUDGET' };
    }
    const spend = escrow.recordSpend(inv.buyer, inv.price);
    if (!spend || spend.recorded !== true) {
        return { ok: false, error: (spend && spend.error) || 'Spend refused', code: (spend && spend.code) || 'E_DEBIT' };
    }
    let held;
    try {
        held = escrow.hold('settlement:' + inv.settlementId, {
            amount: inv.price, agent: inv.buyer, type: 'mesh_settlement'
        });
    } catch (e) {
        _refundSpend(inv.buyer, inv.price);
        return { ok: false, error: 'Hold failed: ' + e.message, code: 'E_HOLD' };
    }
    if (!held || held.held !== true) {
        // maxHolds or similar — unwind the spend before refusing.
        _refundSpend(inv.buyer, inv.price);
        return { ok: false, error: (held && held.reason) || 'Hold refused', code: 'E_HOLD' };
    }
    return { ok: true };
}

/**
 * Partner side: full unwind (refund + release). Used on refusal,
 * timeout, and send failure.
 */
function _unwind(inv) {
    _refundSpend(inv.buyer, inv.price);
    _releaseHold(inv.settlementId);
}

/**
 * Wire the settle.* dispatchers onto a bus. Call once per node. A node
 * may be owner, partner, or both (symmetric install is normal — the
 * same pattern agora-sync uses). Idempotent per bus.
 *
 * @param {object} bus - a createBus() instance (or the singleton)
 */
function install(bus) {
    if (!bus || typeof bus.onDispatch !== 'function') {
        throw new Error('settlement.install: bus required');
    }
    if (_installed.has(bus)) return { installed: true, already: true };
    _installed.add(bus);
    _busRefs.set(busName(bus) || ('bus-' + _busRefs.size), bus);

    const pending = _pendingFor(bus);
    const queryPending = _queryPendingFor(bus);

    // ---------- OWNER side: a partner presents an invoice ----------
    bus.onDispatch('settle.request', (env) => {
        const from = env && env.from;
        const inv = _validInvoice(env && env.payload && env.payload.invoice);
        if (!inv) return; // malformed: drop silently
        if (!_isRegisteredPeer(bus, from)) return; // no recorder for strangers

        const sendRefusal = (reason, code) => {
            bus.send(from, 'settle.record', {
                settlementId: inv.settlementId, accepted: false, refused: true,
                reason, code, from: busName(bus)
            }).catch(() => { /* best-effort */ });
        };

        // Listing verification: the claim is only as good as the listing
        // it settles. Missing listing → refusal (not silence — the
        // partner's money is in flight and MUST be unwound by an
        // explicit refusal, never by a timeout).
        // (pass-40 rule applied CORRECTLY here): the lookup runs as the
        // OWNER principal — an anonymous market.get would be blind to
        // this node's own scoped listings (scoped means unseen), refusing
        // every legitimate scoped settlement. The owner may see its own
        // listing; the partner still cannot — scope admission for the
        // BUYER is checked separately below.
        const ownerPrincipal = (bus.status && bus.status().agentId) || busName(bus);
        let listing = null;
        try { listing = require('./market').get(inv.listingId, { agentId: ownerPrincipal }); } catch (e) { listing = null; }
        if (!listing) {
            sendRefusal('Listing not found', 'E_NO_LISTING');
            return;
        }

        // Buyer identity: the invoice's claimed buyer is only accepted
        // when it MATCHES the vetted principal for the sending node.
        // resolvePrincipal is registry-first (the pass-59 fix): the
        // vetted agent identity beats the crew_ transport id; the
        // fallback is the node name itself.
        let principal = from;
        try {
            principal = require('./node-registry').resolvePrincipal(from) || from;
        } catch (e) { /* registry unavailable: node-name fallback stands */ }
        if (inv.buyer !== principal) {
            sendRefusal('Invoice buyer does not match the sending node\'s vetted principal', 'E_BUYER_MISMATCH');
            return;
        }

        // Scope resolves OWNER-SIDE where the team registry lives
        // (pass-50 rule): a scoped listing settles only for its member set.
        if (listing.scope) {
            let visible = false;
            try {
                visible = !!require('./scope').canAccess({ scope: listing.scope }, principal);
            } catch (e) { visible = false; } // scope layer broken: fail-closed
            if (!visible) {
                sendRefusal('Scope denied', 'E_SCOPE');
                return;
            }
        }

        // Price integrity: the invoice must state the listing's own
        // price when the listing carries a numeric one (a partner cannot
        // claim a discount on the wire).
        if (typeof listing.price === 'number' && Number.isFinite(listing.price) && listing.price !== inv.price) {
            sendRefusal('Invoice price does not match the listing price', 'E_PRICE_MISMATCH');
            return;
        }

        // Idempotency: one claim per settlementId. A replay is re-acked
        // with the SAME record — never double-recorded.
        const existing = _settlements.get(inv.settlementId);
        if (existing) {
            bus.send(from, 'settle.record', {
                settlementId: inv.settlementId, accepted: true, record: existing, from: busName(bus)
            }).catch(() => { /* best-effort */ });
            return;
        }

        // Record the claim (data crossing the boundary — frame §4: the
        // escrow note crosses as data; the owner's books are not touched).
        const record = {
            id: inv.settlementId,
            kind: 'mesh_settlement',
            role: 'owner-claim',
            listingId: inv.listingId,
            price: inv.price,
            buyer: principal,
            seller: typeof listing.seller === 'string' ? listing.seller : inv.seller,
            node: from,                 // provenance = the envelope, not the payload
            topic: inv.topic,
            memo: inv.memo,
            scope: listing.scope || null,
            status: 'recorded',
            settledAt: Date.now()
        };
        _settlements.set(record.id, record);
        _persist();

        bus.send(from, 'settle.record', {
            settlementId: record.id, accepted: true, record, from: busName(bus)
        }).catch(() => { /* best-effort */ });
    });

    // ---------- PARTNER side: the owner's acceptance/refusal ----------
    bus.onDispatch('settle.record', (env) => {
        const payload = env && env.payload;
        if (!payload || typeof payload !== 'object' || typeof payload.settlementId !== 'string') return;
        const entry = pending.get(payload.settlementId);
        if (!entry) return; // unsolicited / late — drop
        // Sender binding (pass-51 rule): the record must come from the
        // node the invoice was addressed to.
        if (entry.node && env.from !== entry.node) return;
        clearTimeout(entry.timer);
        pending.delete(payload.settlementId);
        if (payload.accepted === true) {
            // Mirror the owner's claim locally (role flips — this node
            // was the settling party). Merge-only: a local record with
            // the same id wins, the wire never rewrites local history.
            if (payload.record && typeof payload.record === 'object' && !_settlements.has(payload.settlementId)) {
                _settlements.set(payload.settlementId, { ...payload.record, role: 'partner-paid' });
                _persist();
            }
            _releaseHold(payload.settlementId);
            entry.resolve({ settled: true, record: payload.record || null });
        } else {
            // Refused: unwind BEFORE resolving — money never rests on a no.
            _unwind({ settlementId: payload.settlementId, price: entry.price, buyer: entry.buyer });
            entry.resolve({ settled: false, reason: (payload.reason || 'refused'), code: payload.code || null });
        }
    });

    // ---------- OWNER side: reconciliation query ----------
    bus.onDispatch('settle.query', (env) => {
        const from = env && env.from;
        const p = env && env.payload;
        if (!p || typeof p.settlementId !== 'string') return;
        if (!_isRegisteredPeer(bus, from)) return;
        const record = _settlements.get(p.settlementId) || null;
        // A query for a settlement we never recorded answers
        // { status: null } explicitly — the asker can stop retrying.
        bus.send(from, 'settle.status', {
            settlementId: p.settlementId, reqId: p.reqId || null,
            status: record ? record.status : null, from: busName(bus)
        }).catch(() => { /* best-effort */ });
    });

    // ---------- PARTNER side: query reply (sender-bound) ----------
    bus.onDispatch('settle.status', (env) => {
        const payload = env && env.payload;
        if (!payload || typeof payload !== 'object' || typeof payload.settlementId !== 'string') return;
        const entry = queryPending.get(pendingKey(bus, payload.reqId));
        if (!entry) return;
        if (entry.from && env.from !== entry.from) return;
        clearTimeout(entry.timer);
        queryPending.delete(pendingKey(bus, payload.reqId));
        entry.resolve({ asked: true, settlementId: payload.settlementId, status: payload.status || null });
    });

    return { installed: true, already: false };
}

// ---------- public API ----------

/**
 * Build an invoice (partner side). The settlementId is generated here;
 * price/buyer/seller come from the trade context. Memo bounded to 200.
 */
function makeInvoice({ listingId, price, buyer, seller, topic, memo }) {
    if (typeof listingId !== 'string' || listingId.length < 4 || listingId.length > 64) {
        throw new Error('settlement.makeInvoice: invalid listingId');
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
        throw new Error('settlement.makeInvoice: invalid price');
    }
    if (typeof buyer !== 'string' || !AGENT_RE.test(buyer)) throw new Error('settlement.makeInvoice: invalid buyer');
    if (typeof seller !== 'string' || !AGENT_RE.test(seller)) throw new Error('settlement.makeInvoice: invalid seller');
    if (topic !== undefined && (typeof topic !== 'string' || topic.length > 100)) {
        throw new Error('settlement.makeInvoice: invalid topic');
    }
    return {
        settlementId: 'stl_' + crypto.randomBytes(6).toString('hex'),
        listingId,
        price,
        buyer,
        seller,
        topic: topic || undefined,
        memo: typeof memo === 'string' ? memo.slice(0, 200) : undefined,
        ts: Date.now()
    };
}

/**
 * Partner side: settle a peer's listing — debit locally, present the
 * invoice, await the owner's acceptance. Resolves:
 *   { settled: true, record }                    — owner recorded the claim
 *   { settled: false, reason, code? }            — refused (money refunded)
 *   { settled: false, reason: 'timeout'|'send_failed: …' } — unwound
 *
 * @param {object} bus - configured bus with the owner registered
 * @param {string} ownerNode - the listing owner's node name
 * @param {object} invoice - from makeInvoice()
 * @param {object} [opts] - { timeoutMs: 8000 }
 */
async function sendInvoice(bus, ownerNode, invoice, opts = {}) {
    if (!bus || typeof bus.send !== 'function') {
        throw new Error('settlement.sendInvoice: bus required');
    }
    const inv = _validInvoice(invoice);
    if (!inv) throw new Error('settlement.sendInvoice: invalid invoice');
    const timeoutMs = Math.min(parseInt(opts.timeoutMs, 10) || DEFAULT_TIMEOUT_MS, 60000);

    if (!_installed.has(bus)) install(bus);

    // Debit locally BEFORE the wire leg (the debit lives where the
    // budget lives). Sync section: check → spend → hold, no awaits.
    const debited = _debitLocally(inv);
    if (!debited.ok) {
        return { settled: false, reason: debited.error, code: debited.code };
    }

    const pending = _pendingFor(bus);
    const result = await new Promise((resolve) => {
        const timer = setTimeout(() => {
            pending.delete(inv.settlementId);
            _unwind(inv); // money never hangs in flight
            resolve({ settled: false, reason: 'timeout' });
        }, timeoutMs);
        pending.set(inv.settlementId, {
            resolve, timer, node: ownerNode, price: inv.price, buyer: inv.buyer
        });
        bus.send(ownerNode, 'settle.request', { invoice: inv }).catch((e) => {
            clearTimeout(timer);
            pending.delete(inv.settlementId);
            _unwind(inv);
            resolve({ settled: false, reason: 'send_failed: ' + e.message });
        });
    });
    return result;
}

/**
 * Owner side (or any recorded view): ask a partner what became of a
 * settlement (reconciliation). Resolves { asked: true, status } |
 * { asked: false, reason }.
 */
async function requestStatus(bus, partnerNode, settlementId, opts = {}) {
    if (!bus || typeof bus.send !== 'function') {
        throw new Error('settlement.requestStatus: bus required');
    }
    if (typeof settlementId !== 'string' || !SETTLEMENT_ID_RE.test(settlementId)) {
        return { asked: false, reason: 'invalid_settlement_id' };
    }
    const timeoutMs = Math.min(parseInt(opts.timeoutMs, 10) || DEFAULT_TIMEOUT_MS, 60000);
    const reqId = crypto.randomBytes(8).toString('hex');
    if (!_installed.has(bus)) install(bus);
    const queryPending = _queryPendingFor(bus);
    const result = await new Promise((resolve) => {
        const timer = setTimeout(() => {
            queryPending.delete(pendingKey(bus, reqId));
            resolve({ asked: false, reason: 'timeout' });
        }, timeoutMs);
        queryPending.set(pendingKey(bus, reqId), { resolve, timer, from: partnerNode });
        bus.send(partnerNode, 'settle.query', { settlementId, reqId }).catch((e) => {
            clearTimeout(timer);
            queryPending.delete(pendingKey(bus, reqId));
            resolve({ asked: false, reason: 'send_failed: ' + e.message });
        });
    });
    if (!result.asked) return { asked: false, reason: result.reason };
    return result;
}

/**
 * Local settlement records (the claims ledger). Both roles' records
 * live here (role: 'owner-claim' | 'partner-paid').
 */
function list() {
    return Array.from(_settlements.values())
        .sort((a, b) => (b.settledAt || 0) - (a.settledAt || 0));
}

function get(settlementId) {
    return _settlements.get(settlementId) || null;
}

/**
 * Counts for mesh-status: aggregates only — settlement memo/topic stay
 * local (scope protects content; the status surface carries counts).
 */
function status() {
    let recorded = 0, paid = 0;
    for (const s of _settlements.values()) {
        if (s.role === 'partner-paid') paid++;
        else recorded++;
    }
    let pendingCount = 0;
    _busRefs.forEach((bus) => {
        const m = _pendingByBus.get(bus);
        if (m) pendingCount += m.size;
    });
    return {
        count: _settlements.size,
        ownerClaims: recorded,
        partnerPaid: paid,
        pending: pendingCount
    };
}

// ---------- test/ops seams (the market/_resetHydration pattern) ----------

module.exports = {
    install,
    makeInvoice,
    sendInvoice,
    requestStatus,
    list,
    get,
    status,
    _persistNow: () => _persist(),
    _resetHydration: () => { _hydrated = false; },
    _stateFile: SETTLEMENT_STATE_FILE,
    clearState: () => {
        stateStore.clear(SETTLEMENT_STATE_FILE);
        _settlements.clear();
        _hydrated = true;
        return true;
    }
};
