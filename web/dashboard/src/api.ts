import { z } from "zod";
import { getState } from "./state";

/**
 * The ONE typed client every module uses (prd-web.md 3.3 resp. 4). It
 * speaks ONLY the /api/* proxy contract (3.1) - modules never add Worker
 * routes. The pod door remains the authority; this client renders what
 * comes back and maps typed refusals.
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
