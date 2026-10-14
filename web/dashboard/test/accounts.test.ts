import { describe, expect, it } from "vitest";
import {
  OTP_MAX_ATTEMPTS,
  SESSION_TTL_SECONDS,
  constantTimeEqual,
  keys,
  makeAccounts,
  validEmailShape,
  type AccountRecord,
  type SessionRecord,
} from "../functions/lib/accounts";
import type { KVStore } from "../functions/lib/kv";

/**
 * The P2 account layer's pure logic under test (prd-web.md 3.5): an
 * in-memory KV store, no Workers runtime needed.
 */

function memoryStore(): KVStore & { dump: () => Map<string, unknown> } {
  const rows = new Map<string, string>();
  return {
    async get(key) {
      return rows.get(key) ?? null;
    },
    async put(key, value, _options) {
      void _options; // TTLs are exercised via explicit expiry rows below
      rows.set(key, value);
    },
    async delete(key) {
      rows.delete(key);
    },
    dump: () => rows,
  };
}

const PAST = Date.now() - (SESSION_TTL_SECONDS + 60) * 1000;

describe("requestOtp", () => {
  it("mints a 6-digit numeric code and stores it", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "salt");
    const out = await accounts.requestOtp("Operator@Example.com ");
    expect(out.verdict).toBe("send");
    if (out.verdict !== "send") return;
    expect(out.code).toMatch(/^\d{6}$/);
    const stored = await store.get(keys.code(await (await import("../functions/lib/accounts")).emailHashFor("operator@example.com", "salt")));
    expect(stored).not.toBeNull();
    const rec = JSON.parse(stored as string) as { hash: string; attempts: number };
    expect(rec.hash).not.toBe(out.code); // stored HASHED, never plaintext
    expect(rec.attempts).toBe(OTP_MAX_ATTEMPTS);
  });

  it("goes to cooldown immediately after a send", async () => {
    const accounts = makeAccounts(memoryStore(), "");
    expect((await accounts.requestOtp("a@b.co")).verdict).toBe("send");
    expect((await accounts.requestOtp("a@b.co")).verdict).toBe("cooldown");
  });

  it("rejects malformed addresses with the invalid verdict", async () => {
    const accounts = makeAccounts(memoryStore(), "");
    expect((await accounts.requestOtp("not-an-email")).verdict).toBe("invalid");
    expect((await accounts.requestOtp("a@")).verdict).toBe("invalid");
  });

  it("uses different throttle keys for different emails", async () => {
    const accounts = makeAccounts(memoryStore(), "");
    expect((await accounts.requestOtp("a@b.co")).verdict).toBe("send");
    expect((await accounts.requestOtp("c@d.co")).verdict).toBe("send");
  });
});

describe("verifyOtp", () => {
  it("accepts the right code once, then treats a replay as expired", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "salt");
    const sent = await accounts.requestOtp("op@x.dev");
    if (sent.verdict !== "send") throw new Error("expected send");
    const ok = await accounts.verifyOtp("op@x.dev", sent.code);
    expect(ok.verdict).toBe("ok");
    const replay = await accounts.verifyOtp("op@x.dev", sent.code);
    expect(replay.verdict).toBe("expired");
  });

  it("is normalized: case and padding do not defeat it", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    const sent = await accounts.requestOtp("Mixed@Case.Dev");
    if (sent.verdict !== "send") throw new Error("expected send");
    expect((await accounts.verifyOtp("MIXED@CASE.dev", sent.code)).verdict).toBe("ok");
  });

  it("burns the code after the attempt budget is spent", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    const sent = await accounts.requestOtp("burn@x.dev");
    if (sent.verdict !== "send") throw new Error("expected send");
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
      expect((await accounts.verifyOtp("burn@x.dev", "000000")).verdict).toBe("mismatch");
    }
    // last allowed attempt also mismatches; the row is then deleted
    expect((await accounts.verifyOtp("burn@x.dev", "000000")).verdict).toBe("burned");
    const gone = await store.get(keys.code(await (await import("../functions/lib/accounts")).emailHashFor("burn@x.dev", "")));
    expect(gone).toBeNull();
  });

  it("bootstraps the FIRST account as admin and later ones as viewer", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    const first = await accounts.requestOtp("boss@x.dev");
    if (first.verdict !== "send") throw new Error("expected send");
    const firstOk = await accounts.verifyOtp("boss@x.dev", first.code);
    if (firstOk.verdict !== "ok") throw new Error("expected ok");
    expect(firstOk.account.role).toBe("admin");

    const second = await accounts.requestOtp("crew@x.dev");
    if (second.verdict !== "send") throw new Error("expected send");
    const secondOk = await accounts.verifyOtp("crew@x.dev", second.code);
    if (secondOk.verdict !== "ok") throw new Error("expected ok");
    expect(secondOk.account.role).toBe("viewer");
  });
});

describe("sessions", () => {
  it("binds a pod token server-side and reads it back through sessionFor", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    const sent = await accounts.requestOtp("bind@x.dev");
    if (sent.verdict !== "send") throw new Error("expected send");
    const ok = await accounts.verifyOtp("bind@x.dev", sent.code);
    if (ok.verdict !== "ok") throw new Error("expected ok");
    expect(await accounts.bindToken(ok.sessionId, "local", "vguest_test")).toBe(true);
    const session = await accounts.sessionFor(ok.sessionId);
    expect(session?.tokens["local"]).toBe("vguest_test");
  });

  it("treats an expired session record as absent", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    const stale: SessionRecord = {
      emailHash: "eh",
      role: "viewer",
      created: PAST,
      tokens: {},
    };
    await store.put(keys.session("bsess_old"), JSON.stringify(stale));
    expect(await accounts.sessionFor("bsess_old")).toBeNull();
  });

  it("refuses ids that are not bsess_ sessions", async () => {
    const accounts = makeAccounts(memoryStore(), "");
    expect(await accounts.sessionFor("vguest_what")).toBeNull();
    expect(await accounts.sessionFor("../etc/passwd")).toBeNull();
  });

  it("destroySession removes it from further reads", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    const sent = await accounts.requestOtp("die@x.dev");
    if (sent.verdict !== "send") throw new Error("expected send");
    const ok = await accounts.verifyOtp("die@x.dev", sent.code);
    if (ok.verdict !== "ok") throw new Error("expected ok");
    await accounts.destroySession(ok.sessionId);
    expect(await accounts.sessionFor(ok.sessionId)).toBeNull();
    expect(await accounts.accountFor(ok.sessionId)).toBeNull();
  });
});

describe("helpers", () => {
  it("validEmailShape holds the line", () => {
    expect(validEmailShape("ok@example.com")).toBe(true);
    expect(validEmailShape("  Ok@Example.COM ")).toBe(true);
    expect(validEmailShape("nope")).toBe(false);
    expect(validEmailShape("a b@c.io")).toBe(false);
    expect(validEmailShape("@broken")).toBe(false);
  });

  it("constantTimeEqual compares honestly", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("account records", () => {
  it("persist with the account key layout", async () => {
    const store = memoryStore();
    const accounts = makeAccounts(store, "");
    const sent = await accounts.requestOtp("persist@x.dev");
    if (sent.verdict !== "send") throw new Error("expected send");
    const ok = await accounts.verifyOtp("persist@x.dev", sent.code);
    if (ok.verdict !== "ok") throw new Error("expected ok");
    const who = (await accounts.accountFor(ok.sessionId)) as { emailHash: string };
    const raw = await store.get(keys.account(who.emailHash));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as AccountRecord;
    expect(parsed.status).toBe("active");
  });
});
