import type { Handler } from "../../types";
import {
    CAPS_VERSION,
    SIGNATURE_HEADER,
    EVENTS,
    CODES,
    TRANSPORT_STATUS,
    MAX_CTEXT,
    HOP_TIMEOUT_MS,
    EDGE_ENV_KEYS,
    envelopeShape,
    isPrivateIp,
    isHardPrivateIp,
} from "../../lib/relay-contract.cjs";

/**
 * SOLO-relay flavor, r/2 (pass 236 ruling): a PURE relay anyone hosts
 * SOLO - chain hops ONLY, no admin surfaces BY CONSTRUCTION. The wire is
 * WEBHOOK-NATIVE: the same crew-shaped envelope the pod's webhook
 * transport serves (web/kit/contracts/relay-contract.js r/2, vendored +
 * pinned). The retired r/1 REST hop face (/api/r/exec + x-relay-gate) is
 * gone; this intake is POST /api/r/relay.
 *
 *   1. posture gate  - VANT_RELAY_ENABLED; off = the deploy is NOT a relay
 *                      and carries no route (404, parity with the pod)
 *   2. key gate      - enabled without VANT_RELAY_GATE_KEY serves nothing
 *                      (503 fail-closed: nothing to verify against)
 *   3. THE GATE IS THE HMAC SECRET - X-Signature-256 over the RAW UTF-8
 *      body bytes, WebCrypto HMAC-SHA256 + constant-time digest compare;
 *      the secret is spent at verification, NEVER rides upstream
 *   4. stale ts -> 401 (the edge is stateless: no cross-request replay
 *      cache; the ts window is the honest edge-side memory, the pod adds
 *      the byte-identical replay gate on its own transport)
 *   5. the envelope  - AES-256-GCM hex only; bent shapes = typed refusal
 *      INSIDE the 200 ack (application-level, never an HTTP error)
 *   6. origin guard  - https-only (the edge has NO lab escape), IP
 *                      literals range-checked; metadata/hard-private NEVER
 *                      pass; names by reachability at fetch time.
 *
 * Ack shape (r/2): { received, event, handlers, dispatched, reply } - the
 * forward's answer rides the SAME post's ack back (reply.raw verbatim).
 */

const BODY_LIMIT = 1024 * 1024;     // the doors' shared 1 MiB cap
const FRESHNESS_WINDOW_MS = 10 * 60 * 1000;

interface RelayAck {
    received: boolean;
    event: string;
    handlers: number;
    dispatched: number;
    reply?: unknown;
}

// (repo lint gate) built from char codes to avoid the no-control-regex
// rule — the same convention lib/vaf.js uses for its control-char scan;
// semantics identical to the literal /[\x00-\x1f]/ it replaces.
const _HAS_CONTROL_CHARS = new RegExp(
    '[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']',
    'u',
);

function ack(payload: RelayAck, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "content-type": "application/json",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
        },
    });
}

function plain(status: number, payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "content-type": "application/json",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
        },
    });
}

/** WebCrypto HMAC-SHA256 over the exact raw bytes + constant-time compare. */
async function signatureVerdictOk(raw: string, presented: string, secret: string): Promise<boolean> {
    if (!/^[0-9a-f]{64}$/i.test(presented)) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    // constant-time: both sides are fixed 64-hex digests at this point
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ presented.charCodeAt(i);
    return diff === 0;
}

function enabled(env: Record<string, unknown>): boolean {
    const v = env[EDGE_ENV_KEYS.enabled];
    return v === "1" || v === "true";
}

function gateSecret(env: Record<string, unknown>): string | null {
    const v = env[EDGE_ENV_KEYS.gateKey];
    return typeof v === "string" && v.length >= 16 ? v : null;
}

interface CrewEnvelope {
    event?: unknown;
    from?: unknown;
    ts?: unknown;
    nonce?: unknown;
    payload?: unknown;
    v?: { major?: unknown };
}

