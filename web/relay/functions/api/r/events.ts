import type { Handler } from "../../types";
import {
    SIGNATURE_HEADER,
    EDGE_ENV_KEYS,
    HOP_TIMEOUT_MS,
    isPrivateIp,
    isHardPrivateIp,
} from "../../lib/relay-contract.cjs";

/**
 * SOLO-relay flavor: GET /api/r/events - the r/2 SSE stream-through
 * (prd-relay.md §3.2 scope note). A DECLARED stream (origin + path, the
 * same guards the hop intake runs) whose BYTES pipe through verbatim:
 * the relay opens the upstream stream and stays BLIND.
 *
 * The r/2 gate on a GET: there is no body to sign, so the DECLARATION is
 * the signed payload - X-Signature-256 = HMAC-SHA256 hex over the exact
 * query string bytes (origin + path + ts), verified with WebCrypto and a
 * constant-time digest compare. The gate secret is spent at verification
 * and NEVER rides upstream.
 *
 * Laws (r/2, parity with the pod face):
 *   1. posture gate - VANT_RELAY_ENABLED; off = no route (404)
 *   2. key gate     - no gate secret serves nothing (503 fail-closed)
 *   3. the gate     - HMAC over the query bytes; missing/mis-signed 401;
 *                     stale ts 401 (the edge is stateless - the ts window
 *                     is the honest edge-side freshness memory)
 *   4. NO envelope here - a stream has no request body to close; the
 *      stream rides THROUGH BLIND (byte-verbatim). The relay still
 *      cannot read it: it holds no keys and never decodes. Honest limit,
 *      stated live on the caps page: stream CONTENT shapes cross hop-
 *      visible until the e2e rung wraps the feed itself.
 *   5. origin guard - https-only (no lab escape on the edge), IP-literal
 *      range checks (metadata + hard-private NEVER pass); names by
 *      reachability at fetch time.
 */

const FRESHNESS_WINDOW_MS = 10 * 60 * 1000;

function json(status: number, payload: unknown): Response {
    // Small-arm hardening (pass 234, kept): every stream refusal answers
    // no-sniff and no-referrer (nothing here reveals the stream's contents).
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "content-type": "application/json",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
        },
    });
}

/** WebCrypto HMAC-SHA256 over the exact declaration bytes. */
async function signatureVerdictOk(declaration: string, presented: string, secret: string): Promise<boolean> {
    if (!/^[0-9a-f]{64}$/i.test(presented)) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(declaration));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

export const onRequestGet: Handler = async (context) => {
    const env = context.env;

    // 1. posture
    if (!enabled(env)) {
        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
    }

    // 2. key gate
    const secret = gateSecret(env);
    if (secret === null) {
        return json(503, {
            ok: false,
            error: "This relay is gated but has no gate secret set - it refuses all streams until the operator sets VANT_RELAY_GATE_KEY in Pages settings.",
        });
    }

    // 3. the gate: HMAC over the exact declaration bytes
    const url = new URL(context.request.url);
    const origin = url.searchParams.get("origin") ?? "";
    const path = url.searchParams.get("path") ?? "";
    const tsRaw = url.searchParams.get("ts") ?? "";
    const declaration = url.search + ""; // the signed bytes = the query
    const presented = context.request.headers.get(SIGNATURE_HEADER);
    if (presented === null || presented.length === 0) {
        return json(401, {
            error: `A r/2 relay stream requires the ${SIGNATURE_HEADER} header: HMAC-SHA256 hex over the raw query-string declaration.`,
        });
    }
    if (!(await signatureVerdictOk(declaration, presented, secret))) {
        return json(401, { error: "Invalid signature" });
    }
    const ts = parseInt(tsRaw, 10);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > FRESHNESS_WINDOW_MS) {
        return json(401, { error: "Stale declaration: ts outside the freshness window" });
    }

    // 4. the declared stream target (same guards as the intake, no envelope)
    let target: URL;
    try {
        target = new URL(origin);
    } catch (e) {
        return json(403, {
            ok: false,
            error: "Stream origin unparseable - explicit client-declared origins only.",
        });
    }
    if (target.protocol !== "https:") {
        return json(403, {
            ok: false,
            error: "This relay only forwards to explicit, public, https origins.",
        });
    }
    const host = target.hostname.replace(/^\[|\]$/g, "");
    if (!host || host.length > 253) {
        return json(403, { ok: false, error: "Stream hostname malformed." });
    }
    if (/^[0-9a-f:.]+$/i.test(host) && (host.indexOf(":") !== -1 || /^[0-9.]+$/.test(host))) {
        if (isHardPrivateIp(host) || isPrivateIp(host)) {
            return json(403, {
                ok: false,
                error: "Private/loopback/link-local/metadata stream targets are refused on the edge.",
            });
        }
    }
    if (!path.startsWith("/") || path.length > 512 || path.includes("..") || /[\x00-\x1f]/.test(path)) {
        return json(400, { ok: false, error: "Stream path must be a rooted, sane URL path." });
    }

    // 5. the stream-through: GET upstream, pipe BYTES verbatim (blind both
    //    directions; the gate secret never rides upstream). SSE is long-
    //    lived: the connect timeout applies only to first-byte reachability.
    const up = await fetch(new URL(path, target), {
        method: "GET",
        headers: {
            "accept": "text/event-stream",
            "cache-control": "no-store",
            "x-vant-relay": "r/2",
        },
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
    }).then(
        (r) => r,
        (e) => e
    );
    if (up instanceof Error || !(up instanceof Response)) {
        return json(502, { ok: false, error: "The stream target could not be reached." });
    }
    if (!(up.status >= 200 && up.status < 300)) {
        return json(502, { ok: false, error: "The stream target answered outside posture (non-2xx)." });
    }
    if (!up.body) {
        return json(502, { ok: false, error: "The stream target answered without a body to stream." });
    }

    // BYTE-VERBATIM pipe: the ReadableStream rides through untouched.
    return new Response(up.body, {
        status: 200,
        headers: {
            "content-type": up.headers.get("content-type") ?? "text/event-stream",
            "cache-control": "no-store",
            "x-relay-streamed": "r/2",
        },
    });
};
