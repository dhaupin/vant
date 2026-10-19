/**
 * THE RELAY CONTRACT - web/kit source, r/2 (prd-relay.md §2, pass 236)
 *
 * THE PASS-236 RULING REWRITES THIS CONTRACT: there is NO lib/relay
 * module on the pod (the pass-236 owner ruling — the relay composes the
 * webhook/door transports, lib/api.js face). r/1's REST hop face
 * (/api/r/exec + x-relay-gate) is RETIRED; r/2 is WEBHOOK-NATIVE:
 * senders HMAC-sign a crew-shaped envelope and post it to the relay's
 * webhook route, exactly like node-crew messages travel.
 *
 * This file is the UPLIFT SOURCE of the r/2 contract: the one definition
 * every relay renderer must hold a CHECKSUMMED COPY of (vendoring script:
 * scripts/vendor-relay-kit.js; .sha256 pin sidecar beside each vendored
 * copy; the parity pins FAIL on a pin that does not match kit head).
 *
 * Who holds a copy:
 *   - lib/api.js relay face holds its OWN plain-copy constants and the
 *     fresh suite pins them to THIS source (test/relay-parity.test.js).
 *     The pod never requires web/ (the one-way boundary, prd-web.md);
 *     parity is CHECKED, not imported.
 *   - web/dashboard + web/relay vendor copies by the same script — the
 *     DASHBOARD is a SECONDARY consumer (the owner ruling): it sends
 *     hop/ride envelopes to a relay's webhook route with the gate secret.
 *
 * THE WIRE (r/2):
 *   method  POST /relay on the relay's webhook server
 *   header  X-Signature-256: HMAC-SHA256 hex over the RAW UTF-8 body bytes
 *   body    { event: 'relay.hop' | 'relay.ride', from, ts, nonce,
 *             payload, v: { major: 2 } }   (crew-bus envelope shape)
 *   ack     { received: true, event, source, handlers, dispatched,
 *             reply: <the forward/door answer, reply-capable routes> }
 *
 *   relay.hop  payload = { origin, path, ct }  — the signer asks the relay
 *              to forward { ct } to origin+path; the upstream's answer
 *              rides the SAME post's ack back (reply.raw verbatim).
 *   relay.ride payload = { ct }              — the e2e envelope opens with
 *              the POD's channel key at the pod; the inner call dispatches
 *              to the pod's own MCP door; the door's answer re-envelopes
 *              into reply.ct.
 *
 * Transport refusals ride HTTP statuses (webhook transport's own):
 *   401 unsigned/missigned/stale, 409 replay, 404 route missing (posture
 *   OFF is route-missing), 413 over 1 MiB. The relay's APP-level refusals
 *   ride typed application replies inside the 200 ack:
 *   reply { ok:false, code } from the E_RELAY_* / E_RIDE_* families.
 *
 * Runtime-agnostic BY CONTRACT: no Node APIs, no Workers APIs - only
 * standards (RegExp, URL, TextEncoder), so one file serves both runtimes.
 */

'use strict';

// ---------------- identity ----------------

const CAPS_VERSION = 'r/2';
const CONTRACT_VERSION = 'r/2';
const WIRE_MAJOR = 2;
const SIGNATURE_HEADER = 'X-Signature-256';     // the HMAC gate header

const ROUTES = Object.freeze({
    relay: '/relay'                              // the ONE registered route
});

const EVENTS = Object.freeze({
    // the r/2 core (pod-as-relay + pod-as-endpoint)
    hop: 'relay.hop',
    ride: 'relay.ride',
    // the interface-handler bridge (pass 237, §3.3): typed families that
    // TRANSLATE onto the door's existing verbs - fronts and backs call
    // RELAY families, the relay handles auth, ingest, state beacons.
    // Implemented per flavor by capability: POD face = full family;
    // DASHBOARD edge = bridge through its own pod bridge (auth spent
    // server-side); SOLO edge = hop only (minimal always, holds nothing).
    sync: 'relay.sync',
    lost: 'relay.lost',
    call: 'relay.call'
});

