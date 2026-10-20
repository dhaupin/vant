import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { actions, getState } from "../src/state";

/**
 * (pass 272) THE E2E KEY CARD render pins: the honest key manager.
 * The raw key NEVER re-displays (the binding moment showed it once);
 * the unbind is explicit + confirmed; rotation is stated as operator-side.
 */
import Settings from "../src/modules/settings";

const KEY = "a".repeat(16) + "b".repeat(16);

afterEach(() => {
  actions.unbindChannelKey("local");
});

describe("e2e key card — the sovereign profile's honest key manager", () => {
  it("an unbound profile points at /pairing (the only surface that delivers the key)", () => {
    const html = renderToString(<Settings />);
    expect(html).toContain("e2e channel key");
    expect(html).toContain("bind once at");
    expect(html).toContain("/pairing");
    expect(html).not.toContain("unbind this key");
  });

  it("a bound profile holds the key without re-displaying its raw bytes", () => {
    actions.bindChannelKey("local", KEY);
    expect(getState().channelKeys["local"]).toBe(KEY);
    const html = renderToString(<Settings />);
    expect(html).toContain("unbind this key");
    // the raw value must never leak into the markup: only the masked inline
    // (renderToString comment-splits text nodes, pin the fragments)
    expect(html).toContain("aaaa");
    expect(html).toContain("…");
    expect(html).not.toContain(KEY);
  });

  it("the card states the rotation truth (unbind here never rotates the pod's key)", () => {
    actions.bindChannelKey("local", KEY);
    const html = renderToString(<Settings />);
    expect(html).toContain("rotation stays operator-side");
    expect(html).toContain("does");
  });
});
