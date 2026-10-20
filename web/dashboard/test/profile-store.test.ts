import { describe, expect, it } from "vitest";
import {
  memoryKV,
  storeProfileOnDevice,
  loadProfileFromDevice,
  wipeDeviceProfile,
  prfAvailable,
  unlockWithPrf,
  bindPrfProfile,
  loadProfileFromPrfDevice,
  readPrfBinding,
  forgetPrfBinding,
  type StoredProfile,
} from "../src/lib/profile-store";
import type { SovereignProfile } from "../src/lib/profile";

/**
 * (pass 274, prd-relay.md §2.2) THE DEVICE PROFILE STORE, pinned:
 *   §1 — THE RECORD IS SEALED AT REST: the KV dump holds ciphertext +
 *        the non-extractable device key — no plaintext profile bytes land
 *        in the store, ever.
 *   §2 — POSSESSION IS THE UNLOCK: store → load round-trips through the
 *        device key; a wiped key store renders the stored record
 *        unopenable (typed refusal, never a re-seed).
 *   §3 — THE DEVICE KEY IS NON-EXTRACTABLE: `extractable === false`
 *        (a page can USE it, never export it — the §2.2 sentence, tested).
 *   §4 — THE PRF LANE IS HONEST: unavailable platforms refuse TYPED
 *        before any wire; never a fake unlock.
 */
const KEY = "c".repeat(16) + "d".repeat(16);
const TOKEN = "vguest_" + "b".repeat(30);
const PROFILE: SovereignProfile = {
  v: 1,
  kind: "bolete-profile",
  exported: Date.now(),
  chain: [{ id: "hop-1", origin: "https://relay.example.com", flavor: "solo-relay", e2e: "envelope-required" }],
  channelKeys: { local: KEY },
  tokens: { local: TOKEN },
  relayUsage: true,
};

describe("§1 — the record is sealed at rest", () => {
  it("the KV dump holds NO plaintext profile bytes", async () => {
    const kv = memoryKV();
    await storeProfileOnDevice(kv, PROFILE);
    const dump = [...kv.dump().entries()];
    const text = JSON.stringify(dump);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("bolete-profile");
    const rec = dump.find(([k]) => k === "instance-profile")?.[1] as StoredProfile;
    // canonical SHAPE: salt:iv:tag:cipher
    expect(rec.ct.split(":")).toHaveLength(4);
    expect(rec.sealedAt).toBeGreaterThan(0);
  });
});

describe("§2 — possession is the unlock", () => {
  it("store → load round-trips the verbatim profile", async () => {
    const kv = memoryKV();
    await storeProfileOnDevice(kv, PROFILE);
    const back = await loadProfileFromDevice(kv);
    expect(back).toEqual(PROFILE);
  });

  it("an empty device answers null (honest miss, never a fabricated profile)", async () => {
    const kv = memoryKV();
    await expect(loadProfileFromDevice(kv)).resolves.toBeNull();
  });

  it("losing the device key renders the record unopenable (typed, never re-seeded)", async () => {
    const kv = memoryKV();
    await storeProfileOnDevice(kv, PROFILE);
    await kv.delete("device-key"); // the device lost its key store
    await expect(loadProfileFromDevice(kv)).rejects.toThrow(/no profile is stored on this device yet/);
  });

  it("a corrupted record refuses typed (never a guess)", async () => {
    const kv = memoryKV();
    await kv.put("instance-profile", { sealedAt: 1, ct: "not-the-canon" });
    await expect(loadProfileFromDevice(kv)).rejects.toThrow(/E_PROFILE_STORE/);
  });

  it("wipe removes the record AND the key (forget is real)", async () => {
    const kv = memoryKV();
    await storeProfileOnDevice(kv, PROFILE);
    await wipeDeviceProfile(kv);
    await expect(loadProfileFromDevice(kv)).resolves.toBeNull();
    await kv.put("device-key", null); // a null key row must refuse too
    await expect(loadProfileFromDevice(kv)).resolves.toBeNull();
  });
});

describe("§3 — the device key is NON-EXTRACTABLE (tested law, not a comment)", () => {
  it("extractable === false on the stored device key", async () => {
    const kv = memoryKV();
    await storeProfileOnDevice(kv, PROFILE);
    const key = (await kv.get("device-key")) as CryptoKey;
    expect(key.extractable).toBe(false);
    expect(key.type).toBe("secret");
    expect(key.usages).toContain("encrypt");
  });
});

