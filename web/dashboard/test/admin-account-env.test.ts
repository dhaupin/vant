import { describe, expect, it } from "vitest";
import { emailHashFor, keys, makeAccounts } from "../functions/lib/accounts";
import type { KVStore } from "../functions/lib/kv";

/** The BOLETE_ADMIN_ACCOUNT pin (wave 19.16, owner): admin becomes
 *  DETERMINISTIC instead of race-won - the pinned email bootstraps
 *  straight to admin, promotes an existing viewer, and leaves the
 *  bootstrap race marker alone. Unset = the old law, untouched.
 *  Harness law: the FIRST account on a fresh store still takes admin
 *  by the bootstrap race, so every scenario burns that slot with a
 *  throwaway account before asserting anything else. */

function memoryStore(): KVStore {
  const rows = new Map<string, string>();
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
    async list(prefix) {
      return [...rows.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
    },
  };
}

function makeHarness(store: KVStore, adminEmail?: string) {
  const accounts = makeAccounts(store, "salt", adminEmail);
  /** One full email-code round-trip: request, read the minted code
   *  (the harness IS the mailman), verify. */
  const request = async (email: string) => {
    const issued = await accounts.requestOtp(email);
    if (issued.verdict !== "send") return { verdict: "no-code" as const };
    return accounts.verifyOtp(email, issued.code);
  };
  return { accounts, request };
}

describe("admin account env pin", () => {
  it("unset pin: the OLD law survives - first verify bootstraps admin, later ones viewer", async () => {
    const store = memoryStore();
    const { request } = makeHarness(store);
    const first = await request("op@x.dev");
    expect(first.verdict).toBe("ok");
    if (first.verdict !== "ok") return; // type-narrow
    expect(first.account.role).toBe("admin");
    const second = await request("fan@x.dev");
    if (second.verdict !== "ok") return;
    expect(second.account.role).toBe("viewer");
  });

  it("pinned email becomes admin WITHOUT the bootstrap race (marker untouched)", async () => {
    const store = memoryStore();
    const { request } = makeHarness(store, "op@x.dev");
    void (await request("throwaway@x.dev")); // consumes the fresh-store bootstrap
    const fan = await request("fan@x.dev"); // not the pin
    if (fan.verdict !== "ok") return;
    expect(fan.account.role).toBe("viewer"); // race winner, marker consumed
    const op = await request("op@x.dev"); // the pin, arriving SECOND
    if (op.verdict !== "ok") return;
    expect(op.account.role).toBe("admin"); // env pin wins outright
    // The marker still names the race winner (the throwaway), never the
    // pinned op: the env law mints admin without writing the bootstrap key.
    expect(await store.get(keys.bootstrap())).toBe(await emailHashFor("throwaway@x.dev", "salt"));
  });

  it("an EXISTING (non-bootstrap) viewer with the pinned email is PROMOTED on its next verify", async () => {
    const store = memoryStore();
    const seeded = makeHarness(store); // NO pin yet
    void (await seeded.request("throwaway@x.dev")); // consumes the bootstrap
    const seed = await seeded.request("member@x.dev");
    if (seed.verdict !== "ok") return;
    expect(seed.account.role).toBe("viewer");

    const { request } = makeHarness(store, "member@x.dev"); // pin starts now
    const again = await request("member@x.dev");
    if (again.verdict !== "ok") return;
    expect(again.account.role).toBe("admin");
  });

  it("a non-pinned account stays viewer even with the pin set", async () => {
    const store = memoryStore();
    const { request } = makeHarness(store, "op@x.dev");
    void (await request("throwaway@x.dev")); // consumes the bootstrap
    const fan = await request("fan@x.dev");
    if (fan.verdict !== "ok") return;
    expect(fan.account.role).toBe("viewer");
  });

  it("a malformed BOLETE_ADMIN_ACCOUNT value is IGNORED (no pin, old law)", async () => {
    const store = memoryStore();
    const { request } = makeHarness(store, "not-an-email");
    const who = await request("whoever@x.dev");
    if (who.verdict !== "ok") return;
    expect(who.account.role).toBe("admin"); // bootstrap fallback
    expect(await store.get(keys.bootstrap())).toBe(await emailHashFor("whoever@x.dev", "salt"));
  });
});
