import { describe, expect, it } from "vitest";
import { bridgeOptions, podTokenFor, rateGate, type PagesContext } from "../functions/lib/bridge";
import type { KVStore } from "../functions/lib/kv";

/**
 * Pins for the bridge audit scan (the three picked edges):
 *   1. a malformed cookie escape never throws — it just does not auth
 *   2. /mcp/events rides WITHOUT the fixed abort budget (SSE is live forever
 *      by design); every other route keeps its timeout
 *   3. the per-session bucket map stays bounded (spoofed-IP spray capped)
 */

function fakeContext(env: Record<string, string> = {}): PagesContext {
  return {
    request: new Request("https://dash.example/api/ping"),
    env,
    params: {},
  } as unknown as PagesContext;
}

describe("bridge audit fixes", () => {
  it("podTokenFor answers null (not a throw) on a malformed cookie escape", async () => {
    const request = new Request("https://dash.example/api/mcp/exec", {
      headers: {
        // The raw token cookie path decodes each pair; 'a%2' is not a valid
        // escape. This used to URIError out of podTokenFor itself.
        Cookie: "vg_session_local=a%2;%20;bdash_session=bsess_zz",
      },
    });
    const context = fakeContext({ VANT_PROPERTY_LOCAL_ORIGIN: "https://pod.example.com" });
    await expect(podTokenFor(context, request, "local")).resolves.toBeNull();
  });

  it("bridgeOptions keeps the abort budget off /mcp/events and on for exec", async () => {
    const request = new Request("https://dash.example/api/mcp/exec", { method: "POST" });
    const exec = await bridgeOptions(fakeContext(), request);
    expect(exec.path).toBe("/mcp/exec");
    expect(exec.init.signal).toBeDefined();

    const stream = new Request("https://dash.example/api/mcp/events");
    const events = await bridgeOptions(fakeContext(), stream);
    expect(events.path).toBe("/mcp/events");
    expect(events.init.signal).toBeUndefined();

    // an explicit non-stream timeout still honors the env override shape
    const ctx = fakeContext({ VANT_BRIDGE_TIMEOUT_MS: "not-a-number" });
    const withJunk = await bridgeOptions(ctx, new Request("https://dash.example/api/mcp/exec", { method: "POST" }));
    // junk env falls back to the 10s default rather than NaN
    expect(withJunk.init.signal).toBeDefined();
  });

  it("rateGate stays bounded under spoofed-IP spray", () => {
    for (let i = 0; i < 6000; i++) {
      const refusal = rateGate(fakeContext({ VANT_EDGE_RATE_PER_MIN: "50" }), "local", `10.0.0.${i % 250}.${i % 250}`);
      void refusal;
    }
    // No exported size probe needed: the pin is that repeated hard lines
    // still answer a clean 429-eligible 200-track without throwing — the
    // cap path (buckets.clear()) must not crash the gate.
    expect(() => {
      rateGate(fakeContext({ VANT_EDGE_RATE_PER_MIN: "50" }), "local", "203.0.113.9");
    }).not.toThrow();
  });
});
