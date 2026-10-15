import type { Handler, PagesContext } from "../types";
import { makeAccounts, SESSION_COOKIE } from "./accounts";
import { storeFor } from "./kv";
import { makeLedger } from "./ledger";

/**
 * The bridge (prd-web.md 3.1 + 3.6): the Worker forwards and streams -
 * NO token logic, NO tenant logic, NO rate-limit logic OF THE POD's kind
 * here. What lives here is only what the edge owes: forward auth, shape
 * -gate requests, per-session rate budget, per-property breaker.
 */

const ROUTE_RE = /^[a-z0-9-]{1,40}$/;

// ---- property resolution (Pages settings env, never code strings) ----

export function podOriginFor(context: PagesContext, property: string): string | null {
  if (!ROUTE_RE.test(property)) return null;
  const key = `VANT_PROPERTY_${property.toUpperCase()}_ORIGIN`;
  const origin = context.env[key];
  if (typeof origin !== "string" || origin.length === 0) return null;
  return origin.replace(/\/+$/, "");
}

// ---- auth: forwarded, never logged (prd-web.md 3.1 / 6) ----

const cookieFor = (property: string) => `vg_session_${property}`;

function parseCookies(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (request.headers.get("Cookie") ?? "").split(/;\s*/)) {
    if (!part.includes("=")) continue;
    const name = part.slice(0, part.indexOf("="));
    out[name] = decodeURIComponent(part.slice(part.indexOf("=") + 1));
  }
  return out;
}

export function sessionCookieHeader(): string {
  return SESSION_COOKIE;
}

/** Access token resolution order: explicit Authorization header, then
 *  the SERVER-SIDE bound session token (P2 session binding, prd-web.md
 *  3.5), then the MVP raw-token cookie (unbound fallback, e.g. local
 *  installs with no account store). The token value never leaves this
 *  process except as the upstream Authorization header. */
export async function podTokenFor(
  context: PagesContext,
  request: Request,
  property: string,
): Promise<string | null> {
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId && sessionId.startsWith("bsess_")) {
    try {
      const accounts = makeAccounts(storeFor(context), emailSalt(context));
      if (!(await accounts.accountActive(sessionId))) return null;
      const session = await accounts.sessionFor(sessionId);
      const bound = session ? session.tokens[property] : undefined;
      if (typeof bound === "string" && bound.length > 0) return bound;
    } catch {
      // no account store configured: fall through to the raw cookie
    }
  }
  if (!ROUTE_RE.test(property)) return null;
  const raw = cookies[cookieFor(property)];
  return raw || null;
}

function emailSalt(context: PagesContext): string {
  const salt = context.env["VANT_EMAIL_SALT"];
  return typeof salt === "string" ? salt : "";
}

/** Token intake: ACCOUNT-bound sessions store the pasted token
 *  SERVER-SIDE (prd-web.md 3.5 session binding); the raw-token cookie
 *  path remains the unbound MVP fallback for installs without an
 *  account store. */
export async function establishSession(
  request: Request,
  env: PagesContext["env"],
  property: string,
): Promise<Response> {
  if (!ROUTE_RE.test(property)) {
    return json({ error: "bad property id" }, 400);
  }
  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token === "string") token = body.token.trim();
  } catch {
    return json({ error: "bad body" }, 400);
  }
  if (!token.startsWith("vguest_") || token.length > 512) {
    return json({ error: "not a guest token" }, 400);
  }

  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId && sessionId.startsWith("bsess_")) {
    try {
      const ctx = { request, env, params: {} } as unknown as PagesContext;
      const accounts = makeAccounts(storeFor(ctx), emailSalt(ctx));
      if (!(await accounts.accountActive(sessionId))) {
        return json({ error: "E_ACCOUNT_DISABLED", detail: "this account is disabled" }, 403);
      }
      const session = await accounts.sessionFor(sessionId);
      if (session) {
        await accounts.bindToken(sessionId, property, token);
        return json({ ok: true, bound: true });
      }
    } catch {
      // account store unavailable: legacy path below
    }
  }
  return new Response(JSON.stringify({ ok: true, bound: false }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie":
        `${cookieFor(property)}=${encodeURIComponent(token)}` +
        `; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`,
    },
  });
}

export function clearSession(property: string): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${cookieFor(property)}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    },
  });
}

// ---- per-session rate budget (edge mirror of EW4; the door stays boss) ----

const buckets = new Map<string, { window: number; count: number }>();
const RATE_PER_MIN_DEFAULT = 120;

