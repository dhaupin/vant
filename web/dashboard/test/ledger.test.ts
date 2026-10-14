import { describe, expect, it } from "vitest";
import { LEDGER_PREFIX, makeLedger, verdictKind } from "../functions/lib/ledger";
import type { KVStore } from "../functions/lib/kv";

/** The frontend's own audit ledger under test - in-memory store with
 *  the minimal list shape. */

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

describe("ledger", () => {
  it("appends rows under the aud: prefix and lists newest-first", async () => {
    const store = memoryStore();
    const ledger = makeLedger(store);
    await ledger.append("auth.otp.requested", { role: "viewer" });
    await ledger.append("auth.otp.verified");
    await ledger.append("bridge.refused", { reason: "origin_missing", property: "local" });

    const events = await ledger.recent();
    expect(events).toHaveLength(3);
    expect(events[0].kind).toBe("bridge.refused"); // newest first
    expect(events[2].kind).toBe("auth.otp.requested");
    const names = (await store.list(LEDGER_PREFIX)).map((r) => r.name);
    expect(names.every((n) => n.startsWith(LEDGER_PREFIX))).toBe(true);
  });

  it("respects the read cap and skips corrupt rows instead of faking them", async () => {
    const store = memoryStore();
    const ledger = makeLedger(store);
    for (let i = 0; i < 4; i++) await ledger.append("auth.session.created", { role: "viewer" });
    await store.put(`${LEDGER_PREFIX}garbage-row`, "{not json");

    const events = await ledger.recent(3);
    expect(events).toHaveLength(3);
    expect(events.every((e) => typeof e.kind === "string")).toBe(true);
  });

  it("records never contain discriminator-style PII keys (schema honesty)", async () => {
    const ledger = makeLedger(memoryStore());
    await ledger.append("auth.otp.requested", { role: "viewer" });
    const events = await ledger.recent();
    const flat = JSON.stringify(events);
    expect(flat).not.toMatch(/email|vguest_|bsess_/);
  });

  it("verdictKind maps the accounts verdicts onto ledger kinds", () => {
    expect(verdictKind({ verdict: "send" })).toBe("auth.otp.requested");
    expect(verdictKind({ verdict: "cooldown" })).toBe("auth.otp.cooldown");
    expect(verdictKind({ verdict: "ok" })).toBe("auth.otp.verified");
    expect(verdictKind({ verdict: "mismatch" })).toBe("auth.otp.failed");
    expect(verdictKind({ verdict: "burned" })).toBe("auth.otp.burned");
    expect(verdictKind({ verdict: "expired" })).toBe("auth.otp.failed");
  });
});
