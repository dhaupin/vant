import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet, onRequestPost } from "../functions/api/r/relay";
import type { PagesContext } from "../functions/types";

/**
 * The relay's translated door calls must carry the CALLER's credential to
 * the pod bridge. The browser lane admits a request on nothing but a
 * `vguest_` prefix (no signature), so if the forward drops the
 * Authorization header the pod receives an anonymous call - and a pod
 * running its default mcpRequireKey=false executes it.
 */

function ctx(headers: Record<string, string>, body: unknown): PagesContext {
  return {
    request: new Request("https://dash.example/api/r/relay", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    env: {
      VANT_RELAY_ENABLED: "1",
      VANT_RELAY_POD_ORIGIN: "https://pod.example.com",
      VANT_PROPERTY_LOCAL_ORIGIN: "https://pod.example.com",
    },
    params: {},
  } as unknown as PagesContext;
}

function relayCall() {
  return {
    event: "relay.call",
    from: "crew",
    ts: Date.now(),
    nonce: "n1",
    payload: { tool: "brain_write", args: { name: "a.md", content: "x" } },
    v: { major: 2 },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("relay door-call credential forwarding", () => {
  it("forwards the caller's Bearer token to the pod door", async () => {
    const seen: Array<string | null> = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get("Authorization"));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const res = await onRequestPost(
      ctx({ Authorization: "Bearer vguest_abc_def" }, relayCall()),
    );
    expect(res.status).toBe(200);
    expect(seen.length).toBeGreaterThan(0);
    // every translated call carries the identity, not just the first
    expect(seen.every((h) => h === "Bearer vguest_abc_def")).toBe(true);
  });

  it("never leaks the dashboard session cookie to the pod", async () => {
    let sawCookie = false;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      if (new Headers(init.headers).get("Cookie")) sawCookie = true;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await onRequestPost(
      ctx(
        { Authorization: "Bearer vguest_abc_def", Cookie: "bdash_session=bsess_live" },
        relayCall(),
      ),
    );
    // the pod must not receive a replayable dashboard admin session
    expect(sawCookie).toBe(false);
  });

  it("GET answers 405 instead of falling through to the SPA", async () => {
    const res = await onRequestGet(ctx({}, {}));
    expect(res.status).toBe(405);
  });
});
