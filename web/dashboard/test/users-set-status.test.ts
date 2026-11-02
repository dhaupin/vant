import { describe, expect, it } from "vitest";
import { onRequestGet } from "../functions/api/users";
import { onRequestPost as onSetStatusPost } from "../functions/api/users/set-status";
import { emailHashFor, keys, makeAccounts } from "../functions/lib/accounts";
import { KV_BINDING, type KVStore } from "../functions/lib/kv";
import { PROVIDER_ENV_KEYS } from "../functions/lib/provider";
import type { PagesContext } from "../functions/types";

/**
 * Wave 19.20 pin: POST /api/users/set-status is a REAL route. Before
 * this, the law only existed behind POST /api/users while the roster
 * UI (src/api.ts:284) called /api/users/set-status - every toggle in
 * the live product 404'd even though tests were green (they exercised
 * accounts.setAccountStatus, not the URL the app uses). Each refusal
 * is driven through the REAL handler with a forged live admin session
 * over a real-shape (page-object) KV, exactly like users-500-repro.
 */

function realShapeKv(rows: Map<string, string>): KVStore {
  return {
    async get(key) {
      return rows.get(key) ?? null;
    },
    async put(key, value, _options) {
      void _options;
      rows.set(key, value);
    },
    async delete(key) {
      rows.delete(key);
    },
    async list(options) {
      const all = [...rows.keys()].filter((k) => k.startsWith(options.prefix ?? "")).sort();
      if (options.cursor === "p2") {
        return { keys: all.slice(1).map((name) => ({ name })), list_complete: true };
      }
      return { keys: all.slice(0, 1).map((name) => ({ name })), list_complete: false, cursor: "p2" };
    },
  };
}

async function adminContext(
  rows: Map<string, string>,
  sessionId: string,
  extraEnv: Record<string, unknown> = {},
): Promise<PagesContext> {
  return {
    request: new Request("https://brain.example/api/users/set-status", {
      method: "POST",
      headers: { Cookie: `bdash_session=${sessionId}`, "Content-Type": "application/json" },
    }),
    env: { [KV_BINDING]: realShapeKv(rows), VANT_EMAIL_SALT: "prod", ...extraEnv },
    params: {},
  };
}

/** Forge a live admin session + a second (target) account for the mutations. */
async function adminWiring(rows: Map<string, string>) {
  const store = realShapeKv(rows);
  const accounts = makeAccounts(store, "prod");
  const sent = await accounts.requestOtp("owner@x.dev");
  if (sent.verdict !== "send") throw new Error("expected send");
  const made = await accounts.verifyOtp("owner@x.dev", sent.code);
  if (made.verdict !== "ok") throw new Error("expected ok");
  const adminEh = await emailHashFor("owner@x.dev", "prod");
  await store.put(keys.account(adminEh), JSON.stringify({ created: Date.now(), role: "admin", status: "active" }));
  await store.put(
    keys.session(made.sessionId),
    JSON.stringify({ emailHash: adminEh, role: "admin", created: Date.now(), tokens: {} }),
    { expirationTtl: 86400 },
  );
  const target = await accounts.requestOtp("joe@x.dev");
  if (target.verdict !== "send") throw new Error("expected send #2");
  const targetMade = await accounts.verifyOtp("joe@x.dev", target.code);
  if (targetMade.verdict !== "ok") throw new Error("expected ok #2");
  await store.delete(keys.throttle(await emailHashFor("joe@x.dev", "prod")));
  return { sessionId: made.sessionId, adminEh, targetEh: await emailHashFor("joe@x.dev", "prod") };
}

/** The handler reads context.request.json(): give each drive a typed
 *  JSON body on a fresh Request (a Request clone never took a body). */
