import { z } from "zod";
import { getState } from "./state";

/**
 * The ONE typed client every module uses (prd-web.md 3.3 resp. 4). It
 * speaks ONLY the /api/* proxy contract (3.1) - modules never add Worker
 * routes. The pod door remains the authority; this client renders what
 * comes back and maps typed refusals.
 *
 * (pass 237 rung) The BRIDGE FAMILIES (web/kit/contracts/relay-contract.js
 * r/2: relay.sync | relay.lost | relay.call) land here as the browser
 * consumer: the dashboard pastes INTENT into POST /api/r/relay (the
 * dashboard-relay intake; HMAC-signed SERVER-SIDE — the browser holds
 * no gate secret). The intake translates families onto the pod door's
 * existing verbs and answers the r/2 ack: reply.ok=false carries the
 * typed E_RELAY_* / E_RIDE_* codes; reply.ok=true carries the door answer.
 */

// The exec envelope is intentionally loose here: the DOOR owns shapes.
// We validate only the transport contract (the thing the worker owns).
export const ExecOut = z.object({
  jsonrpc: z.string().optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.union([z.number(), z.string()]).optional(),
      message: z.string().optional(),
      data: z.unknown().optional(),
    })
    .optional(),
});

export const ToolsOut = z.object({
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
      }).passthrough(),
    )
    .optional(),
}).passthrough();

export const HealthOut = z
  .object({
    ok: z.boolean().optional(),
    status: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "network" // unreachable (breaker / offline / no functions)
      | "refused" // typed door refusal surfaced by HTTP status or E_*
      | "shape", // envelope did not validate
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function token(): string | undefined {
  return getState().tokens[getState().property];
}

function headers(json: boolean): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  const t = token();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

/** POST /api/mcp/exec through the Worker proxy (auth forwarded, never logged). */
export async function exec(tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch("/api/mcp/exec", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(tool === undefined ? undefined : { tool, args }),
    });
  } catch {
    throw new ApiError("the pod bridge is unreachable", "network");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(shortRefusal(res.status, detail), "refused", res.status);
  }
  const parsed = ExecOut.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiError("unparseable door response", "shape");
  if (parsed.data.error) {
    throw new ApiError(`door: ${parsed.data.error.message ?? "refused"}`, "refused");
  }
  return parsed.data.result;
}

/** GET /api/mcp/tools through the Worker proxy. */
export async function tools() {
  return readJson("/api/mcp/tools", ToolsOut);
}

// (pass 261) THE TRAVELER door surface (typed): the dashboard talks to the
// SAME door verbs the CLI/headless lanes use — carry (the certified letter
// through its bill of stations), replay (the continuity walk), roster
// (the honesty carrier list). No frontend-local logic: the door's own
// gates (guest class, QoS, escrow) apply to every call, per the one-way
// boundary (prd-web.md 3.2). Shapes mirror the door returns loosely
// (passthrough) — the door's typed refusal codes survive intact.
export const CarryStageIn = z
  .object({
    by: z.string().optional(),
    op: z.string().optional(),
    part: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    carrier: z.string().optional(),
    privileged: z.boolean().optional(),
    approvalId: z.string().optional(),
    team: z.string().optional(),
  })
  .passthrough();

export const CarryArgs = z
  .object({
    id: z.string().optional(),
    stations: z.array(CarryStageIn),
    template: z.array(CarryStageIn).optional(),
  })
  .passthrough();

export async function travelerCarry(args: z.infer<typeof CarryArgs>): Promise<unknown> {
  CarryArgs.parse(args);
  return exec("traveler_carry", args);
}

export async function travelerReplay(
  arrivals: Array<Record<string, unknown>> = [],
): Promise<unknown> {
  return exec("traveler_replay", { arrivals });
}

export async function carriersList(): Promise<unknown> {
  return exec("carriers_list", {});
}

// (prd-carrier-share.md §2 P5a) THE CARRIER FAMILY at the typed client: the
// SAME verbs the agents use, no frontend-local logic (the one-way
// boundary). Shapes mirror the door returns loosely — passthrough casts
// live in the module, typed refusals survive intact through exec.
export async function carrierLaneList(): Promise<unknown> {
  return exec("carrier_lane_list", {});
}

export async function carrierEncode(
  id: string,
  lane: string,
  opts?: { pointer?: boolean },
): Promise<unknown> {
  return exec("carrier_encode", opts ? { id, lane, opts } : { id, lane });
}

