import { useEffect, useState } from "react";
import { Modal, useModal } from "./Modal";
import { SignInPanel } from "./AuthGate";
import { actions, useApp } from "../state";
import { renderMarkdown } from "../lib/lilmd";

/**
 * THE LANDER (wave 19.28, owner) — the signed-out dashboard page.
 * =========================================================================
 * What used to be the auth gate's GateShell becomes a real landing page:
 * a header (wordmark left, Sign in CTA on the right), gloss and flow in
 * the body (what the dashboard shows, where a seat comes from), and the
 * footer links. The Sign in CTA opens the CURRENT sign-in component in a
 * modal — the behavior is rehoused, not rewritten: the same email-code
 * gate and the same honest paste-token fallback ride inside.
 *
 * THE OSS SETTING: everything between the header and the footer can be
 * the operator's own words. The deployment's admin sets custom content
 * (HTML and/or markdown — the combo) in Settings -> "Lander content";
 * it rides the same KV the accounts store uses, served by /api/lander
 * with the html lane sanitized at write (no script/iframe/on*), and the
 * md lane escaped-everything by lilmd. No custom content (or no store at
 * all) = the built-in gloss you are reading now — a silent failure would
 * be a fake lander, so the fetch degrades honestly, never halfway.
 */

type LanderCustom = { html: string; md: string } | null;

export function Lander() {
  const signInModal = useModal();
  const theme = useApp((s) => s.theme);
  const account = useApp((s) => s.account);
  const [custom, setCustom] = useState<LanderCustom>(null);

  // Probe the OSS setting once: an undeployed functions layer or an
  // unconfigured store BOTH degrade to the built-in gloss on purpose
  // (that is the honest default, not a hidden error).
  useEffect(() => {
    let alive = true;
    fetch("/api/lander")
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as
          | { custom?: { html?: string; md?: string } | null }
          | null;
        const c = data?.custom;
        if (c && (c.html || c.md)) setCustom({ html: c.html || "", md: c.md || "" });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <img alt="" className="size-7 rounded-lg" src="/vant-bolete-logo-sm.png" />
            <span className="text-lg font-semibold tracking-tight">Bolete</span>
            <span className="hidden text-xs text-ink-soft sm:inline">the Vant dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeButton theme={theme} />
            {/* THE CTA: on the right-hand side of the header, one click from
                the whale sign-in component — modal, not a page jump. */}
            {account ? null : (
              <button
                type="button"
                onClick={signInModal.show}
                data-testid="lander-sign-in-cta"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:bg-accent-deep"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        {/* Default gloss FIRST, custom content swaps in when the probe
            names it: the page is never blank while the setting resolves,
            and a silent-fetch failure degrades to the built-in gloss on
            purpose (statement above, the OSS contract). */}
        {custom ? (
          <>
            {custom.html ? (
              <div className="lander-html" dangerouslySetInnerHTML={{ __html: custom.html }} />
            ) : null}
            {custom.md ? (
              <div className="lander-md prose-lander" dangerouslySetInnerHTML={{ __html: renderMarkdown(custom.md) }} />
            ) : null}
          </>
        ) : (
          <BuiltInGloss />
        )}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-ink-soft">
          New to Vant? Start at the{" "}
          <a href="https://vant.creadev.org" rel="noopener" target="_blank" className="underline hover:text-ink">
            Vant home page
          </a>{" "}
          or open the{" "}
          <a href="https://docs.creadev.org/vant" rel="noopener" target="_blank" className="underline hover:text-ink">
            docs
          </a>
          .
        </div>
      </footer>

      {signInModal.open ? (
        <Modal title="Sign in to Bolete" onClose={signInModal.hide}>
          <SignInPanel />
        </Modal>
      ) : null}
    </div>
  );
}

function ThemeButton({ theme }: { theme: string }) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to the ${next} theme`}
      title={`switch to ${next}`}
      onClick={() => actions.setTheme(next as "light" | "dark")}
      className="rounded-md border border-line px-2 py-1.5 text-xs text-ink-soft hover:bg-ink/5"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

/**
 * The built-in gloss and flow — rehoused from the old GateShell with the
 * pieces the lander needed (the three cards, the seat line). Same words,
 * new home, header with the CTA they deserve.
 */
function BuiltInGloss() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Your agent OS, watched live.
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">
        Sign in and this becomes the board over your running Vant pod:
        sessions, crews, carriers, ledgers. Sign-out state keeps only this
        page — and your own words, if you give it any.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Sessions, live</p>
          <p className="mt-1 text-xs text-ink-soft">
            Agent work as it happens: tool calls, budgets, refusals.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Crews and carriers</p>
          <p className="mt-1 text-xs text-ink-soft">
            Rosters, brains, and sealed packets in flight between pods.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Ledgers with doors on them</p>
          <p className="mt-1 text-xs text-ink-soft">
            Audit trails and forum verdicts, scoped by your guest role.
          </p>
        </div>
      </div>
      <p className="mt-6 max-w-2xl text-xs text-ink-soft">
        A seat comes from a running Vant pod: the operator issues a{" "}
        <code className="mx-0.5 rounded border border-line bg-paper px-1 font-mono">vguest_</code>
        token with <code className="font-mono">vant guest issue</code>, and the
        dashboard reads that pod over the gated dashboard bridge. New here? The
        links below carry you.
      </p>
    </div>
  );
}
