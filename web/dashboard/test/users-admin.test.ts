import { describe, expect, it } from "vitest";
import {
  emailHashFor,
  keys,
  makeAccounts,
  type AccountRecord,
} from "../functions/lib/accounts";
import type { KVStore } from "../functions/lib/kv";

/** The users-module admin ops under test (catalog #13): roster +
 *  status flips over the in-memory store; gate wiring is route-side. */

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

async function seedAccount(store: KVStore, email: string, salt: string, status: "active" | "disabled" = "active") {
  const eh = await emailHashFor(email, salt);
  const account: AccountRecord = { created: Date.now(), role: "viewer", status };
  await store.put(keys.account(eh), JSON.stringify(account));
  return eh;
}

describe("listAccounts", () => {
  it("returns the roster newest-first with hashes as identities", async () => {
    const store = memoryStore();
    await seedAccount(store, "new@x.dev", "salt");
    const older = await emailHashFor("old@x.dev", "salt");
    await store.put(keys.account(older), JSON.stringify({ created: 1, role: "admin", status: "active" }));

    const rows = await makeAccounts(store, "salt").listAccounts();
    expect(rows).toHaveLength(2);
    expect(rows[0].created).toBeGreaterThan(rows[1].created);
    expect(rows.every((r) => /^[0-9a-f]{32}$/.test(r.emailHash))).toBe(true);
  });

  it("shape-gates acct: rows so foreign keys cannot fabricate roster rows", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    await seedAccount(store, "real@x.dev", "");
    await store.put("acct:not-a-hash", JSON.stringify({ created: 2, role: "admin", status: "active" }));
    await store.put("corrupt-row", "junk");
    const rows = await accounts.listAccounts();
    expect(rows).toHaveLength(1);
  });
});

describe("setAccountStatus", () => {
  it("flips status and persists it", async () => {
    const store = memoryStore();
    const eh = await seedAccount(store, "flip@x.dev", "s");
    const accounts = makeAccounts(store, "s");
    expect(await accounts.setAccountStatus(eh, "disabled")).toBe(true);
    const raw = JSON.parse((await store.get(keys.account(eh))) as string) as AccountRecord;
    expect(raw.status).toBe("disabled");
    expect(await accounts.setAccountStatus(eh, "active")).toBe(true);
  });

  it("refuses hashes that are not 32-hex and unknown hashes", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    expect(await accounts.setAccountStatus("; drop table users", "disabled")).toBe(false);
    expect(await accounts.setAccountStatus("a".repeat(31), "disabled")).toBe(false);
    expect(await accounts.setAccountStatus("f".repeat(32), "disabled")).toBe(false);
  });
});

describe("disabled enforcement", () => {
  it("a disabled account cannot mint a session (verify refuses with disabled)", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    // the account must EXIST before it can be disabled: setAccountStatus
    // refuses to fabricate rows, and no honest admin path can disable a
    // hash that never joined the roster
    const first = await accounts.requestOtp("locked@x.dev");
    if (first.verdict !== "send") throw new Error("expected send");
    const created = await accounts.verifyOtp("locked@x.dev", first.code);
    if (created.verdict !== "ok") throw new Error("expected ok");
    const eh = await emailHashFor("locked@x.dev", "");
    await accounts.setAccountStatus(eh, "disabled");

    // a fresh code later (throttle row cleared to simulate time passing)
    await store.delete(keys.throttle(eh));
    const second = await accounts.requestOtp("locked@x.dev");
    if (second.verdict !== "send") throw new Error("expected send #2");
    expect((await accounts.verifyOtp("locked@x.dev", second.code)).verdict).toBe("disabled");
  });

  it("accountActive is false as soon as the row flips (bound tokens die)", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    const sent = await accounts.requestOtp("gate@x.dev");
    if (sent.verdict !== "send") throw new Error("expected send");
    const ok = await accounts.verifyOtp("gate@x.dev", sent.code);
    if (ok.verdict !== "ok") throw new Error("expected ok");
    await accounts.bindToken(ok.sessionId, "local", "vguest_t");
    expect(await accounts.accountActive(ok.sessionId)).toBe(true);

    await accounts.setAccountStatus(await emailHashFor("gate@x.dev", ""), "disabled");
    expect(await accounts.accountActive(ok.sessionId)).toBe(false);
  });

  it("an unknown account row (never migrated from another salt) stays active", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    const sent = await accounts.requestOtp("orph@x.dev");
    if (sent.verdict !== "send") throw new Error("expected send");
    const ok = await accounts.verifyOtp("orph@x.dev", sent.code);
    if (ok.verdict !== "ok") throw new Error("expected ok");
    // simulate the row vanishing (external prune): session stays usable
    await store.delete(keys.account(await emailHashFor("orph@x.dev", "")));
    expect(await accounts.accountActive(ok.sessionId)).toBe(true);
  });
});
