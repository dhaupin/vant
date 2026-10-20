import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "module";

/**
 * The P6b rung pins (prd-relay.md §5): the pairing-time e2e channel.
 *   §1 — THE SEAL IS THE CANON: a browser seal opens with the pod's own
 *        law (PBKDF2-SHA256 100k → AES-256-GCM, 12 B IV, salt:iv:tag:cipher
 *        hex), re-created here with node crypto WITHOUT cross-requiring
 *        the pod lib (the one-way boundary stays clean; only the canon
 *        constants are restated, exactly as documented).
 *   §2 — THE ROUTE: exec() rides SEALED when usage is ON and a key is
 *        bound; a typed refusal ADVANCES to the direct pod bridge, and
 *        the route record names the lane that actually answered.
 */
import Chain from "../src/modules/chain";
import { openEnvelope, sealEnvelope } from "../src/lib/seal";
import { exec, ApiError } from "../src/api";
import { actions, getState } from "../src/state";

const require_ = createRequire(import.meta.url);
const crypto = require_("crypto");

const KEY = "a".repeat(16) + "b".repeat(16); // 32+ chars, the binding law

/** The pod's decrypt law, restated with node crypto (no cross-require). */
function podDecryptOuvre(ct: string, key: string): string {
  const parts = ct.split(":");
  expect(parts.length).toBe(4);
  const salt = Buffer.from(parts[0], "hex");
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const cipher = Buffer.from(parts[3], "hex");
  const der = crypto.pbkdf2Sync(key, salt, 100000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", der, iv);
  decipher.setAuthTag(tag);
  return decipher.update(cipher, undefined, "utf8") + decipher.final("utf8");
}

describe("P6b seal: the Encrypt canon, browser-crafted bytes (§1)", () => {
  it("a browser seal opens with the pod's exact decrypt law", async () => {
    const ct = await sealEnvelope("ride-inner { nonce }", KEY);
    // shape: salt:iv:tag:cipher with the modern widths (16B salt, 12B IV, 16B tag)
    const parts = ct.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toHaveLength(32);
    expect(parts[1]).toHaveLength(24);
    expect(parts[2]).toHaveLength(32);
    expect(podDecryptOuvre(ct, KEY)).toBe("ride-inner { nonce }");
  });

  it("a pod-sealed envelope opens in the browser (the answer half)", async () => {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const der = crypto.pbkdf2Sync(KEY, salt, 100000, 32, "sha256");
    const cipher = crypto.createCipheriv("aes-256-gcm", der, iv);
    const enc = Buffer.concat([cipher.update("the-pod-answer", "utf8"), cipher.final()]);
    const ct = salt.toString("hex") + ":" + iv.toString("hex") + ":" + cipher.getAuthTag().toString("hex") + ":" + enc.toString("hex");
    await expect(openEnvelope(ct, KEY)).resolves.toBe("the-pod-answer");
  });

  it("a wrong key refuses with the pod's law, never garbage", async () => {
    const ct = await sealEnvelope("secret", KEY);
    await expect(openEnvelope(ct, "z".repeat(32))).rejects.toThrow(/wrong key or corrupted data/);
  });

  it("a non-Vant IV width refuses typed before any key work", async () => {
    const ct = "0".repeat(32) + ":" + "0".repeat(20) + ":" + "0".repeat(32) + ":ff";
    await expect(openEnvelope(ct, KEY)).rejects.toThrow(/not a Vant\/stegoframe record/);
  });
});

describe("P6b exec routing: sealed ride + fail-over (§2)", () => {
  type FetchProps = { url: string; body: string };
  const calls: FetchProps[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    calls.length = 0;
    actions.unbindChannelKey("local");
    actions.setRelayUsage(false);
    actions.markRoute(null);
  });

  it("usage ON + key bound: the call rides SEALED and the result unseals", async () => {
    // arm the sovereign profile
    actions.bindChannelKey("local", KEY);
    actions.setRelayUsage(true);

    const sealed = vi.fn((url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body ?? "" });
      const inner = JSON.parse(podDecryptOuvre((JSON.parse(init?.body ?? "{}") as { payload?: { ct?: string } }).payload?.ct ?? "", KEY));
      // the pod's ride core answers re-sealed, same key, same law:
      // a FRESH salt/iv — the canon derives per record
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(12);
      const derived = crypto.pbkdf2Sync(KEY, salt, 100000, 32, "sha256");
      const c = crypto.createCipheriv("aes-256-gcm", derived, iv);
      const routeBody = init?.body ?? "";
      const answer = Buffer.concat([c.update(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true, echoed: inner.body.tool, rodebodies: routeBody.length } }), "utf8"), c.final()]);
      const replyCt = salt.toString("hex") + ":" + iv.toString("hex") + ":" + c.getAuthTag().toString("hex") + ":" + answer.toString("hex");
      return Promise.resolve(new Response(JSON.stringify({
        received: true, event: "relay.ride", handlers: 0, dispatched: 1,
        reply: { ok: true, rode: true, ct: replyCt, ms: 5 },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    });
    vi.stubGlobal("fetch", sealed);

    const out = (await exec("traveler_status", { id: "x" })) as { echoed?: string };
    expect(out.echoed).toBe("traveler_status");
    // the ride crossed the edge's family route, sealed
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/r/relay");
    expect((JSON.parse(calls[0].body) as { event?: string }).event).toBe("relay.ride");
    expect(getState().lastRoute).toBe("sealed-ride-e2e");
  });

  it("a typed sealed refusal ADVANCES to the direct pod bridge (never stalls)", async () => {
    actions.bindChannelKey("local", KEY);
    actions.setRelayUsage(true);

    const fetch2 = vi.fn((url: string) => {
      calls.push({ url, body: "" });
      if (url === "/api/r/relay") {
        return Promise.resolve(new Response(JSON.stringify({
          received: true, event: "relay.ride", handlers: 0, dispatched: 0,
          reply: { ok: false, code: "E_RIDE_REPLAY", error: "this ride nonce was already used inside the TTL window - replays refuse." },
        }), { status: 200, headers: { "content-type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true, via: "direct" } }), { status: 200, headers: { "content-type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetch2);

    const out = (await exec("traveler_status", {})) as { via?: string };
    expect(out.via).toBe("direct");
    expect(calls.map((c) => c.url)).toEqual(["/api/r/relay", "/api/mcp/exec"]);
    expect(getState().lastRoute).toContain("failover");
    expect(getState().lastRoute).toContain("E_RIDE_REPLAY");
  });

  it("no key bound + usage ON: the honest direct bridge, whose record says why", async () => {
    actions.setRelayUsage(true);
    const fetch3 = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }), { status: 200, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetch3);
    await exec("health_check", {});
    expect(getState().lastRoute).toContain("no e2e key bound");
  });
});

describe("chain module reads the rung honestly (render pins)", () => {
  it("the route record + e2e tie render; the saved-hop badge shows its own caps e2e", () => {
    const { addHop, removeHop } = actions;
    addHop({ origin: "https://relay.example.com", flavor: "solo-relay", e2e: "envelope-required" });
    const saved = getState().chain.find((h) => h.origin === "https://relay.example.com");
    const html = renderToString(<Chain />);
    // entity/comment-safe assertions: markup splits text nodes (<!-- -->,
    // ' -> &#x27;), so pin load-bearing substrings, not whole sentences
    expect(html).toContain("e2e lane LIVE");
    expect(html).toContain("binding at /pairing");
    expect(html).toContain("solo-relay · envelope-required");
    expect(html).toContain("route record");
    if (saved) removeHop(saved.id);
    expect(getState().chain.some((h) => h.origin === "https://relay.example.com")).toBe(false);
  });

  it("an unbound profile states the honest tie (no fake key badge)", () => {
    const html = renderToString(<Chain />);
    expect(html).toContain("no key bound yet");
  });
});

describe("ApiError carries the typed codes", () => {
  it("the sealed-lane refusal message embeds the E_RIDE_* code verbatim", () => {
    const e = new ApiError("E_RIDE_DECODE: wrong or stale", "refused");
    expect(e.kind).toBe("refused");
    expect(e.message).toContain("E_RIDE_DECODE");
  });
});