export const onRequestPost: Handler = async (context) => {
    const env = context.env;

    // 1. posture: an unmounted relay routes nowhere.
    if (!enabled(env)) {
        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
    }

    // 2. key gate: fail-closed (no secret = nothing to verify against).
    const secret = gateSecret(env);
    if (secret === null) {
        return plain(503, {
            ok: false,
            error:
                "This solo relay is gated but has no gate secret set - it accepts nothing until the operator sets VANT_RELAY_GATE_KEY in Pages settings.",
        });
    }

    // body cap (the doors' shared posture) + raw bytes for the signature
    const raw = await context.request.text();
    if (raw.length > BODY_LIMIT) {
        return plain(TRANSPORT_STATUS.TOO_LARGE, { error: "Body too large (1 MiB cap)" });
    }

    // 3. THE GATE: HMAC-SHA256 over the raw body bytes.
    const presented = context.request.headers.get(SIGNATURE_HEADER);
    if (presented === null || presented.length === 0) {
        return plain(TRANSPORT_STATUS.UNAUTHENTICATED, {
            error: `A r/2 relay envelope requires the ${SIGNATURE_HEADER} header: HMAC-SHA256 hex over the raw body bytes.`,
        });
    }
    if (!(await signatureVerdictOk(raw, presented, secret))) {
        return plain(TRANSPORT_STATUS.UNAUTHENTICATED, { error: "Invalid signature" });
    }

    // 4. parse the crew envelope; malformed = plain transport 400.
    let crew: CrewEnvelope | null = null;
    try {
        crew = JSON.parse(raw) as CrewEnvelope;
    } catch (_e) {
        crew = null;
    }
    if (!crew || typeof crew !== "object" || Array.isArray(crew)) {
        return plain(400, { error: "The relay intake expects a JSON envelope: { event, from, ts, nonce, payload, v }." });
    }

    const incomingEvent = typeof crew.event === "string" ? crew.event : "";
    const ts = typeof crew.ts === "number" ? crew.ts : NaN;
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > FRESHNESS_WINDOW_MS) {
        return plain(TRANSPORT_STATUS.UNAUTHENTICATED, { error: "Stale envelope: ts outside the freshness window" });
    }
    if (incomingEvent !== EVENTS.hop) {
        // relay.ride is a POD-face event (the channel key lives with the
        // pod; the edge holds no keys to open rides and never fakes it).
        return ack({
            received: true,
            event: incomingEvent || "(none)",
            handlers: 0,
            dispatched: 0,
            reply: { ok: false, code: CODES.UNKNOWN_EVENT, error: "this solo relay edge forwards relay.hop envelopes only (rides decode at the pod)." },
        });
    }

    // 5. the hop frame { origin, path, ct }.
    const payload = (crew.payload && typeof crew.payload === "object" && !Array.isArray(crew.payload))
        ? (crew.payload as { origin?: unknown; path?: unknown; ct?: unknown })
        : null;
    const frame = payload ?? {};

    // origin guard: https-only on the edge (no lab escape), IP literals.
    const origin = typeof frame.origin === "string" ? frame.origin : "";
    let target: URL;
    try {
        target = new URL(origin);
    } catch (_e) {
        return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
            reply: { ok: false, code: CODES.BAD_ORIGIN, error: "Hop origin unparseable - explicit client-declared origins only." } });
    }
    if (target.protocol !== "https:") {
        return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
            reply: { ok: false, code: CODES.BAD_ORIGIN, error: "This solo relay only forwards to explicit, public, https origins." } });
    }
    const host = target.hostname.replace(/^\[|\]$/g, "");
    if (!host || host.length > 253) {
        return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
            reply: { ok: false, code: CODES.BAD_ORIGIN, error: "Hop hostname malformed." } });
    }
    if (/^[0-9a-f:.]+$/i.test(host) && (host.indexOf(":") !== -1 || /^[0-9.]+$/.test(host))) {
        if (isHardPrivateIp(host) || isPrivateIp(host)) {
            return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
                reply: { ok: false, code: CODES.BAD_ORIGIN, error: "Private/loopback/link-local/metadata hop targets are refused on the edge." } });
        }
    }

    // path guard: rooted, sane.
    const path = typeof frame.path === "string" ? frame.path : "";
    if (!path.startsWith("/") || path.length > 512 || path.includes("..") || _HAS_CONTROL_CHARS.test(path)) {
        return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
            reply: { ok: false, code: CODES.BAD_PATH, error: "Hop path must be a rooted, sane URL path." } });
    }

    // envelope guard: ENCRYPTED PIPES ONLY - no downgrade, ever; typed
    // refusal rides INSIDE the 200 ack (application-level, not HTTP).
    const ct = typeof frame.ct === "string" ? frame.ct : "";
    if (!envelopeShape(ct)) {
        return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
            reply: { ok: false, code: CODES.NEEDS_ENVELOPE,
                error: "The hop body must be an AES-256-GCM envelope (salt:iv:tag:cipher) keyed by the e2e channel key - plaintext never hops." } });
    }

    // 6. forward VERBATIM: { ct } rides origin+path; the gate secret
    //    NEVER rides upstream (spent at verification). Typed failures ride
    //    the ack reply honestly instead of errors.
    const t0 = Date.now();
    let text: string;
    try {
        const up = await fetch(new URL(path, target), {
            method: "POST",
            headers: { "content-type": "application/json", "x-vant-relay": CAPS_VERSION },
            body: JSON.stringify({ ct }),
            signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        });
        text = await up.text();
        if (text.length > MAX_CTEXT) {
            return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
                reply: { ok: false, code: CODES.UPST, error: "The hop target answered beyond the body cap.", ms: Date.now() - t0 } });
        }
    } catch (e) {
        return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
            reply: { ok: false, code: CODES.UPST, error: "Upstream unreachable: " + (e instanceof Error ? e.message : "unknown"), ms: Date.now() - t0 } });
    }
    return ack({
        received: true,
        event: incomingEvent,
        handlers: 0,
        dispatched: 1,
        reply: { ok: true, raw: text, ms: Date.now() - t0 },
    });
};
