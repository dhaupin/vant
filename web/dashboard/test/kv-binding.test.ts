/**
 * The BOLETE_KV adapter (wave 19.15): pins for the storeFor choke
 * point. A REAL Workers KV namespace answers list() with a page object
 * ({keys, list_complete, cursor}) while every consumer (accounts
 * roster, audit ledger) speaks the plain row array. Before the adapter
 * the production /api/users route threw a TypeError on .map() and the
 * UI rendered "refused: HTTP 500" - the in-test memory stores hid it
 * because they already answered the array shape. Pins:
 *   1. a real-shape namespace adapts to the row array (cursor walk)
 *   2. list_complete stops the walk; rows arrive in order
 *   3. a namespace already answering the array shape passes through
 *   4. a binding missing the duck methods = the typed StoreUnavailable
 */
import { describe, expect, it } from "vitest";
import { KV_BINDING, StoreUnavailableError, storeFor } from "../functions/lib/kv";
import type { PagesContext } from "../functions/types";

/** The runtime shape: real KV's put echoes the declared signature and
 *  list speaks page objects with cursor pagination. */
function realShapeKv(rows: Array<{ name: string }>) {
  return {
    get: () => Promise.resolve(null),
    put: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    list(options: { prefix?: string; cursor?: string; limit?: number }) {
      const first = rows.filter((r) => r.name.startsWith(options.prefix ?? ""));
      if (options.cursor === "p2") {
        return Promise.resolve({ keys: first.slice(1), list_complete: true });
      }
      return Promise.resolve({ keys: first.slice(0, 1), list_complete: false, cursor: "p2" });
    },
  };
}

function contextWith(binding: unknown): PagesContext {
  return {
    request: new Request("https://dashboard.test/api/users"),
    env: { [KV_BINDING]: binding } as Record<string, unknown>,
    params: {},
  };
}

describe("BOLETE_KV adapter (storeFor)", () => {
  it("adapts the real page-object list() into the row-array contract", async () => {
    const store = storeFor(contextWith(realShapeKv([
      { name: "acct:aaaa" },
      { name: "acct:bbbb" },
      { name: "acct:cccc" },
    ])));
    const rows = await store.list("acct:");
    expect(rows).toEqual([
      { name: "acct:aaaa" },
      { name: "acct:bbbb" },
      { name: "acct:cccc" },
    ]);
  });

  it("ordered rows and a yes-complete third page end the walk", async () => {
    const source = realShapeKv([{ name: "acct:one" }, { name: "acct:two" }, { name: "acct:three" }]);
    const walk: Array<{ cursor?: string }> = [];
    const original = source.list.bind(source);
    let calls = 0;
    source.list = (options) => {
      calls += 1;
      walk.push({ cursor: options?.cursor });
      if (calls >= 3) {
        return Promise.resolve({ keys: [{ name: "acct:tail" }], list_complete: true });
      }
      return Promise.resolve({
        keys: [{ name: `acct:page${calls}` }],
        list_complete: false,
        cursor: `page${calls + 1}`,
      });
    };
    void original;
    const store = storeFor(contextWith(source));
    const rows = await store.list("acct:");
    expect(rows.map((r) => r.name)).toEqual(["acct:page1", "acct:page2", "acct:tail"]);
  });

  it("a namespace already answering the array shape passes through untouched", async () => {
    const store = storeFor(contextWith({
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      list: () => Promise.resolve([{ name: "acct:row" } as { name: string }]),
    }));
    await expect(store.list("acct:")).resolves.toEqual([{ name: "acct:row" }]);
  });

  it("a binding half-shaped without the duck methods refuses typed, not 500", () => {
    expect(() => storeFor(contextWith({ get: 42 }))).toThrow(StoreUnavailableError);
  });
});