export async function carrierDecode(
  lane: string,
  artifact: string,
  opts?: { pointerOnly?: boolean },
): Promise<unknown> {
  return exec("carrier_decode", opts ? { lane, artifact, opts } : { lane, artifact });
}

export async function travelersList(limit = 200): Promise<unknown> {
  return exec("traveler_list", { limit });
}

export async function travelerStamp(id: string): Promise<unknown> {
  return exec("traveler_stamp", { id });
}

export async function travelerStatusOf(id: string): Promise<unknown> {
  return exec("traveler_status", { id });
}

export async function travelerAuditOf(id: string): Promise<unknown> {
  return exec("traveler_audit", { id });
}

/** GET /api/health through the Worker proxy. */
export async function health() {
  return readJson("/api/health", HealthOut);
}

/** GET /api/breakers - the edge's per-property breaker view (3.6). */
export const BreakersOut = z
  .object({
    breakers: z.record(z.string(), z.object({ fails: z.number(), state: z.string() })).optional(),
    note: z.string().optional(),
  })
  .passthrough();

export async function breakers() {
  return readJson("/api/breakers", BreakersOut);
}

/** GET /api/properties - ids + labels of attached installs; origins
 *  stay server-side (the bridge resolves them for forwarding only). */
export const PropertiesOut = z
  .object({
    properties: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .optional(),
  })
  .passthrough();

export async function properties() {
  return readJson("/api/properties", PropertiesOut);
}

/** GET /api/users - the dashboard ACCOUNT roster (admin-only; prd-web
 *  3.5). The email hash is the identity shown; it never expands back. */
export const UsersOut = z
  .object({
    users: z
      .array(
        z.object({
          emailHash: z.string(),
          role: z.enum(["admin", "viewer"]),
          status: z.enum(["active", "disabled"]),
          created: z.number(),
        }),
      )
      .optional(),
  })
  .passthrough();

export async function users() {
  return readJson("/api/users", UsersOut);
}

/** POST /api/users/set-status - activate|disable an account (admin-only;
 *  self-disable is refused with E_SELF_DISABLE by the door). */
export async function setUserStatus(emailHash: string, status: "active" | "disabled") {
  let res: Response;
  try {
    res = await fetch("/api/users/set-status", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ emailHash, status }),
    });
  } catch {
    throw new ApiError("unreachable", "network");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(shortRefusal(res.status, detail), "refused", res.status);
  }
  const parsed = ExecOut.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiError("unparseable response", "shape");
  if (parsed.data.error) {
    throw new ApiError(`door: ${parsed.data.error.message ?? "refused"}`, "refused");
  }
  return parsed.data.result;
}

/**
 * (prd-carrier-share.md 3.2 P5b) THE CAPS ROUTE CLIENT — the ONE
 * cross-origin fetch the chain module may make, and ONLY to a relay's
 * PUBLIC capabilities page (caps are secrets-free + wildcard-CORS by
 * contract, prd-relay.md 4.0's solo admission note). Honest outcomes only:
 * 404 means "this deploy is not a relay" — a RECORD, not a crash — and
 * non-r/2 / non-envelope-required caps refuse loudly (the plain-hop warn,
 * prd-relay 1.1.2). No other UI-side probe is ever allowed beyond this
 * contract-defined surface.
 */
export const RelayCapsOut = z
  .object({
    relay: z.string(),
    flavor: z.string(),
    gated: z.boolean().optional(),
    gateReady: z.boolean().optional(),
    e2e: z.string().optional(),
    surface: z.union([z.array(z.string()), z.string()]).optional(),
    events: z.string().optional(),
    posture: z.string().optional(),
  })
  .passthrough();

export type RelayCaps = z.infer<typeof RelayCapsOut>;

export const E2E_LAW = "envelope-required";

export async function relayCaps(origin: string): Promise<RelayCaps> {
  let res: Response;
  try {
    res = await fetch(origin.replace(/\/+$/, "") + "/api/r/capabilities");
  } catch {
    throw new ApiError("the origin answered nothing (down, or the URL is wrong)", "network");
  }
  if (res.status === 404) {
    // an unmounted relay route answers the raw 404 shape on ALL flavors —
    // that is "not a relay", stated honestly (a record, not a crash)
    throw new ApiError("this deploy is not a relay (no /api/r surface is mounted)", "refused", 404);
  }
  if (!res.ok) {
    throw new ApiError(`answered outside posture (HTTP ${res.status})`, "refused", res.status);
  }
  const parsed = RelayCapsOut.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiError("unparseable caps page", "shape");
  if (parsed.data.relay !== "r/2") {
    throw new ApiError(`caps are not contract r/2 (answered ${parsed.data.relay})`, "refused", res.status);
  }
  if (parsed.data.e2e !== undefined && parsed.data.e2e !== E2E_LAW) {
    throw new ApiError(
      `caps budget a plain pipe (e2e=${parsed.data.e2e}) — this chain speaks ${E2E_LAW} only`,
      "refused",
      res.status,
    );
  }
  return parsed.data;
}

