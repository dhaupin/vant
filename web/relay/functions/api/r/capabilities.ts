import type { Handler } from "../../types";
import {
    FLAVORS, ROUTES, EDGE_ENV_KEYS, capsShape,
} from "../../lib/relay-contract.cjs";

/**
 * SOLO-relay flavor: GET /api/r/capabilities - the PUBLIC posture proof a
 * client reads BEFORE trusting the hop (prd-relay.md 3.2/4). Contract-
 * driven shape (vendored kit, parity-pinned); secrets NEVER ride a caps
 * page. When the posture is off the route is 404 Not Found - the same
 * answer the pod's server gives when its routes are not mounted.
 *
 * Solo specifics (the admission contract, prd-relay.md 4.0):
 *   - flavor solo-relay; the page states what the relay does NOT have
 *   - NO default profile pin: a solo relay brings no instance config and
 *     refuses to inherit one
 *   - caps are cross-origin READABLE: this route carries a wildcard CORS
 *     header (caps are public, secrets-free by contract) so any browser
 *     client - a dashboard verifying its chosen relay endpoint - can read
 *     the posture proof live. Exec stays same-contract gated.
 */

const E2E_LAW = "envelope-required";

const SOLO_POSTURE =
    "solo-relay flavor (a PURE relay anyone hosts SOLO): the full r/2 webhook-native contract, served by this deploy and nothing else; it holds no channel keys and no instance profile by construction and pins NO default profile; the gate IS the route HMAC secret (X-Signature-256 over the raw body bytes); hop targets verified https-only with IP-literal range checks (the edge has no DNS oracle - NAMES are verified by reachability at fetch time; the pod's DNS guard is strict by contrast)";

function json(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
    // Small-arm hardening (pass 234): every answer here is no-sniff and
    // no-referrer; CORS stays open ONLY on this public, secrets-free route.
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "content-type": "application/json",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            ...headers,
        },
    });
}

export const onRequestGet: Handler = async (context) => {
    const env = context.env;
    const on = env[EDGE_ENV_KEYS.enabled] === "1" || env[EDGE_ENV_KEYS.enabled] === "true";
    if (!on) {
        // parity: an unmounted relay route answers the pod's raw 404 shape
        return json(404, { error: "Not Found" });
    }
    const rawGate = env[EDGE_ENV_KEYS.gateKey];
    const gateReady = typeof rawGate === "string" && rawGate.length >= 16;
    const caps = capsShape(FLAVORS.SOLO, gateReady, {
        e2e: E2E_LAW,
        surface: [
            `POST ${ROUTES.relay}`,
            "GET /api/r/events",
        ],
        events: "GET /api/r/events (SSE stream-through, R1: gated, byte-verbatim, blind)",
        posture: SOLO_POSTURE,
    });
    return json(200, caps, { "access-control-allow-origin": "*" });
};
