import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Lander } from "../src/frame/Lander";
import { Modal } from "../src/frame/Modal";
import { AuthGate } from "../src/frame/AuthGate";
import { getState } from "../src/state";
import { readLander, sanitizeOwnedHtml, shapeLander } from "../functions/lib/lander";

/**
 * The lander pins (wave 19.28, owner): the signed-out page is a LANDER
 * with the header CTA - not the old full-page gate. SSR asserts what the
 * markup states; interaction stays covered by the components' own laws
 * (the modal's Escape/scrim handlers are one視mount deep and typed).
 */
describe("the lander (the signed-out page, wave 19.28)", () => {
  it("the signed-out gate renders the lander (CTA in the header, built-in gloss after)", () => {
    const html = renderToString(<Lander />);
    expect(html).toContain("the Vant dashboard");
    expect(html).toContain("lander-sign-in-cta");
    expect(html).toContain(">Sign in</button>");
    // the built-in gloss is the default until custom content exists
    expect(html).toContain("Your agent OS, watched live.");
  });

  it("the gate keeps its swap law: children ride when a session/bit exists", () => {
    // state is empty at import (no token, no account): SSR shows the probe splash
    const html = renderToString(<AuthGate>{<p id="board">BOARD</p>}</AuthGate>);
    expect(html).toContain("Checking for a live session");
    expect(html).not.toContain('id="board"');
  });

  it("the modal markup is a typed dialog on a scrim", () => {
    const html = renderToString(
      <Modal title="Sign in" onClose={() => undefined}>
        <p>SIGN-IN</p>
      </Modal>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("SIGN-IN");
  });
});

describe("the lander store lib (functions/lib/lander.ts)", () => {
  it("sanitizeOwnedHtml drops script/iframe/on*/javascript:/data:", () => {
    const dirty =
      "<p>ok</p><script>alert(1)</script><iframe src=\"https://x\"></iframe><a href=\"javascript:bad()\">x</a><img src=\"data:x\" /><b onclick=\"boom()\">b</b>";
    const out = sanitizeOwnedHtml(dirty);
    expect(out).toContain("<p>ok</p>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:");
    expect(out).not.toContain("<iframe");
  });

  it("shapeLander: typed refusals name the problem, guarded by the caps", () => {
    expect(shapeLander({}).error).toMatch(/E_LANDER_EMPTY/);
    expect(shapeLander("nope").error).toMatch(/E_LANDER_SHAPE/);
    const long = "x".repeat(12001);
    expect(shapeLander({ md: long }).error).toMatch(/E_LANDER_TOO_LARGE/);
    const ok = shapeLander({ md: "# hi" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.content.md).toBe("# hi");
  });

  it("the read verb degrades honestly: bad store rows read as no custom", async () => {
    const store = {
      get: async () => "not json",
      put: async () => undefined,
      delete: async () => undefined,
    };
    expect(await readLander(store as never)).toBe(null);
    expect(getState().account).toBeNull();
  });
});
