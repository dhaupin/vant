/**
 * The boost lane (wave G, vant#340, riding the wave-F plates primitive).
 *
 * Wherever hosted communities run their own surfaces (the wave-F channel +
 * plate world), the same demand arrives immediately: "show mine more."
 * Engines that answer with bought RANK poison the surface — paid placement
 * over organic order is a canonical trust-destroyer. This module is the
 * rank-neutral answer, four laws verbatim from the note:
 *
 *   1. A BOOST BUYS DISPLAY TIME, NEVER RANK. The purchasable is a bounded
 *      window (seconds); the organic order is never touched — this export
 *      carries no ordering verb at all. A boosted row enters the feature
 *      window; the organic rows stay in the organic order. Extend (a
 *      replayed id returns the SAME window), never improve.
 *
 *   2. BOOSTED ROWS SELF-IDENTIFY. The marker rides the plate render as an
 *      ENGINE-ADDED label (lib/plates integration — row.boost + the
 *      featureWindow export), never seller's copy: no authorial text can
 *      ride the window, the same no-free-text discipline as everywhere.
 *
 *   3. TENANCY IS BOOST-NEUTRAL. A boosted row answers to its channel's
 *      own visibility exactly as an unboosted row does — the viewer's
 *      window list and the plate marker are computed THROUGH the owner's
 *      gate. A boost can never leak a gated row to a reader who could not
 *      see it organically; an unverifiable cell is withheld, not assumed.
 *
 *   4. IDEMPOTENT, ENGINE-OWNED ACCOUNTING. The purchase is a module-owned
 *      record (id -> window). The same id replays the SAME window (with
 *      no second recorded event — an audit journal that never double-counts
 *      the sale); the same id with a DIFFERENT intent refuses typed
 *      (E_BOOST_ID_CONFLICT); one row cannot hold two live windows (a
 *      second id over a busy cell is E_BOOST_OVERLAP — money cannot stack
 *      a row's clock); every NEW window emits `boost:recorded` on the bus
 *      (the typed economy-events pattern), so integrators audit the
 *      feature window the same way they audit the sale.
 *
 * Windows are the engine's accounting truth; durable sinks ride the bus
 * (integrators persist what they trade on). audit() serves the journal
 * sorted and closed — a read, like everything here.
 */

const eventBus = (() => {
    try { return require('./event'); } catch (e) { return null; }
})();

const _boosts = new Map();   // boost id -> window record (engine-owned purchase ledger)

const MAX_ID = 80;
const MAX_SECONDS = 31536000;   // 365d — a feature window, not a lease

function _strOk(s, max) {
    return typeof s === 'string' && s.trim() && s.length <= max;
}

function _err(error, code) {
    return { error, code };
}

// The channel contract lives with the plates registry (lazy require: the
// boost and plates modules point at each other at RUN time, never load time).
function _channelNamed(name) {
    let plates = null;
    try { plates = require('./plates'); } catch (e) { plates = null; }
    if (!plates) return null;
    try {
        return plates.listChannels().find((c) => c.name === name) || null;
    } catch (e) { return null; }
}

function _channelCfg(name) {
    let plates = null;
    try { plates = require('./plates'); } catch (e) { plates = null; }
    if (!plates || !plates._channels) return null;
    return plates._channels.get(name) || null;
}

// Tenancy at the window (law 3): resolve the owner's gate against THEIR rows.
function _viewerCanSee(channelCfg, rowId, viewer) {
    if (!channelCfg || !viewer) return false;          // unverifiable cell withheld
    if (channelCfg.visibility === 'public') return true;
    if (typeof channelCfg.visibility !== 'function') return false;
    let rows;
    try { rows = channelCfg.rows(); } catch (e) { return false; }
    if (!Array.isArray(rows)) return false;
    const row = rows.find((r) => r && (r.id === rowId || r.rowId === rowId)) || null;
    if (!row) return false;                            // no row, no verdict, no leak
    try { return channelCfg.visibility(row, viewer) === true; } catch (e) { return false; }
}

function _activeAt(now) {
    const out = [];
    for (const b of _boosts.values()) {
        if (b.endsAt > now) out.push(b);
    }
    return out;
}

// ==================== THE PURCHASE (accounting) =============================

/**
 * Record a boost purchase: one bounded feature window over ONE row on ONE
 * plate-registered channel. The channel must exist in the plates registry —
 * a boost binds a declared surface, never a phantom one.
 */