async function readJson<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(path, { headers: headers(false) });
  } catch {
    throw new ApiError("unreachable", "network");
  }
  if (!res.ok) {
    throw new ApiError(shortRefusal(res.status, ""), "refused", res.status);
  }
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiError("unparseable response", "shape");
  return parsed.data;
}

function shortRefusal(status: number, detail: string): string {
  if (status === 401 || status === 403) return "refused: identity not valid for this surface";
  if (status === 429) return "refused: throttled (429)";
  if (status === 503) return "breaker open: pod bridge cooling down";
  const e = /\b(E_[A-Z_]+)\b/.exec(detail);
  return e ? `refused: ${e[1]}` : `refused: HTTP ${status}`;
}

// ==================== the bridge families (pass 237 rung) ====================

/**
 * The r/2 ack (web/kit/contracts/relay-contract.js): every bridge POST answers
 * { received, event, handlers, dispatched, reply } — application refusals
 * ride TYPED codes inside the 200 ack (E_RELAY_* / E_RIDE_*), transport
 * refusals ride HTTP statuses (401/409/404/413). Typed, never silent.
 */
export const BridgeAck = z
  .object({
    received: z.boolean(),
    event: z.string(),
    handlers: z.number(),
    dispatched: z.number(),
    reply: z
      .object({
        ok: z.boolean(),
        code: z.string().optional(),      // the typed refusal family
        error: z.string().optional(),
        family: z.string().optional(),   // ok replies name the family
        answer: z.unknown().optional(),  // the door's answer (families)
        raw: z.string().optional(),      // hop's verbatim upstream body
        ms: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type BridgeReply = NonNullable<z.infer<typeof BridgeAck>["reply"]>;

async function bridgeSend(event: string, payload: Record<string, unknown>): Promise<BridgeReply> {
  let res: Response;
  try {
    res = await fetch("/api/r/relay", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        event,
        from: "bolete-browser",
        ts: Date.now(),
        nonce: crypto.randomUUID(),
        payload,
        v: { major: 2 },
      }),
    });
  } catch {
    throw new ApiError("the relay intake is unreachable", "network");
  }
  if (!res.ok) {
    // transport-level refusal: the honest HTTP the webhook transport owns
    const detail = await res.text().catch(() => "");
    throw new ApiError(shortRefusal(res.status, detail), "refused", res.status);
  }
  const parsed = BridgeAck.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiError("unparseable relay ack", "shape");
  const reply = parsed.data.reply ?? { ok: false, error: "the ack carried no reply" };
  return reply;
}

/** relay.sync → brain_write on the door (single {name,content} or batched
 *  {entries:[{name,content,format?}]}, 64 cap enforced by the intake).
 *  format rides the door's enum: md | json | yaml | txt. */
export function bridgeSync(entry: { name: string; content: string; format?: string }): Promise<BridgeReply>;
export function bridgeSync(entries: Array<{ name: string; content: string; format?: string }>): Promise<BridgeReply>;
export function bridgeSync(a: unknown): Promise<BridgeReply> {
  const payload = Array.isArray(a) ? { entries: a } : a;
  return bridgeSend("relay.sync", payload as Record<string, unknown>);
}

/** relay.lost → "where one stands": context_heartbeat(status) +
 *  brain_current off the door; the ack reply.answer carries both. */
export function bridgeLost(): Promise<BridgeReply> {
  return bridgeSend("relay.lost", {});
}

/** relay.call → any door tool through the intake (the shape gate does
 *  the rest; typed refusals surface as reply.code). */
export function bridgeCall(tool: string, args: Record<string, unknown> = {}): Promise<BridgeReply> {
  return bridgeSend("relay.call", { tool, args });
}

/** The typed bridge refusal, shaped for UI surfaces (the code first). */
export function bridgeRefusal(reply: BridgeReply): string | null {
  if (reply.ok) return null;
  return reply.code ? `${reply.code}: ${reply.error ?? "refused"}` : (reply.error ?? "refused");
}
