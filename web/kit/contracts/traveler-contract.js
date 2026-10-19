/**
 * THE TRAVELER CONTRACT - web/kit source, tr/1 (prd-web.md — the enterprise
 * router object; the SAME application the industrial lane names in
 * prd-automation.md, pointed at the web/dashboard/relay scope).
 *
 * WHAT IT IS: a schema-versioned, content-addressed STATE PACKET that
 * travels browser → relay → pod. Each hop validates the SCHEMA and appends
 * a step; no hop needs to understand the payload. The industrial lane's
 * horcrux carries a part's identity through a factory; the Traveler
 * carries an identity through ENTERPRISE hops (dashboards, relays, pods).
 * Same object, different carriers - the carrier is a local interface.
 *
 * THE THREE LAWS (mirroring the industrial router object):
 *   1. IDENTITY BY CONTENT: `id` is a content digest (hex, 16-64 chars).
 *      Any edit is a NEW id (the sender re-addresses through its own
 *      crypto layer - like the r/2 signing rule, crypto never lives in
 *      the kit). Validators treat the id as an opaque hex address.
 *   2. APPEND-ONLY LEDGER: `steps` is the workflow assimilation ledger.
 *      Steps arrive in ascending `seq`, never rewritten, never removed.
 *      A re-opened ledger (old seq again) is a REFUSAL, not a repair.
 *   3. SCHEMA-RIZE, NEVER GUESS: `schemaRize()` re-emits a packet of ANY
 *      KNOWN past version at the current version (tr/0 → tr/1), stamping
 *      the migration into the ledger. An UNKNOWN FUTURE version refuses
 *      typed (E_TRAVELER_SCHEMA) - the rizer never guesses forward.
 *
 * THE WIRE: the traveler rides the r/2 envelope family as payload:
 *   event  'relay.travel'  (bridge lane, HMAC-gated or browser lane)
 *   payload { ...the traveler object }
 * The pod face translates the ledger onto the door's existing verbs
 * (bridge families) - the door's own auth applies to every landing.
 *
 * Runtime-agnostic BY CONTRACT (same law as relay-contract.js): no Node
 * APIs, no Workers APIs - only standards (RegExp, Object, JSON). The
 * parity suite SCAN-CHECKS this file for runtime calls.
 */

'use strict';

// ---------------- identity ----------------

const TRAVEL_VERSION = 'tr/1';               // the current schema generation
const TRAVEL_WIRE_EVENT = 'relay.travel';    // the r/2 bridge lane event
const TRAVEL_MAX_CTEXT = 524288;             // 512 KiB state ceiling (r/2 face alignment)
const TRAVEL_STEP_MAX = 512;                 // step-ledger ceiling per packet
const TRAVEL_ID_RE_SOURCE = '^[0-9a-f]{16,64}$';

// legacy generation accepted by the rizer (structural normalize + ledger birth)
const TRAVEL_LEGACY_VERSIONS = ['tr/0'];
const TRAVEL_KNOWN = [TRAVEL_VERSION].concat(TRAVEL_LEGACY_VERSIONS);

// typed refusal code family (application refusals ride the r/2 200-ack)
const TRAVEL_CODES = Object.freeze({
    SHAPE: 'E_TRAVELER_SHAPE',       // not a traveler at all
    SCHEMA: 'E_TRAVELER_SCHEMA',     // unknown future schema version
    STEP: 'E_TRAVELER_STEP',         // ledger law violation (re-opened seq, gap, rewrite)
    ADDRESS: 'E_TRAVELER_ADDRESS'    // id is not an opaque hex address
});

// ---------------- builders ----------------

/**
 * The sender-side traveler builder (pure): schema-stamped, envelope-ready.
 * @param {object} p  { id, from, slots, steps?, legacy? }
 *   id      hex content digest (16-64) - the sender's own hash layer
 *   from    sender label (non-secret)
 *   slots   the state payload (object; opaque to every hop)
 *   steps   existing ledger when re-opening a packet; else one birth step
 * @returns {object}
 */
function wireTraveler(p) {
    const o = p || {};
    const steps = Array.isArray(o.steps)
        ? o.steps.slice(0, TRAVEL_STEP_MAX)
        : [{ seq: 1, op: 'open', by: o.from || 'unknown', ts: o.ts || 0 }];
    return {
        tr: TRAVEL_VERSION,
        id: o.id || '',
        from: o.from || 'vant-traveler',
        seq: steps.length,
        steps,
        slots: o.slots || {},
        v: { major: 2 }
    };
}

// ---------------- structural law (no crypto in the kit) ----------------