describe("§4 — the PRF lane prefers typed honesty", () => {
  it("a platform without WebAuthn refuses TYPED before any wire", async () => {
    // node's test env has no navigator — path (b) must refuse, not pretend
    expect(prfAvailable()).toBe(false);
    await expect(
      unlockWithPrf({ credentialId: new Uint8Array(16), challenge: new Uint8Array(16) }),
    ).rejects.toThrow(/E_PROFILE_PRF/);
  });

  it("a PRF-provider context without PRF output refuses (the authenticator's honesty)", async () => {
    // stub a navigator whose credentials return a non-PRF assertion
    // (node 22 pins navigator as getter-only: defineProperty, not assign)
    const g = globalThis as Record<string, unknown>;
    Object.defineProperty(g, "navigator", {
      value: { credentials: { get: async () => ({ getClientExtensionResults: () => ({}) }) } },
      configurable: true,
    });
    try {
      await expect(
        unlockWithPrf({
          credentialId: new Uint8Array(16),
          challenge: new Uint8Array(16),
          loadSealedByPrf: async () => "vprof-1:mock",
        }),
      ).rejects.toThrow(/no PRF output/);
    } finally {
      Object.defineProperty(g, "navigator", { value: undefined, configurable: true });
    }
  });
});

describe("§5 — the PRF BIND rung: a real stored lane (b), sealed like the rest", () => {
  // a deterministic mock PRF output — the KEK is "prf:" + hex(prf), so the
  // same bytes always open the same seal (the deterministic-derivation law)
  const PRF_BYTES = new Uint8Array(64).map((_, i) => (i * 7 + 3) % 256);
  const RAW_ID = new Uint8Array(16).map((_, i) => (i + 1) % 256);
  function prfNavigator(): unknown {
    return {
      credentials: {
        create: async () => ({ rawId: RAW_ID.slice().buffer }),
        get: async (_o: unknown) => ({ getClientExtensionResults: () => ({ prfResults: [PRF_BYTES.slice().buffer] }) }),
      },
    };
  }

  it("bind: the stored record carries ids/salt in the clear and the profile SEALED — no plaintext bytes", async () => {
    const g = globalThis as Record<string, unknown>;
    Object.defineProperty(g, "navigator", { value: prfNavigator(), configurable: true });
    const kv = memoryKV();
    try {
      await bindPrfProfile(kv, PROFILE);
      const text = JSON.stringify([...kv.dump().entries()]);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(KEY);
      expect(text).not.toContain("bolete-profile");
      const b = (await kv.get("prf-binding")) as { kind?: string; credentialId?: string; salt?: string; ct?: string };
      expect(b.kind).toBe("bolete-prf-binding");
      expect(b.credentialId).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(b.salt).toMatch(/^[0-9a-f]{64}$/);
      expect(b.ct.split(":")).toHaveLength(4);
    } finally {
      Object.defineProperty(g, "navigator", { value: undefined, configurable: true });
    }
  });

  it("unlock: the SAME PRF derivation opens the bound profile verbatim", async () => {
    const g = globalThis as Record<string, unknown>;
    Object.defineProperty(g, "navigator", { value: prfNavigator(), configurable: true });
    const kv = memoryKV();
    try {
      await bindPrfProfile(kv, PROFILE);
      const back = await loadProfileFromPrfDevice(kv);
      expect(back).toEqual(PROFILE);
    } finally {
      Object.defineProperty(g, "navigator", { value: undefined, configurable: true });
    }
  });

  it("a tampered sealed record refuses typed (the record is not the unlock — the KEK is)", async () => {
    const g = globalThis as Record<string, unknown>;
    Object.defineProperty(g, "navigator", { value: prfNavigator(), configurable: true });
    const kv = memoryKV();
    try {
      await bindPrfProfile(kv, PROFILE);
      const b = (await kv.get("prf-binding")) as { ct: string };
      await kv.put("prf-binding", { ...b, ct: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01:bbbbbbbbbbbb:" + "c".repeat(32) + ":" + "d".repeat(32) });
      await expect(loadProfileFromPrfDevice(kv)).rejects.toThrow(/E_PROFILE_PRF/);
    } finally {
      Object.defineProperty(g, "navigator", { value: undefined, configurable: true });
    }
  });

  it("forget: the binding record wipes; the lane answers null (honest miss)", async () => {
    const g = globalThis as Record<string, unknown>;
    Object.defineProperty(g, "navigator", { value: prfNavigator(), configurable: true });
    const kv = memoryKV();
    try {
      await bindPrfProfile(kv, PROFILE);
      await forgetPrfBinding(kv);
      expect(await readPrfBinding(kv)).toBeNull();
      expect(await loadProfileFromPrfDevice(kv)).toBeNull();
    } finally {
      Object.defineProperty(g, "navigator", { value: undefined, configurable: true });
    }
  });
});
