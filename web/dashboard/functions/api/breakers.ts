import type { Handler } from "../types";
import { breakerStates } from "../lib/bridge";

export const onRequestGet: Handler = async (_context) => {
  return new Response(
    JSON.stringify({ breakers: breakerStates(), note: "per-isolate edge view; the pod's own breaker is authoritative" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
