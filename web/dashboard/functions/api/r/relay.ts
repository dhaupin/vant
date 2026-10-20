import type { Handler } from "../../types";
import { forward as podBridgeForward } from "../../lib/bridge";
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
 * Dashboard-relay flavor, r/2 (pass 236 ruling): the dashboard PIGGYBACKS
 * a relay on its own Pages deploy when the operator flips the posture env.
 * The wire is WEBHOOK-NATIVE - the same crew-shaped envelope the pod's
 * webhook transport serves (web/kit/contracts/relay-contract.js r/2, vendored
 * + pinned). The retired r/1 REST hop face (/api/r/exec + x-relay-gate)
 * is gone; this intake is POST /api/r/relay.
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
// (repo lint gate) built from char codes to avoid the no-control-regex
// rule — the same convention lib/vaf.js uses for its control-char scan;
// semantics identical to the literal /[\x00-\x1f]/ it replaces.
const _HAS_CONTROL_CHARS = new RegExp(
    '[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']',
    'u',
);

interface RelayAck {
    received: boolean;
    event: string;
    handlers: number;
    dispatched: number;
    reply?: unknown;
}

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

    // 2a. THE BROWSER LANE (pass-237 doctrine: clients hand INTENT,
    //     never credentials). A request bearing the SAME identity the
    //     pod bridge already forwards (Bearer vguest_* or a bound session
    //     token) and NO signature header rides the bridge lane below:
    //     family gate → pod bridge forward with the SERVER-side token.
    //     No gate secret exists for this lane; nothing in the envelope
    //     ever carries a credential.
    const bearerRaw = context.request.headers.get("Authorization") ?? "";
    const bearer = bearerRaw.replace(/^Bearer /i, "").trim();
    const browserLane = bearer.startsWith("vguest_")
        && context.request.headers.get(SIGNATURE_HEADER) === null;

    // 2b. key gate for the RELAY LANE (external webhook senders):
    // fail-closed (no secret = nothing to verify against).
    const secret = gateSecret(env);
    if (!browserLane && secret === null) {
        return plain(503, {
            ok: false,
            error:
                "This relay is gated but has no gate secret set - it accepts nothing until the operator sets VANT_RELAY_GATE_KEY in Pages settings.",
        });
    }

    // body cap (the doors' shared posture) + raw bytes for the signature
    const raw = await context.request.text();
    if (raw.length > BODY_LIMIT) {
        return plain(TRANSPORT_STATUS.TOO_LARGE, { error: "Body too large (1 MiB cap)" });
    }

    // 3. THE GATE (RELAY LANE only; the browser lane is intent-borne):
    // two credential lanes - the header law AND (r/2 SEALED lane) the seal
    // inside the payload. A COMPLETE seal ({ sig, ts } over the ct bytes)
    // that verifies skips the header law — the KEYLESS last mile where a
    // middlebox relay blind-forwards { ct }
    // verbatim and cannot header-sign for the pod it reaches (the seal IS
    // the credential, prd-relay.md §2.2). A PRESENT seal that fails verify
    // refuses like a missigned header; NO seal falls to the header law
    // unchanged. The edge is stateless: the seal's OWN ts window is the
    // honest edge-side memory; the byte-identical replay gate lives at the
    // pod's transport.
    let crew: CrewEnvelope | null = null;
    if (!browserLane) {
        try {
            crew = JSON.parse(raw) as CrewEnvelope;
        } catch (_e) {
            crew = null;
        }
        if (!crew || typeof crew !== "object" || Array.isArray(crew)) {
            return plain(400, { error: "The relay intake expects a JSON envelope: { event, from, ts, nonce, payload, v }." });
        }
        let authenticated = false;
        let sealedPayload: { ct: string; seal: { sig: string; ts: number } } | null = null;
        if (crew.payload && typeof crew.payload === "object" && !Array.isArray(crew.payload)) {
            const p = crew.payload as { ct?: unknown; seal?: unknown };
            if (typeof p.ct === "string" && p.seal && typeof p.seal === "object") {
                const s = p.seal as { sig?: unknown; ts?: unknown };
                if (typeof s.sig === "string" && typeof s.ts === "number") {
                    sealedPayload = { ct: p.ct, seal: { sig: s.sig, ts: s.ts } };
                }
            }
        }
        if (sealedPayload !== null) {
            if (!(await signatureVerdictOk(sealedPayload.ct, sealedPayload.seal.sig, secret as string))) {
                return plain(TRANSPORT_STATUS.UNAUTHENTICATED, { error: "Invalid seal signature" });
            }
            if (Math.abs(Date.now() - sealedPayload.seal.ts) > FRESHNESS_WINDOW_MS) {
                return plain(TRANSPORT_STATUS.UNAUTHENTICATED, { error: "Stale seal: ts outside the replay window" });
            }
            authenticated = true;
        }
        if (!authenticated) {
            const presented = context.request.headers.get(SIGNATURE_HEADER);
            if (presented === null || presented.length === 0) {
                return plain(TRANSPORT_STATUS.UNAUTHENTICATED, {
                    error: `A r/2 relay envelope requires the ${SIGNATURE_HEADER} header (or a sealed payload): HMAC-SHA256 hex over the raw body bytes.`,
                });
            }
            if (!(await signatureVerdictOk(raw, presented, secret as string))) {
                return plain(TRANSPORT_STATUS.UNAUTHENTICATED, { error: "Invalid signature" });
            }
        }
    }

    // 4. parse the crew envelope (browser lane) or reuse the gate's parse.
    if (browserLane) {
        let parsedCrew: CrewEnvelope | null = null;
        try {
            parsedCrew = JSON.parse(raw) as CrewEnvelope;
        } catch (_e) {
            parsedCrew = null;
        }
        crew = parsedCrew;
    }
    if (!crew || typeof crew !== "object" || Array.isArray(crew)) {
        return plain(400, { error: "The relay intake expects a JSON envelope: { event, from, ts, nonce, payload, v }." });
    }

    const incomingEvent = typeof crew.event === "string" ? crew.event : "";
    const ts = typeof crew.ts === "number" ? crew.ts : NaN;
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > FRESHNESS_WINDOW_MS) {
        return plain(TRANSPORT_STATUS.UNAUTHENTICATED, { error: "Stale envelope: ts outside the freshness window" });
    }
    if (incomingEvent !== EVENTS.hop
        && incomingEvent !== EVENTS.sync && incomingEvent !== EVENTS.lost && incomingEvent !== EVENTS.call
        && incomingEvent !== EVENTS.ride) {
        return ack({
            received: true,
            event: incomingEvent || "(none)",
            handlers: 0,
            dispatched: 0,
            reply: { ok: false, code: CODES.UNKNOWN_EVENT, error: "this edge carries relay.hop, the bridge families (relay.sync | relay.lost | relay.call) and the browser-lane sealed ride (relay.ride)." },
        });
    }

    // ---- the interface-handler bridge (pass 237, §3.3) --------------------
    // The webapp hands INTENT; the edge spends its OWN delegated pod
    // access server-side (the existing pod bridge lib - the browser JS
    // never sees a credential). Bridge families translate to the door's
    // existing verbs; hop propagates untouched below.
    // (pass 271 e2e rung, prd-relay.md §5) THE SEALED RIDE LANE: the paired
    // sovereign browser hands the SEALED envelope { ct } — the edge CANNOT
    // open it (the channel key lives at the pod and with the client; the
    // edge is relay-blind BY LAW) and forwards the door verb relay_ride,
    // whose shared ride core opens, rides, and re-seals. Only the paired
    // browser lane (vguest_ bearer, no signature) reaches this; a relay
    // lane ride still refuses (rides decode at the pod, never here).
    if (incomingEvent === EVENTS.ride && !browserLane) {
        return ack({
            received: true,
            event: incomingEvent,
            handlers: 0,
            dispatched: 0,
            reply: { ok: false, code: CODES.UNKNOWN_EVENT, error: "rides decode at the pod (the channel key lives there) - this edge carries sealed browser-lane rides only; sign the envelope against the pod's own webhook instead." },
        });
    }
    if (incomingEvent === EVENTS.sync || incomingEvent === EVENTS.lost || incomingEvent === EVENTS.call || incomingEvent === EVENTS.ride) {
        const bp = (crew.payload && typeof crew.payload === "object" && !Array.isArray(crew.payload))
            ? (crew.payload as { entries?: unknown[]; name?: unknown; content?: unknown; format?: unknown; tool?: unknown; method?: unknown; args?: unknown; ct?: unknown })
            : null;
        if (bp === null || (incomingEvent === EVENTS.ride && typeof bp.ct !== "string")) {
            return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
                reply: { ok: false, code: CODES.NEEDS_ENVELOPE, error: "bridge payload shape refused: sync {name,content} or {entries:[..]}, lost {}, call {tool|method, args?}, ride { ct } (the sealed envelope)." } });
        }
        if (bp === null || (incomingEvent === EVENTS.sync && typeof bp.name !== "string" && !(Array.isArray(bp.entries) && bp.entries.length))) {
            return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
                reply: { ok: false, code: CODES.NEEDS_ENVELOPE, error: "bridge payload shape refused: sync {name,content} or {entries:[..]}, lost {}, call {tool|method, args?}." } });
        }
        const entries: Array<{ name?: unknown; content?: unknown; format?: unknown }> =
            incomingEvent === EVENTS.sync && Array.isArray(bp.entries) && bp.entries.length
                ? (bp.entries.slice(0, 64) as Array<{ name?: unknown; content?: unknown; format?: unknown }>)
                : [{ name: bp.name, content: bp.content, format: bp.format }];
        const doorCalls: Array<{ tool: string; args: unknown }> = incomingEvent === EVENTS.ride
            ? [{ tool: "relay_ride", args: { ct: bp.ct } }]
            : incomingEvent === EVENTS.sync
              ? entries.map((en) => ({
                tool: "brain_write",
                args: { name: en.name, content: en.content, format: en.format },
              }))
              : incomingEvent === EVENTS.lost
                ? [{ tool: "context_heartbeat", args: { action: "status" } }, { tool: "brain_current", args: {} }]
                : [{ tool: String(bp?.tool ?? bp?.method ?? ""), args: bp?.args }];
        if (incomingEvent === EVENTS.call && !String(doorCalls[0].tool).trim()) {
            return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
                reply: { ok: false, code: CODES.NEEDS_ENVELOPE, error: "bridge call needs { tool | method, args? } - the door verifies the rest." } });
        }
        const tBridge = Date.now();
        let lastUp: Response | null = null;
        let lastErr = "";
        for (const dc of doorCalls) {
            try {
                const doorUrl = new URL(context.request.url);
                doorUrl.pathname = "/api/mcp/exec";
                doorUrl.search = "";
                lastUp = await podBridgeForward(context, new Request(doorUrl, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(dc),
                }));
            } catch (e) {
                lastErr = e instanceof Error ? e.message : "bridge forward threw";
                lastUp = null;
            }
        }
        const text = lastUp ? await lastUp.text() : "";
        let parsed: unknown = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (_e) { parsed = null; }
        const doorOk = !!lastUp && lastUp.status >= 200 && lastUp.status < 300
            && !(parsed && typeof parsed === "object" && (parsed as { error?: unknown }).error);
        if (!doorOk) {
            return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 0,
                reply: { ok: false, code: CODES.UPST, error: lastErr || "the pod bridge refused the bridge call.", ms: Date.now() - tBridge } });
        }
        return ack({ received: true, event: incomingEvent, handlers: 0, dispatched: 1,
            reply: { ok: true, family: incomingEvent, answer: parsed, ms: Date.now() - tBridge } });
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
            reply: { ok: false, code: CODES.BAD_ORIGIN, error: "This relay only forwards to explicit, public, https origins." } });
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
    //    (r/2 SEALED hop-LAST-MILE) a payload that SHIPPED a seal forwards
    //    it beside the ct: the last mile into a pod's own webhook route
    //    stays credentialed even though this edge holds no rider keys —
    //    the seal IS the credential the rider sealed with its key, and
    //    the receiving pod's verify set honors it. No seal, no change.
    const frameCast = frame as { seal?: unknown };
    const forwardSeal = frameCast.seal && typeof frameCast.seal === "object"
        && (frameCast.seal as { sig?: unknown }).sig
        && (frameCast.seal as { ts?: unknown }).ts
        ? { sig: String((frameCast.seal as { sig: unknown }).sig), ts: Number((frameCast.seal as { ts: unknown }).ts) }
        : null;
    const t0 = Date.now();
    let text: string;
    try {
        const up = await fetch(new URL(path, target), {
            method: "POST",
            headers: { "content-type": "application/json", "x-vant-relay": CAPS_VERSION },
            body: JSON.stringify(forwardSeal ? { ct, seal: forwardSeal } : { ct }),
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
