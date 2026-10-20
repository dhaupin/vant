import {
  TRAVEL_VERSION,
  TRAVEL_ID_RE_SOURCE,
  TRAVEL_MAX_CTEXT,
  TRAVEL_STEP_MAX,
  TRAVEL_CODES,
  TRAVEL_WIRE_EVENT,
  travelerShape as kitShapeLocal,
  type Traveler,
  type TravelerStep,
} from "../../functions/lib/traveler-contract.cjs";

/**
 * The browser half of the Traveler emitter (the pass-254 frontend lane;
 * kit law vendored + hash-pinned, never re-implemented here). The sender
 * owns the crypto layer per contract: the id is an opaque hex content
 * address minted HERE over a canonical serialization — identity by
 * content, while the kit's validators stay structural-only by the same
 * law (no crypto in the kit).
 */

/** Stable canonical serialization: sorted keys, no whitespace. */
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return v === undefined ? "null" : JSON.stringify(v);
  }
  const keys = Object.keys(v).sort();
  let out = "{";
  for (let i = 0; i < keys.length; i++) {
    out += (i === 0 ? "" : ",") + JSON.stringify(keys[i]) + ":" + canonicalJson((v as Record<string, unknown>)[keys[i]]);
  }
  return out + "}";
}

/** The sender's hash layer: sha-256 hex over the canonical packet body. */
async function hashHex(parts: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(parts)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_STRING = 4096;

export interface TravelerMint {
  from: string;
  slots: Record<string, unknown>;
}

/** Mint a fresh traveler: one birth step { open }, content-addressed. */
export async function mintTraveler(p: TravelerMint): Promise<Traveler> {
  const from = String(p?.from ?? "").trim();
  if (!from || from.length > MAX_STRING) {
    throw new Error("traveler mint needs a `from` sender label (1.." + MAX_STRING + ")");
  }
  if (!p?.slots || typeof p.slots !== "object" || Array.isArray(p.slots)) {
    throw new Error("traveler mint needs `slots` as an object (the state payload)");
  }
  const steps: TravelerStep[] = [{ seq: 1, op: "open", by: from, ts: Date.now() }];
  const id = await hashHex({ from, slots: p.slots, steps });
  return {
    tr: TRAVEL_VERSION,
    id,
    from,
    seq: steps.length,
    steps,
    slots: p.slots,
    v: { major: 2 },
  };
}

/** Append one station step: the ledger grows by ONE, the address moves —
 *  any edit is a NEW id (the same law the door's advance holds). The `by`
 *  attribution ride follows the door's lane: the step names the actor that
 *  landed it (explicit > the packet's `from`). */
export async function advanceTraveler(
  t: Traveler,
  step: { op: string; by?: string; detail?: Record<string, unknown> },
): Promise<Traveler> {
  if (!t || typeof t !== "object" || !Array.isArray(t.steps) || t.steps.length === 0) {
    throw new Error("advance needs a traveler packet with a non-empty ledger");
  }
  const op = String(step?.op ?? "").trim();
  if (!op) throw new Error("advance needs an `op` station name");
  const landing: TravelerStep = { seq: t.steps.length + 1, op, by: String(step.by ?? t.from), ts: Date.now() };
  if (step.detail && step.detail !== null) landing.detail = step.detail;
  const next: TravelerStep[] = t.steps.concat([landing]);
  const id = await hashHex({ from: t.from, slots: t.slots, steps: next });
  return { ...t, id, seq: next.length, steps: next };
}

/** Self-check the packet BEFORE any wire: the vendored kit's shape law
 *  (null == legal; else {code, error} from TRAVEL_CODES). api.ts runs this
 *  in front of every send so nothing leaves the tab that the edge would
 *  refuse blindly — the kit stays the ONLY law source, never a local fork. */
export function localShape(t: unknown): { code: string; error: string } | null {
  return kitShapeLocal(t);
}

export {
  TRAVEL_VERSION,
  TRAVEL_ID_RE_SOURCE,
  TRAVEL_MAX_CTEXT,
  TRAVEL_STEP_MAX,
  TRAVEL_CODES,
  TRAVEL_WIRE_EVENT,
};
export type { Traveler, TravelerStep };
