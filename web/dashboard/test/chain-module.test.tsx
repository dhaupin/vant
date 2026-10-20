import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Chain, { CORE_RUNG, HopRow, ProbeCard } from "../src/modules/chain";
import { relayCaps, ApiError } from "../src/api";

/**
 * The prd-carrier-share.md §5 P5b pins: the chain module renders caps
 * verdicts plus the not-yet-e2e (core-rung) status HONESTLY — a 404 is a
 * record (not a crash), an inactive hop is never a greenwashed badge, and
 * the only cross-origin fetch the module may make is the public caps route.
 */
const CAPS = {
  relay: "r/2",
  flavor: "solo-relay",
  gated: true,
  gateReady: true,
  e2e: "envelope-required",
};

describe("HopRow — honest chain badges", () => {
  it("renders caps verdict verbatim + the core-rung status (no greenwashed e2e badge)", () => {
    const html = renderToString(
      <HopRow label="relay hop" state={{ s: "on", caps: CAPS }} />,
    );
    expect(html).toContain("r/2");
    expect(html).toContain("solo-relay");
    expect(html).toContain("envelope-required");
    expect(html).toContain(CORE_RUNG);
    expect(html).toContain("P6b rung");
  });

  it("names the ACTIVE hop with a real badge, inactive hops with 'not routed yet'", () => {
    const active = renderToString(
      <HopRow label="pod bridge" state={{ s: "on", caps: CAPS }} active />,
    );
    expect(active).toContain("ACTIVE hop");
    expect(active).not.toContain("not routed yet");

    const inactive = renderToString(
      <HopRow label="your /web/relay hop" state={{ s: "on", caps: CAPS }} />,
    );
    expect(inactive).toContain("not routed yet");
    expect(inactive).not.toContain("ACTIVE hop");
  });

  it("404 = 'not a relay' honest record — never an error page, never fabricated caps", () => {
    const html = renderToString(
      <HopRow label=".deploy" state={{ s: "off" }} />,
    );
    expect(html).toContain("not a relay");
    expect(html).not.toContain("envelope-required");
    expect(html).not.toContain("gate ready");
  });

  it("unreachable origin is a stated record too", () => {
    const html = renderToString(
      <HopRow label="deploy" state={{ s: "unreachable" }} />,
    );
    expect(html).toContain("answered nothing");
  });
});

describe("relayCaps — the contract-defined public caps fetch, honest refusals", () => {
  const origin = "https://relay.example.com";

  afterEach(() => vi.restoreAllMocks());

  it("policy-reads the caps route and returns the parsed caps", async () => {
    const f = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CAPS), { status: 200 }),
    );
    vi.stubGlobal("fetch", f);
    const caps = await relayCaps(origin);
    expect(caps.relay).toBe("r/2");
    expect(f.mock.calls[0][0]).toBe(origin + "/api/r/capabilities");
  });

  it("404 refuses as an honest record, not a crash (ApiError, kind refused)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error":"Not Found"}', { status: 404 })),
    );
    try {
      await relayCaps(origin);
      throw new Error("should have refused");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).kind).toBe("refused");
      expect((e as ApiError).status).toBe(404);
      expect((e as ApiError).message).toContain("not a relay");
    }
  });

  it("non-envelope-required (plain pipe) caps refuse LOUDLY", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...CAPS, e2e: "plain" }), { status: 200 }),
      ),
    );
    try {
      await relayCaps(origin);
      throw new Error("should have refused");
    } catch (e) {
      expect((e as ApiError).message).toContain("plain pipe");
    }
  });

  it("non-r/2 caps refuse (this chain speaks r/2 only)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...CAPS, relay: "r/1" }), { status: 200 }),
      ),
    );
    await expect(relayCaps(origin)).rejects.toThrow("not contract r/2");
  });
});

describe("ProbeCard — the probe rides the DOOR, ready-by-render", () => {
  it("renders the probe button with the door phrasing, nothing auto-fires", () => {
    const html = renderToString(<ProbeCard />);
    expect(html).toContain("relay.lost rides the door");
    // SSR renders no verdict until a probe is actually run — no fabricated data
    expect(html).not.toContain("ok:true");
  });
});

describe("Chain module — the READ (registry #20)", () => {
  it("imports cleanly and exports a component (module #20, route registered via registry+main routes)", () => {
    expect(typeof Chain).toBe("function");
  });
});