// ---------------- the flavor registry ----------------
// Any deploy of the two frontend bundles is relay-shaped by construction;
// the pod core is the third flavor. A solo relay pins NO default profile.

const FLAVORS = Object.freeze({
    POD: 'headless-pod-relay',
    DASHBOARD: 'dashboard-relay',
    SOLO: 'solo-relay'
});

// ---------------- relay-side typed replies (inside 200 acks) ----------------
// Application-level refusals are NOT HTTP errors at r/2: their reasons ride
// back THROUGH any chain with the transport's ack-reply field on plain 200s.

const CODES = Object.freeze({
    UNKNOWN_EVENT: 'E_RELAY_UNKNOWN_EVENT',
    BAD_ORIGIN: 'E_RELAY_BAD_ORIGIN',
    BAD_PATH: 'E_RELAY_BAD_PATH',
    NEEDS_ENVELOPE: 'E_RELAY_NEEDS_ENVELOPE',
    UPST: 'E_RELAY_UPST',
    // the ride (pod-as-endpoint) family
    RIDE_OFFLINE: 'E_RIDE_OFFLINE',
    RIDE_DECODE: 'E_RIDE_DECODE',
    RIDE_REPLAY: 'E_RIDE_REPLAY',
    RIDE_DISPATCH: 'E_RIDE_DISPATCH'
});

// transport-level HTTP statuses (the webhook transport's own refusals)
const TRANSPORT_STATUS = Object.freeze({
    UNAUTHENTICATED: 401,         // unsigned / missigned / stale envelope
    REPLAY: 409,                  // identical signed bytes
    NOT_FOUND: 404,               // route never registered (posture OFF)
    TOO_LARGE: 413                // body over the shared 1 MiB cap
});

// ---------------- the envelope (encrypted pipes ONLY) ----------------
// lib/encrypt.js's AES-256-GCM hex fields. Ciphertext-only transport: a
// relay/sender that cannot open the channel key still RELAYS verbatim.

const ENVELOPE_RE_SOURCE = '^[0-9a-f]{32}:[0-9a-f]{24,32}:[0-9a-f]{32}:[0-9a-f]{2,}$';
const ENVELOPE_MIN_LEN = 92;
const MAX_CTEXT = 524288;        // 512 KiB per side at the hop stage
const HOP_TIMEOUT_MS = 15000;

// The liveness feed (the face emits these on the event system).
const RELAY_EVENTS = Object.freeze({
    served: 'relay:hop:served',
    rideServed: 'relay:ride:served',
    mounted: 'relay:mounted'
});

// ---------------- posture knobs per renderer ----------------
// The POD keys are brain-config keys (vant config set). The EDGE keys are
// Pages-settings env vars (env read at request time, never code strings).

const POD_CONFIG_KEYS = Object.freeze({
    enabled: 'relay.enabled',
    gateKey: 'relay.gateKey',                          // = the HMAC secret
    channelKey: 'relay.channelKey',
    intranetOrigins: 'relay.intranetOrigins',          // LAN-scope posture (pass 270): plain http ONLY for
                                                       // loopback/RFC1918 hops; the SSRF wall stays scoped to
                                                       // privateLan (cloud metadata still refused). OFF default.
    allowPrivateOrigins: 'relay.allowPrivateOrigins'   // lab escape, OFF default
});

const EDGE_ENV_KEYS = Object.freeze({
    enabled: 'VANT_RELAY_ENABLED',
    gateKey: 'VANT_RELAY_GATE_KEY',                    // = the HMAC secret
    podOrigin: 'VANT_RELAY_POD_ORIGIN'
});

// ---------------- contract functions ----------------

/**
 * Envelope SHAPE check. Structural only - no key material, never decrypts.
 * @param {string} s
 * @returns {boolean}
 */
function envelopeShape(s) {
    return typeof s === 'string'
        && s.length >= ENVELOPE_MIN_LEN
        && s.length <= MAX_CTEXT
        && new RegExp(ENVELOPE_RE_SOURCE).test(s);
}