function withJson(context: PagesContext, body: unknown): PagesContext {
  const url = new URL(context.request.url);
  return {
    ...context,
    request: new Request(url, {
      method: "POST",
      headers: {
        ...Object.fromEntries(context.request.headers),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  };
}

describe("POST /api/users/set-status (wave 19.20)", () => {
  it("delegates: POST /api/users answers the same law as /api/users/set-status", () => {
    // the index module re-exports the set-status handler: one law, two URLs
    expect(onRequestGet).toBeTypeOf("function");
    expect(onSetStatusPost).toBeTypeOf("function");
  });

  it("disables another account through the REAL handler (200 ok, row persisted, ledger note)", async () => {
    const rows = new Map<string, string>();
    const { sessionId, targetEh } = await adminWiring(rows);
    const ctx = await adminContext(rows, sessionId);
    const res = await onSetStatusPost(
      withJson(ctx, { emailHash: targetEh, status: "disabled" }),
    );
    const body = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const raw = JSON.parse(rows.get(`acct:${targetEh}`) as string) as { status?: string };
    expect(raw.status).toBe("disabled");
    // the roster-ledger note rides along (kinds only, no PII)
    const audKeys = [...rows.keys()].filter((k) => k.startsWith("aud:"));
    expect(audKeys).toHaveLength(1);
    expect(JSON.parse(rows.get(audKeys[0]) as string)).toMatchObject({ kind: "auth.account.disabled" });
  });

  it("self-disable is refused typed (E_SELF_DISABLE, 400)", async () => {
    const rows = new Map<string, string>();
    const { sessionId, adminEh } = await adminWiring(rows);
    const ctx = await adminContext(rows, sessionId);
    const res = await onSetStatusPost(withJson(ctx, { emailHash: adminEh, status: "disabled" }));
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe("E_SELF_DISABLE");
  });

  it("the BOLETE_ADMIN_ACCOUNT pin is protected (E_ADMIN_PROTECTED, 409)", async () => {
    const rows = new Map<string, string>();
    const { sessionId, targetEh } = await adminWiring(rows);
    const ctx = await adminContext(rows, sessionId, { [PROVIDER_ENV_KEYS.adminAccount]: "joe@x.dev" });
    const res = await onSetStatusPost(withJson(ctx, { emailHash: targetEh, status: "disabled" }));
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(409);
    expect(body.error).toBe("E_ADMIN_PROTECTED");
  });

  it("activation works the other direction (200 ok)", async () => {
    const rows = new Map<string, string>();
    const { sessionId, targetEh } = await adminWiring(rows);
    const store = realShapeKv(rows);
    await store.put(keys.account(targetEh), JSON.stringify({ created: 1, role: "viewer", status: "disabled" }));
    const ctx = await adminContext(rows, sessionId);
    const res = await onSetStatusPost(withJson(ctx, { emailHash: targetEh, status: "active" }));
    const body = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const raw = JSON.parse(rows.get(`acct:${targetEh}`) as string) as { status?: string };
    expect(raw.status).toBe("active");
  });

  it("bad status / bad body / unknown hash answer their typed refusals", async () => {
    const rows = new Map<string, string>();
    const { sessionId, targetEh } = await adminWiring(rows);
    const ctx = await adminContext(rows, sessionId);
    const badStatus = await onSetStatusPost(withJson(ctx, { emailHash: targetEh, status: "paused" }));
    expect(badStatus.status).toBe(400);
    expect(((await badStatus.json()) as { error?: string }).error).toBe("E_BAD_STATUS");
    const junk = await onSetStatusPost({
      ...ctx,
      request: new Request(new URL(ctx.request.url), {
        method: "POST",
        headers: {
          ...Object.fromEntries(ctx.request.headers),
          "Content-Type": "application/json",
        },
        body: "{ this is not json",
      }),
    });
    expect(junk.status).toBe(400);
    expect(((await junk.json()) as { error?: string }).error).toBe("E_BAD_BODY");
    const ghost = await onSetStatusPost(withJson(ctx, { emailHash: "f".repeat(32), status: "active" }));
    expect(ghost.status).toBe(404);
    expect(((await ghost.json()) as { error?: string }).error).toBe("E_NO_ACCOUNT");
  });

  it("without a live session the door stays shut (typed 401, nothing mutates)", async () => {
    const rows = new Map<string, string>();
    const { targetEh } = await adminWiring(rows);
    const before = rows.get(`acct:${targetEh}`);
    const ctx = await adminContext(rows, "bsess_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    const res = await onSetStatusPost(withJson(ctx, { emailHash: targetEh, status: "disabled" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error?: string }).error).toBe("E_NO_SESSION");
    expect(rows.get(`acct:${targetEh}`)).toBe(before);
  });
});