function record(opts = {}) {
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
        return _err('opts must be an object', 'E_BOOST_INPUT');
    }
    if (!_strOk(opts.id, MAX_ID)) {
        return _err('boost id required (the idempotency key of the purchase)', 'E_BOOST_INPUT');
    }
    const id = opts.id.trim();
    if (!_strOk(opts.channel, MAX_ID) || !_strOk(opts.rowId, MAX_ID) || !_strOk(opts.by, MAX_ID)) {
        return _err('boost requires channel, rowId and by (who buys) as strings', 'E_BOOST_INPUT');
    }
    if (!_strOk(opts.by, MAX_ID)) {
        return _err('by (the buyer) is required - accounting names its sale', 'E_BOOST_INPUT');
    }

    // Idempotent accounting (law 4): same id + same intent = the SAME window,
    // no second event, no double-buy. Same id + different intent = conflict.
    const prior = _boosts.get(id);
    if (prior) {
        if (prior.channel === opts.channel && prior.rowId === opts.rowId
            && prior.by === opts.by && prior.seconds === opts.seconds) {
            return { recorded: true, replayed: true, boost: { ...prior } };
        }
        return _err('boost id ' + id + ' already recorded with a different window', 'E_BOOST_ID_CONFLICT');
    }

    const seconds = opts.seconds;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS) {
        return _err('seconds must be a positive finite window (<= ' + MAX_SECONDS + ')', 'E_BOOST_WINDOW');
    }
    const startsAt = (Number.isFinite(opts.at) && opts.at >= 0) ? opts.at : Date.now();

    // The window binds a declared channel (no phantom surfaces).
    if (!_channelNamed(opts.channel)) {
        return _err('unknown channel: ' + opts.channel + ' - a boost binds a plate-registered surface', 'E_BOOST_UNKNOWN_CHANNEL');
    }

    // Rank stays untouched by construction (law 1): one window per cell at a
    // time — checked as a SPAN intersection, not an instant: a cell busy
    // until T and a candidate starting after T do not stack anything.
    const cellEnds = startsAt + seconds * 1000;
    const busy = Array.from(_boosts.values()).find(
        (b) => b.channel === opts.channel && b.rowId === opts.rowId
            && b.startsAt < cellEnds && startsAt < b.endsAt
    );
    if (busy) {
        return _err('row already inside a live feature window (' + busy.id + '); extend by replaying it, never by stacking', 'E_BOOST_OVERLAP');
    }

    const boostRec = {
        id,
        channel: opts.channel,
        rowId: opts.rowId,
        by: opts.by,
        seconds,
        startsAt,
        endsAt: startsAt + seconds * 1000,
        recordedAt: Date.now()
    };
    _boosts.set(id, boostRec);
    _emit('boost:recorded', { id, channel: boostRec.channel, rowId: boostRec.rowId, by: boostRec.by, endsAt: boostRec.endsAt });
    return { recorded: true, replayed: false, boost: { ...boostRec } };
}

// ==================== THE WINDOW (reads) ====================================

/**
 * The live feature windows for a viewer. Tenancy rides the owner's gate
 * (law 3): on a gated channel a window the viewer cannot see is withheld
 * and counted — the boost never widens a viewer. The response is the UNIT
 * list (id, window bounds); it makes no ordering promise — organic order
 * belongs to the serving surface, never to the purchase.
 */
function active(opts = {}) {
    if (typeof opts !== 'object' || opts === null) {
        return _err('opts must be an object', 'E_BOOST_INPUT');
    }
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    let windows = _activeAt(now);
    if (_strOk(opts.channel, MAX_ID)) windows = windows.filter((b) => b.channel === opts.channel);

    let withheld = 0;
    if (opts.viewer !== undefined) {
        const seen = [];
        for (const b of windows) {
            if (_viewerCanSee(_channelCfg(b.channel), b.rowId, opts.viewer)) seen.push(b);
            else withheld++;
        }
        windows = seen;
    }
    windows.sort((a, b) => (a.startsAt - b.startsAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return {
        windows: windows.map((b) => ({ ...b })),
        withheld,
        now
    };
}

/**
 * The full purchase journal — how the audit sees the feature windows the
 * same way it sees settlements (law 4). Sorted, closed, read-only.
 */
function audit() {
    const records = Array.from(_boosts.values()).sort(
        (a, b) => (a.recordedAt - b.recordedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    return { count: records.length, records };
}

// ---------- tests/ops seams (read cohabitants; no write verbs for rows) -----

function _clear() {
    _boosts.clear();
    return true;
}

module.exports = {
    record,
    active,
    audit,
    _boosts,     // read-only inspection for tests
    clearState: _clear
};

function _emit(event, data) {
    if (eventBus && eventBus.emit) {
        try { eventBus.emit(event, data); } catch (e) { /* the bus never gates a read */ }
    }
}
