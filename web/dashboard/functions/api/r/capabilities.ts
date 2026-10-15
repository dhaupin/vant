import type { Handler } from "../../types";
import {
    FLAVORS, ROUTES, EDGE_ENV_KEYS, capsShape,
} from "../../lib/relay-contract.cjs";

/**
 * Dashboard-relay flavor: GET /api/r/capabilities - the PUBLIC posture
 * proof a client reads BEFORE trusting the relay (prd-relay.md §4).
 * Contract-driven shape (vendored kit r/2, parity-pinned); secrets NEVER
 * ride a caps page. When the posture is off the route is 404 Not Found -
 * the same answer the pod's server gives when its routes are not mounted.
 */

const EDGE_E2E = "envelope-required";

const EDGE_POSTURE =
    "dashboard-relay flavor (this deploy piggybacked as a relay on its own Pages functions): same r/2 webhook-native contract as the pod core (kit head, vendored); the edge holds no channel keys and no instance profile by construction; the gate IS the route HMAC secret (X-Signature-256 over the raw body bytes); hop targets verified https-only with IP-literal range checks (the edge has no DNS oracle - NAMES are verified by reachability at fetch time; the pod's DNS guard is strict by contrast)";

function json(status: number, payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "content-type": "application/json",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
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
    const caps = capsShape(FLAVORS.DASHBOARD, gateReady, {
        e2e: EDGE_E2E,
        surface: [`POST ${ROUTES.relay}`],
        events: "bridge families served: relay.sync (ingest), relay.lost (beacon), relay.call (api bridge); relay.hop forwards; rides decode at the pod",
        posture: EDGE_POSTURE,
    });
    return json(200, caps);
};
