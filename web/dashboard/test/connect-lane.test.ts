import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exec } from "../src/api";
import { getState, actions } from "../src/state";
import { streamUrlFor } from "../src/frame/events";

// the node test env has no localStorage; the reach-pref law persists
// there, so pin it against a truthful Map shim (get/set both real).
// Re-stubbed per §3 test: the shared afterEach unstubbers all globals.
const store = new Map<string, string>();
const stubStore = () =>
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k) : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });

/**
 * (wave 19.25) THE ENTER-YOUR-ENDPOINT LANE, pinned:
 *   §1 — THE LANE LAW: a verified pod origin sends exec + the board
 *        stream BROWSER-DIRECT to the door's own surfaces
 *        (<origin>/mcp/exec, <origin>/mcp/events); nothing entered rides
 *        the edge bridge exactly as before. Never a lane in between.
 *   §2 — THE STREAM URL IS PURE: the same law, one function (pinned so
 *        the board can never drift from the calls).
 *   §3 — THE PREF IS HONEST: setPodEndpoint persists like every reach
 *        pref; clearing returns every reach to the edge bridge.
 */
const DOOR = "http://localhost:3457";

afterEach(() => {
  vi.unstubAllGlobals();
  actions.setPodEndpoint("");
  actions.setToken("local", null);
});

describe("§1 — the exec lane law", () => {
  it("a entered door origin: exec posts BROWSER-DIRECT to <origin>/mcp/exec with the tab's Bearer", async () => {
    actions.setPodEndpoint(DOOR);
    actions.setToken("local", "vguest_" + "a".repeat(30));
    const fetchMock = vi.fn(async (_url: string | URL, init?: { headers?: Record<string, string> }) => {
      return new Response(JSON.stringify({ jsonrpc: "2.0", result: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = (await exec("guest_list", {})) as { ok?: boolean };
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers?: Record<string, string>; method?: string }];
    expect(url).toBe(DOOR + "/mcp/exec");
    expect(init.method).toBe("POST");
    expect(init.headers?.Authorization?.startsWith("Bearer vguest_")).toBe(true);
    expect(getState().lastRoute).toBe("direct-door " + DOOR);
  });

  it("a trailing slash is noise: the same call lands on the same origin", async () => {
    actions.setPodEndpoint(DOOR + "/");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", result: {} }), { status: 200 }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);
    await exec("guest_list", {});
    expect(fetchMock.mock.calls[0][0]).toBe(DOOR + "/mcp/exec");
  });

  it("nothing entered: the edge bridge keeps every call (the pre-wave behavior, untouched)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", result: {} }), { status: 200 }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);
    await exec("guest_list", {});
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/api/mcp/exec");
    expect(getState().lastRoute).toBe("direct");
  });

  it("the door answering nothing is a TYPED network refusal (never a fake result)", async () => {
    actions.setPodEndpoint(DOOR);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("blocked"); }));
    await expect(exec("guest_list", {})).rejects.toThrow(/answered nothing on the browser lane/);
  });
});

describe("§2 — the stream URL is the same law (pure, one function)", () => {
  it("an entered door rides the door's OWN event tap", () => {
    expect(streamUrlFor(DOOR, "local")).toBe(DOOR + "/mcp/events");
  });
  it("an entered door with junk spacing/slashes still lands clean", () => {
    expect(streamUrlFor("  " + DOOR + "///  ", "local")).toBe(DOOR + "/mcp/events");
  });
  it("nothing entered rides the edge bridge with the ?p= property", () => {
    expect(streamUrlFor("", "local")).toBe("/api/mcp/events?p=local");
  });
});

describe("§3 — the pref persists honestly", () => {
  beforeEach(() => stubStore());
  it("setPodEndpoint sticks in state AND the reach-pref store", () => {
    actions.setPodEndpoint(DOOR);
    expect(getState().podEndpoint).toBe(DOOR);
    expect(globalThis.localStorage.getItem("bolete-pod-endpoint")).toBe(DOOR);
  });
  it("clearing it returns the lane to the edge bridge (state and store agree)", () => {
    actions.setPodEndpoint(DOOR);
    actions.setPodEndpoint("");
    expect(getState().podEndpoint).toBe("");
    expect(globalThis.localStorage.getItem("bolete-pod-endpoint")).toBe("");
  });
});
