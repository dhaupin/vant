import { describe, expect, it } from "vitest";
import { onRequestGet } from "../functions/api/users";
import { emailHashFor, keys, makeAccounts } from "../functions/lib/accounts";
import { KV_BINDING, type KVStore } from "../functions/lib/kv";
import type { PagesContext } from "../functions/types";

/**
 * PRODUCTION REPRO: a real-shape (page-object) KV namespace + a forged
 * live admin session, riding the actual onRequestGet handler. If this
 * passes, the code cannot 500 on the deployed path and the deployed
 * functions are stale.
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
    /** REAL Workers KV shape: page object, cursor pagination, 1-key pages. */
    async list(options) {
      const all = [...rows.keys()].filter((k) => k.startsWith(options.prefix ?? "")).sort();
      if (options.cursor === "p2") {
        return { keys: all.slice(1).map((name) => ({ name })), list_complete: true };
      }
      return { keys: all.slice(0, 1).map((name) => ({ name })), list_complete: false, cursor: "p2" };
    },
  };
}

async function contextWith(rows: Map<string, string>, sessionId: string): Promise<PagesContext> {
  return {
    request: new Request("https://brain.example/api/users", { headers: { Cookie: `bdash_session=${sessionId}` } }),
    env: { [KV_BINDING]: realShapeKv(rows), VANT_EMAIL_SALT: "prod" },
    params: {},
  };
}

describe("repro: GET /api/users against a real-shape KV", () => {
  it("answers 200 {users, count} through the real page-object adapter", async () => {
    const rows = new Map<string, string>();
    const store = realShapeKv(rows);
    const accounts = makeAccounts(store, "prod");
    const sent = await accounts.requestOtp("owner@x.dev");
    if (sent.verdict !== "send") throw new Error("expected send");
    const made = await accounts.verifyOtp("owner@x.dev", sent.code);
    if (made.verdict !== "ok") throw new Error("expected ok");
    // promote to admin and rewrite the session as admin
    const eh = await emailHashFor("owner@x.dev", "prod");
    await store.put(keys.account(eh), JSON.stringify({ created: Date.now(), role: "admin", status: "active" }));
    await store.put(keys.session(made.sessionId), JSON.stringify({ emailHash: eh, role: "admin", created: Date.now(), tokens: {} }), { expirationTtl: 86400 });

    const res = await onRequestGet(await contextWith(rows, made.sessionId));
    const body = (await res.json()) as { users?: unknown[]; count?: number };
    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.users?.[0]).toMatchObject({ role: "admin", status: "active" });
  });

  it("a malformed-escape session cookie answers typed 401 E_NO_SESSION (wave 19.18: the URIError->500 killer is dead)", async () => {
    const rows = new Map<string, string>();
    const res = await onRequestGet(await contextWith(rows, "bdash_session=bsess_junk%zz"));
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(401);
    expect(body.error).toBe("E_NO_SESSION");
  });
});