/**
 * The sender-side envelope builder (pure): the shape every signer composes
 * before HMAC-signing the raw bytes. The SIGNING itself is renderer-specific
 * (node crypto vs WebCrypto SubtleCrypto) and must satisfy one RULE:
 * HMAC-SHA256 over the exact UTF-8 bytes that hit the wire, hex output.
 *
 * @param {string} event      EVENTS.hop | EVENTS.ride
 * @param {object} payload    { origin, path, ct } | { ct }
 * @param {number} ts         send milliseconds (freshness window seed)
 * @param {string} nonce      url-safe unique id (crypto.randomBytes or uuid)
 * @param {string} [from]     sender label (non-secret, informational)
 * @returns {object}
 */
function wireEnvelope(event, payload, ts, nonce, from) {
    return {
        event,
        from: from || 'vant-client',
        ts: typeof ts === 'number' ? ts : Date.now(),
        nonce: String(nonce || ''),
        payload,
        v: { major: WIRE_MAJOR }
    };
}

/**
 * The public capabilities object contract (any renderer's caps/info page).
 * The honest posture blocks are REQUIRED payload (the parity pins).
 * @param {string} flavor        one of FLAVORS
 * @param {boolean} gateReady    the HMAC secret actually set
 * @param {object} [opts]        { e2e, surface, events, posture }
 */
function capsShape(flavor, gateReady, opts) {
    const o = opts || {};
    return {
        relay: CAPS_VERSION,
        flavor,
        gated: true,
        gateReady: !!gateReady,
        e2e: o.e2e === undefined ? 'envelope-required' : o.e2e,
        surface: o.surface || ['POST ' + ROUTES.relay],
        events: o.events === undefined ? Object.values(EVENTS).join(', ') : o.events,
        posture: o.posture === undefined
            ? 'webhook-native: the gate IS the route HMAC secret; the relay holds no channel keys and no instance profile'
            : o.posture
    };
}

/**
 * IP public-ness (pure, no runtime APIs) - unchanged from r/1: the
 * outbound SSRF wall when an EDGE renderer forwards. Refuses: loopback,
 * RFC1918, CGNAT 100.64/10, link-local 169.254/16 (cloud metadata),
 * 0.0.0.0/8, ULA fc00::/7, link-local fe80::/10, multicast/reserved.
 * Fail-closed on the unknown (not-IP = private).
 *
 * @param {string} ip
 * @returns {boolean} true = private
 */
function isPrivateIp(ip) {
    if (typeof ip !== 'string') return true;
    const m4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (m4) {
        if (m4.slice(1).some((x) => parseInt(x, 10) > 255)) return true;
        const a = parseInt(m4[1], 10), b = parseInt(m4[2], 10);
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 192 && b === 0) return true;
        if (a === 198 && (b === 18 || b === 19)) return true;
        if (a >= 224) return true;
        return false;
    }
    const low = String(ip).toLowerCase();
    if (/^[0-9a-f:]+$/.test(low) && low.indexOf(':') !== -1) {
        if (low === '::' || low === '::1') return true;
        const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(low);
        if (mapped) return isPrivateIp(mapped[1]);
        const first = low.split(':')[0];
        if (/^fe[89ab]/.test(first)) return true;
        if (/^f[cd]/.test(first)) return true;
        if (/^ff/.test(first)) return true;
        return false;
    }
    return true;
}

/**
 * The hard-private subset (cloud metadata + 0.0.0.0) - refuses in EVERY
 * posture, including the pod's lab escape.
 */
function isHardPrivateIp(ip) {
    const m4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip));
    if (!m4) return false;
    const a = parseInt(m4[1], 10), b = parseInt(m4[2], 10);
    return (a === 169 && b === 254) || a === 0;
}

module.exports = {
    CONTRACT_VERSION, CAPS_VERSION, WIRE_MAJOR,
    SIGNATURE_HEADER, ROUTES, EVENTS, FLAVORS,
    CODES, TRANSPORT_STATUS,
    ENVELOPE_RE_SOURCE, ENVELOPE_MIN_LEN,
    MAX_CTEXT, HOP_TIMEOUT_MS,
    RELAY_EVENTS, POD_CONFIG_KEYS, EDGE_ENV_KEYS,
    envelopeShape, wireEnvelope, capsShape, isPrivateIp, isHardPrivateIp
};
