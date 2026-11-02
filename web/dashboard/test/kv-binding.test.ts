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
 *   5. (19.19) a REAL class-backed namespace whose list is a this-bound
 *      prototype method - the shape every arrow shim hid - adapts too
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

  it("(wave 19.19) a namespace whose list is a real method - bound to `this` - answers rows, not an detached-call crash", async () => {
    /** The production shape the arrow-property shims never carried: a
     *  REAL workerd namespace is a class-backed platform object; its
     *  list is a prototype method that reads `this`. Calling it
     *  detached (what the 19.15 adapter did) throws on every
     *  production list call while tests, which always hang list on a
     *  plain object, never see it. Live-caught 2026-11-02 on
     *  brain.creadev.org: /api/users and /api/audit answered bare 1101
     *  for live admin sessions while /api/auth/session (which never
     *  lists) sailed through 200. */
    class PlatformNamespace {
      #rows: Array<{ name: string }>;
      constructor(rows: Array<{ name: string }>) {
        this.#rows = rows;
      }
      get(key: string) {
        return Promise.resolve(this.#rows.some((r) => r.name === key) ? "{}" : null);
      }
      put() {
        return Promise.resolve();
      }
      delete() {
        return Promise.resolve();
      }
      list(options: { prefix?: string; cursor?: string; limit?: number }) {
        return Promise.resolve({
          keys: this.#rows.filter((r) => r.name.startsWith(options.prefix ?? "")),
          list_complete: true,
        });
      }
    }
    const detached = new PlatformNamespace([{ name: "acct:live" }]);
    const store = storeFor(contextWith(detached));
    await expect(store.list("acct:")).resolves.toEqual([{ name: "acct:live" }]);
  });

  it("(wave 19.22) a positional-prefix shim keeps riding its rows - the object-options call never swallows them into a silent empty", async () => {
    /** The crashtest live-catch: the probe child's in-child KVStore gimme
     *  speaks list(prefix) POSITIONALLY (startsWith(String(prefix))). The
     *  object-options call (wave 19.19's real-namespace fix) prefix-matches
     *  the literal "[object Object]" inside such a shim and answers an
     *  honest-LOOKING empty array - the roster rode count=0 and the audit
     *  inbox rode count=0 with zero faults printed. The adapter now
     *  re-asks positionally whenever the object answer is an array and
     *  obeys whichever answer carries rows. */
    const rows: Array<{ name: string }> = [
      { name: "acct:ud-admin" },
      { name: "aud:1700_mint" },
      { name: "acct:ud-viewer" },
    ];
    const positionalShim = {
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      list(prefix: string) {
        return Promise.resolve(
          rows.filter((r) => r.name.startsWith(String(prefix))),
        );
      },
    };
    const store = storeFor(contextWith(positionalShim));
    await expect(store.list("acct:")).resolves.toEqual([
      { name: "acct:ud-admin" },
      { name: "acct:ud-viewer" },
    ]);
  });

  it("(wave 19.22) an object-form-only shim that answers an array keeps its rows when the positional re-ask gives less", async () => {
    const objectOnly = {
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      list(options: { prefix?: string }) {
        const empty = !options || typeof options.prefix !== "string";
        return Promise.resolve(
          empty ? [] : [{ name: "acct:kept" } as { name: string }],
        );
      },
    };
    const store = storeFor(contextWith(objectOnly));
    await expect(store.list("acct:")).resolves.toEqual([{ name: "acct:kept" }]);
  });

  it("a binding half-shaped without the duck methods refuses typed, not 500", () => {
    expect(() => storeFor(contextWith({ get: 42 }))).toThrow(StoreUnavailableError);
  });
});
