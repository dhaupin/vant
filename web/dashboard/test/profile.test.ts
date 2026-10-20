import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import { exportProfile, importProfile, PROFILE_FILENAME } from "../src/lib/profile";
import { sealEnvelope } from "../src/lib/seal";

/**
 * (pass 273, prd-relay.md §2.2) THE SOVEREIGN PROFILE TRANSPORT, pinned:
 *   §1 — THE FILE IS THE CANON: the export opens with the pod's exact
 *        decrypt law (PBKDF2-SHA256 100k → AES-256-GCM), node-crypto
 *        re-stated here (three faces now ride the one canon: ride seal,
 *        ride open, profile kek).
 *   §2 — TYPED REFUSALS: a wrong passphrase opens to nothing (E_PROFILE_KEY);
 *        a foreign prefix/kind/version refuses (E_PROFILE_SHAPE), never a guess.
 *   §3 — THE MERGE LAW'S FACTS: the import returns the profile (binding is
 *        the caller's decision — never clobber what the tab holds).
 *   §4 — NOTHING PLAINTEXT RIDES OUTSIDE THE SEAL: the export text carries
 *        no raw token, no raw key.
 */
const require_ = createRequire(import.meta.url);
const crypto = require_("crypto");

const PASS = "the-sovereign-passphrase-1";
const TOKEN = "vguest_" + "a".repeat(30);
const KEY = "c".repeat(16) + "d".repeat(16);

const ASSETS = {
  chain: [{ id: "hop-1", origin: "https://relay.example.com", flavor: "solo-relay", e2e: "envelope-required", added: 1 }],
  channelKeys: { local: KEY },
  tokens: { local: TOKEN },
  relayUsage: true,
};

/** The pod's decrypt law, node re-statement (same as chain-e2e's). */
function podDecrypt(ct: string, key: string): string {
  const p = ct.split(":");
  if (p.length !== 4) throw new Error("format");
  const der = crypto.pbkdf2Sync(key, Buffer.from(p[0], "hex"), 100000, 32, "sha256");
  const d = crypto.createDecipheriv("aes-256-gcm", der, Buffer.from(p[1], "hex"));
  d.setAuthTag(Buffer.from(p[2], "hex"));
  return Buffer.concat([d.update(Buffer.from(p[3], "hex")), d.final()]).toString("utf8");
}

describe("§1 — the profile file is the Encrypt canon", () => {
  it("the export opens with the pod's exact law and yields the verbatim profile", async () => {
    const out = await exportProfile(ASSETS, PASS);
    expect(out.filename).toBe(PROFILE_FILENAME);
    const payload = JSON.parse(podDecrypt(out.text.replace(/^vprof-1:/, ""), PASS)) as { kind?: string; v?: number; tokens?: Record<string, string> };
    expect(payload.kind).toBe("bolete-profile");
    expect(payload.v).toBe(1);
    expect(payload.tokens?.local).toBe(TOKEN);
  });

  it("an import round-trips into the SAME profile (the transport reads its own exports)", async () => {
    const out = await exportProfile(ASSETS, PASS);
    const back = await importProfile(out.text, PASS);
    expect(back.kind).toBe("bolete-profile");
    expect(back.tokens.local).toBe(TOKEN);
    expect(back.channelKeys.local).toBe(KEY);
    expect(back.chain[0].origin).toBe("https://relay.example.com");
    expect(back.relayUsage).toBe(true);
  });
});

describe("§2 — typed refusals, never a guess", () => {
  it("a wrong passphrase opens to NOTHING (typed E_PROFILE_KEY)", async () => {
    const out = await exportProfile(ASSETS, PASS);
    await expect(importProfile(out.text, "the-wrong-pass-phrase")).rejects.toThrow(/E_PROFILE_KEY/);
  });

  it("a foreign prefix refuses typed before any key work", async () => {
    await expect(importProfile("not-a-profile", PASS)).rejects.toThrow(/E_PROFILE_SHAPE/);
  });

  it("a swapped-version payload refuses inside the seal (no downgrade)", async () => {
    const forged = JSON.stringify({ ...ASSETS, kind: "bolete-profile", tokens: {}, channelKeys: {}, v: 2 });
    const env = await sealEnvelope(forged, PASS, { minLen: 8, what: "passphrase" });
    await expect(importProfile("vprof-1:" + env, PASS)).rejects.toThrow(/refusing, no downgrade/);
  });

  it("a non-vguest_ identity inside the seal refuses (the shape law holds under the kek)", async () => {
    const forged = JSON.stringify({ kind: "bolete-profile", v: 1, tokens: { local: "imposter" }, channelKeys: {}, chain: [] });
    const env = await sealEnvelope(forged, PASS, { minLen: 8, what: "passphrase" });
    await expect(importProfile("vprof-1:" + env, PASS)).rejects.toThrow(/not a vguest_ token/);
  });

  it("a short passphrase is refused before any sealing (it is the only kek)", async () => {
    await expect(exportProfile(ASSETS, "short")).rejects.toThrow(/E_PROFILE_KEY/);
  });
});

describe("§3/§4 — the merge is the caller's; nothing plaintext rides outside the seal", () => {
  it("the import RETURNS the profile (binding decisions stay with the caller)", async () => {
    const out = await exportProfile({ chain: [], channelKeys: {}, tokens: {} }, PASS);
    const back = await importProfile(out.text, PASS);
    expect(Object.keys(back.tokens)).toHaveLength(0);
    expect(back.chain).toHaveLength(0);
  });

  it("the export text carries NO raw token and NO raw key in the clear", async () => {
    const out = await exportProfile(ASSETS, PASS);
    expect(out.text).not.toContain(TOKEN);
    expect(out.text).not.toContain(KEY);
    expect(out.text.startsWith("vprof-1:")).toBe(true);
  });

  it("a SEAL with a misspelled kind refuses (shape verified under the kek)", async () => {
    const env = await sealEnvelope(JSON.stringify({ kind: "something-else", v: 1 }), PASS, { minLen: 8, what: "passphrase" });
    await expect(importProfile("vprof-1:" + env, PASS)).rejects.toThrow(/not a bolete profile/);
  });
});