/**
 * Shape law. Returns null when the packet IS a structurally legal traveler;
 * returns { code, error } (a TRAVEL_CODES entry) when it is not. The id is
 * validated as an OPAQUE hex address - the kit never computes or trusts the
 * digest itself (identity-by-content is the sender's hash layer's job,
 * exactly like HMAC signing stays renderer-side in r/2).
 * @param {object} t
 * @returns {object|null}
 */
function travelerShape(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
        return refusalDef(TRAVEL_CODES.SHAPE, 'travel expects the traveler object.');
    }
    if (typeof t.tr !== 'string' || TRAVEL_KNOWN.indexOf(t.tr) === -1) {
        const code = (typeof t.tr === 'string' && /^tr\//.test(t.tr))
            ? TRAVEL_CODES.SCHEMA : TRAVEL_CODES.SHAPE;
        return refusalDef(code, 'unknown traveler version `' + (t.tr === undefined ? '(none)' : t.tr) +
            '` - known: ' + TRAVEL_KNOWN.join(', ') + '. The rizer never guesses forward.');
    }
    if (typeof t.id !== 'string' || !new RegExp(TRAVEL_ID_RE_SOURCE).test(t.id)) {
        return refusalDef(TRAVEL_CODES.ADDRESS, 'id must be an opaque hex content address (16-64 hex chars).');
    }
    if (!t.slots || typeof t.slots !== 'object' || Array.isArray(t.slots)) {
        return refusalDef(TRAVEL_CODES.SHAPE, 'slots must be an object (the state payload, opaque to hops).');
    }
    if (JSON.stringify(t.slots).length > TRAVEL_MAX_CTEXT) {
        return refusalDef(TRAVEL_CODES.SHAPE, 'slots exceed the ' + TRAVEL_MAX_CTEXT + ' byte state ceiling.');
    }
    if (!Array.isArray(t.steps) || t.steps.length === 0 || t.steps.length > TRAVEL_STEP_MAX) {
        return refusalDef(TRAVEL_CODES.STEP, 'steps must be a non-empty ledger (max ' + TRAVEL_STEP_MAX + ').');
    }
    let lastSeq = 0;
    for (const s of t.steps) {
        if (!s || typeof s !== 'object' || typeof s.op !== 'string'
            || Number.isFinite(s.seq) === false || s.seq !== lastSeq + 1) {
            return refusalDef(TRAVEL_CODES.STEP,
                'ledger law violation at seq ' + (s && s.seq) + ': steps arrive ascending, each seq = prev + 1 (append-only, no re-open).');
        }
        lastSeq = s.seq;
    }
    if (typeof t.seq === 'number' && t.seq !== t.steps.length) {
        return refusalDef(TRAVEL_CODES.STEP, 'seq must equal the ledger length (frozen stamp, not a claim).');
    }
    return null;
}

function refusalDef(code, error) {
    return { code, error };
}

/**
 * THE SCHEMA-RIZER: re-emit a traveler of any known past version at the
 * CURRENT version, preserving identity and ledger continuity.
 *   - current version → returned untouched (identity preserved, no stamp)
 *   - legacy (tr/0)   → normalized: legacy flat packets gain the ledger
 *     (an implicit `rize` birth step carries truth, never a re-write) and
 *     a `rized` stamp records { from } — the CALLER re-addresses (new id)
 *     through its own hash layer before transport, per the builder rule.
 *   - unknown future  → typed refusal, never a guess.
 * @param {object} t
 * @returns {object} the rized traveler, or the refusal shape from travelerShape
 */
function schemaRize(t) {
    const shapeRefusal = travelerShape(t);
    if (shapeRefusal) return shapeRefusal;
    if (t.tr === TRAVEL_VERSION) {
        return Object.assign({}, t, { seq: t.steps.length });
    }
    // legacy normalize: keep every slot verbatim (the payload is the part),
    // migrate the ledger with ONE truthful rize step, stamp the migration.
    const withStamp = Object.assign({}, t, {
        tr: TRAVEL_VERSION,
        steps: (t.steps ? t.steps : []).concat([{ seq: (t.steps ? t.steps.length : 0) + 1, op: 'rize', by: t.from || 'unknown', from: t.tr, ts: 0 }]),
        rized: { from: t.tr, to: TRAVEL_VERSION }
    });
    withStamp.seq = withStamp.steps.length;
    return withStamp;
}

module.exports = {
    TRAVEL_VERSION, TRAVEL_WIRE_EVENT, TRAVEL_MAX_CTEXT, TRAVEL_STEP_MAX,
    TRAVEL_ID_RE_SOURCE, TRAVEL_KNOWN, TRAVEL_CODES,
    wireTraveler, travelerShape, schemaRize
};