export function rateGate(context: PagesContext, scope: string, ip: string): Response | null {
  const limitSetting = context.env["VANT_EDGE_RATE_PER_MIN"];
  const limit =
    typeof limitSetting === "string" && limitSetting !== "" ? Number(limitSetting) || RATE_PER_MIN_DEFAULT : RATE_PER_MIN_DEFAULT;
  const now = Math.floor(Date.now() / 60000);
  const key = `${scope}:${ip}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.window !== now) {
    buckets.set(key, { window: now, count: 1 });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return json({ error: "E_EDGE_THROTTLED", detail: "per-session edge budget spent" }, 429);
  }
  return null;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "local"
  );
}

// ---- per-property circuit breaker (prd-web.md 3.6) ----

interface Breaker {
  fails: number;
  openUntil: number;
}
const breakers = new Map<string, Breaker>();
const OPEN_AFTER = 5;
const COOLDOWN_MS = 15_000;

function breakerFor(property: string): Breaker {
  let b = breakers.get(property);
  if (!b) {
    b = { fails: 0, openUntil: 0 };
    breakers.set(property, b);
  }
  return b;
}

/** half-open: ONE request passes while the breaker cools down. */
export function breakerGate(property: string): { allow: boolean; reason?: string } {
  const b = breakerFor(property);
  if (b.openUntil > Date.now()) {
    return { allow: false, reason: "breaker open: pod bridge cooling down" };
  }
  return { allow: true };
}

export function breakerNote(property: string, ok: boolean): void {
  const b = breakerFor(property);
  if (ok) {
    b.fails = 0;
    b.openUntil = 0;
    return;
  }
  b.fails += 1;
  if (b.fails >= OPEN_AFTER) b.openUntil = Date.now() + COOLDOWN_MS;
}

export function breakerStates(): Record<string, { fails: number; state: string }> {
  const out: Record<string, { fails: number; state: string }> = {};
  for (const [property, b] of breakers) {
    out[property] = {
      fails: b.fails,
      state: b.openUntil > Date.now() ? "open" : b.fails > 0 ? "degraded" : "closed",
    };
  }
  return out;
}

// ---- the forward itself ----

export async function bridgeOptions(context: PagesContext, request: Request): Promise<{
  origin: string | null;
  path: string;
  property: string;
  init: RequestInit;
}> {
  const url = new URL(request.url);
  const property = /^[a-z0-9-]{1,40}$/.test(url.searchParams.get("p") ?? "")
    ? (url.searchParams.get("p") as string)
    : "local";
  const path = url.pathname.replace(/^\/api/, ""); // /api/mcp/exec -> /mcp/exec
  const token = await podTokenFor(context, request, property);
  const headers = new Headers();
  headers.set("Accept", request.headers.get("Accept") ?? "*/*");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const isStream = path === "/mcp/events";
  if (isStream) headers.set("Accept", "text/event-stream");
  if (request.method === "POST") {
    // The pod door refuses POSTs without an application/json Content-Type
    // (its own gate: simple cross-site text/plain bodies skip the CORS
    // preflight it defends against). The old bridge forwarded the body but
    // NOT its Content-Type — every exec upstream answered typed 415.
    headers.set("Content-Type", "application/json");
  }
  const timeoutSetting = context.env["VANT_BRIDGE_TIMEOUT_MS"];
  // teleport the body only for POSTs; never re-stream GET bodies
  const init: RequestInit = {
    method: request.method,
    headers,
    signal: AbortSignal.timeout(
      (typeof timeoutSetting === "string" ? Number(timeoutSetting) : 0) || 10_000,
    ),
  };
  if (request.method === "POST") {
    init.body = request.body;
  }
  return { origin: podOriginFor(context, property), path, property, init };
}

export async function forward(
  context: PagesContext,
  request: Request,
): Promise<Response> {
  const { origin, path, property, init } = await bridgeOptions(context, request);
  if (!origin) {
    ledgerRecord(context, "bridge.refused", { reason: "origin_missing", property });
    return json(
      {
        error: `VANT_PROPERTY_${property.toUpperCase()}_ORIGIN` + " is not configured",
        hint: "set it in this Pages project's settings (prd-web.md 3.7)",
      },
      503,
    );
  }
  const gate = breakerGate(property);
  if (!gate.allow) {
    ledgerRecord(context, "bridge.refused", { reason: "breaker_open", property });
    return json({ error: "E_BRIDGE_BREAKER", detail: gate.reason }, 503);
  }
  const budget = rateGate(context, property, clientIp(request));
  if (budget) return budget;

  try {
    const upstream = await fetch(origin + path + new URL(request.url).search, init);
    breakerNote(property, upstream.ok || (upstream.status >= 400 && upstream.status < 500));
    if (path === "/mcp/events") return streamResponse(upstream);
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    breakerNote(property, false);
    ledgerRecord(context, "bridge.unreachable", { property });
    return json({ error: "E_BRIDGE_UNREACHABLE", property }, 502);
  }
}

/** Ledger writes NEVER break the forward (best-effort, PII-free). */
function ledgerRecord(
  context: PagesContext,
  kind: Parameters<ReturnType<typeof makeLedger>["append"]>[0],
  detail: Record<string, string | number>,
): void {
  try {
    void makeLedger(storeFor(context)).append(kind, detail);
  } catch {
    // no account store bound: the ledger is a state, not a dependency
  }
}

function streamResponse(upstream: Response): Response {
  const headers = new Headers();
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-cache, no-transform");
  return new Response(upstream.body, { status: upstream.status, headers });
}

// ---- note: import ordering (json used before definition) ----
export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// eslint heuristics: handlers are exported per file, not here
export type { Handler };
