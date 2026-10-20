import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * (P6b) THE EDGE'S SEALED RIDE LANE, pinned at the function boundary:
 *   R1 — posture off = the deploy is NOT a relay (404, no route).
 *   R2 — browser lane ride: Bearer vguest_ + no signature, bent payload →
 *        typed NEEDS_ENVELOPE; a well-shaped ct forwards the door verb
 *        relay_ride (the edge NEVER opens it) and answers the ack.
 *   R3 — relay-lane ride refuses: rides decode at the pod, never here.
 * podBridgeForward is mocked (the pod bridge lane is its own pinned
 * surface); the assertions here are about the ROUTE law, not the bridge.
 */

const forwardMock = vi.fn(async (_context: unknown, _req: Request) => {
  return new Response(JSON.stringify({
    jsonrpc: "2.0", id: 1,
    result: { ok: true, rode: true, ct: "aa".repeat(16) + ":" + "bb".repeat(12) + ":" + "cc".repeat(16) + ":ff" },
  }), { status: 200 });
});

vi.doMock("../functions/lib/bridge", () => ({
  forward: (context: unknown, req: Request) => forwardMock(context, req),
}));

type RelayHandler = (context: { env: Record<string, string>; request: Request; }) => Promise<Response>;

function ctx(body: unknown, headers: Record<string, string> = {}, env: Record<string, string> = {}): { env: Record<string, string>; request: Request } {
  return {
    env,
    request: new Request("https://dash.example.com/api/r/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  };
}

const SIG = "x".repeat(64);

beforeAll(async () => {
  // smoke: the route module imports cleanly with the bridge mocked
  vi.resetModules();
  await import("../functions/api/r/relay");
});

describe("edge relay.ride — the browser lane and its refusals", () => {
  it("R1: posture off = Not Found (the deploy is not a relay)", async () => {
    vi.resetModules();
    const mod = await import("../functions/api/r/relay");
    const h = mod.onRequestPost as RelayHandler;
    const res = await h(ctx(
      { event: "relay.ride", ts: Date.now(), nonce: "n", payload: {}, v: { major: 2 } },
      { Authorization: "Bearer vguest_test" },
      {},
    ));
    expect(res.status).toBe(404);
  });

  it("R2a: a browser-lane ride missing its seal refuses typed NEEDS_ENVELOPE (never forwards)", async () => {
    vi.resetModules();
    const mod = await import("../functions/api/r/relay");
    const h = mod.onRequestPost as RelayHandler;
    const res = await h(ctx(
      { event: "relay.ride", ts: Date.now(), nonce: "n", payload: { wrong: true }, v: { major: 2 } },
      { Authorization: "Bearer vguest_test" },
      { VANT_RELAY_ENABLED: "1", VANT_RELAY_GATE_KEY: "k".repeat(32) },
    ));
    const ack = (await res.json()) as { reply?: { code?: string } };
    expect(res.status).toBe(200);
    expect(ack.reply?.code).toBe("E_RELAY_NEEDS_ENVELOPE");
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it("R2b: a sealed browser-lane ride forwards the relay_ride door verb (the edge cannot open it)", async () => {
    forwardMock.mockClear();
    vi.resetModules();
    const mod = await import("../functions/api/r/relay");
    const h = mod.onRequestPost as RelayHandler;
    const ct = "11".repeat(16) + ":" + "22".repeat(12) + ":" + "33".repeat(16) + ":aabbcc";
    const res = await h(ctx(
      { event: "relay.ride", ts: Date.now(), nonce: "n", payload: { ct }, v: { major: 2 } },
      { Authorization: "Bearer vguest_test" },
      { VANT_RELAY_ENABLED: "1", VANT_RELAY_GATE_KEY: "k".repeat(32) },
    ));
    const ack = (await res.json()) as { dispatched?: number; reply?: { ok?: boolean; answer?: { result?: { rode?: boolean; ct?: string } } } };
    expect(forwardMock).toHaveBeenCalledTimes(1);
    const fwd = forwardMock.mock.calls[0][1] as Request;
    const fwdBody = (await fwd.json()) as { tool?: string; args?: { ct?: string } };
    expect(fwdBody.tool).toBe("relay_ride");
    expect(fwdBody.args?.ct).toBe(ct); // the seal rides VERBATIM — no edge mangling
    expect(ack.dispatched).toBe(1);
    expect(ack.reply?.ok).toBe(true);
    expect(ack.reply?.answer?.result?.rode).toBe(true);
  });

  it("R3a: a RELAY-lane ride with a BAD hmac never reaches an ack (transport 401, the gate IS the lane)", async () => {
    forwardMock.mockClear();
    vi.resetModules();
    const mod = await import("../functions/api/r/relay");
    const h = mod.onRequestPost as RelayHandler;
    const res = await h(ctx(
      { event: "relay.ride", ts: Date.now(), nonce: "n", payload: { ct: "aa" }, v: { major: 2 } },
      { "X-Signature-256": SIG },
      { VANT_RELAY_ENABLED: "1", VANT_RELAY_GATE_KEY: "k".repeat(32) },
    ));
    expect(res.status).toBe(401);
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it("R3b: a VALIDLY-signed relay-lane ride still refuses typed — rides decode at the pod, never at this edge", async () => {
    forwardMock.mockClear();
    vi.resetModules();
    const mod = await import("../functions/api/r/relay");
    const h = mod.onRequestPost as RelayHandler;
    const { createHmac } = await import("crypto");
    const raw = JSON.stringify({ event: "relay.ride", ts: Date.now(), nonce: "n", payload: { ct: "11".repeat(16) + ":" + "22".repeat(12) + ":" + "33".repeat(16) + ":aabb" }, v: { major: 2 } });
    const goodSig = createHmac("sha256", "k".repeat(32)).update(raw).digest("hex");
    const res = await h({
      env: { VANT_RELAY_ENABLED: "1", VANT_RELAY_GATE_KEY: "k".repeat(32) },
      request: new Request("https://dash.example.com/api/r/relay", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Signature-256": goodSig }, body: raw,
      }),
    });
    const ack = (await res.json()) as { reply?: { ok?: boolean; code?: string } };
    expect(res.status).toBe(200);
    expect(ack.reply?.ok).toBe(false);
    expect(ack.reply?.code).toBe("E_RELAY_UNKNOWN_EVENT");
    expect(forwardMock).not.toHaveBeenCalled();
  });
});
