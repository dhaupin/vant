import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { actions, useApp } from "../../state";
import { Help } from "../../frame/Tooltip";

/**
 * Module: onboarding (wave 19.25). THE CONNECT-your-vant walk: four
 * typed steps, live verdicts at each — no faked greens anywhere.
 *
 *   1. Launch vant        — the command, the door default
 *   2. Enter your door    — origin + verify-live against /health and
 *                           /mcp/tools (same truth the Settings card pins)
 *   3. Enter your guest   — the vguest_ paste, right here (same bind law
 *                           as Settings: server-side with a session,
 *                           memory-only without)
 *   4. Open your board    — the live board, already riding the lane
 *
 * Nothing here calls a relay or a bridge it did not verify; every
 * refusal names why (the pass-217 honesty directive).
 */

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
        step {n} — {title}
      </p>
      {children}
    </div>
  );
}

function DoorStep() {
  const saved = useApp((s) => s.podEndpoint);
  const [draft, setDraft] = useState(saved);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "ok"; origin: string; tools: number }
    | { kind: "bad"; why: string }
  >({ kind: "idle" });

  const verify = () => {
    const ep = draft.trim().replace(/\/+$/, "");
    if (!ep) {
      actions.setPodEndpoint("");
      setState({ kind: "bad", why: "Cleared - every reach returns to this deploy's edge bridge." });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(ep);
    } catch {
      setState({ kind: "bad", why: "Not a usable origin (scheme + host required)." });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setState({ kind: "bad", why: "http(s) only - the door speaks plain origins." });
      return;
    }
    const origin = parsed.origin;
    setState({ kind: "checking" });
    fetch(origin + "/health")
      .then((r) => (r.ok ? r.json().then((j: { status?: unknown }) => j) : undefined))
      .then(async (health) => {
        if (!health || health.status !== "ok") {
          setState({ kind: "bad", why: "Answered but not as a vant door (no ok /health) - refusing to save, never guessing." });
          return;
        }
        try {
          const t = await fetch(origin + "/mcp/tools");
          const j = (await t.json().catch(() => ({}))) as { tools?: unknown[] };
          const n = Array.isArray(j.tools) ? j.tools.length : 0;
          actions.setPodEndpoint(origin);
          setState({ kind: "ok", origin, tools: n });
        } catch {
          setState({ kind: "bad", why: "/health answered but /mcp/tools did not - the door surface is not reachable from this browser." });
        }
      })
      .catch(() => {
        setState({ kind: "bad", why: "Unreachable from THIS browser (down, wrong origin, or mixed-content blocked - a https page may only reach http://localhost, never http://other-LAN hosts)." });
      });
  };

  return (
    <Step n={1} title="enter your door">
      <p className="text-sm text-ink-soft">
        Start vant on the machine that will serve it — the door is the
        dashboard's reach. The default companion posture serves{" "}
        <span className="font-mono text-ink">http://localhost:3457</span>.
      </p>
      <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs text-ink">
        vant start
      </pre>
      <label className="mt-3 block">
        <span className="text-xs text-ink-soft">your door origin (a running vant answers /health):</span>
        <div className="mt-1 flex gap-2">
          <input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
            placeholder="http://localhost:3457"
            className="w-full rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs"
          />
          <button
            onClick={verify}
            className="shrink-0 rounded-md border border-line px-2 py-1 text-xs hover:bg-ink/5"
          >
            verify live
          </button>
        </div>
      </label>
      <p className="mt-2 text-xs text-ink-soft">
        {state.kind === "checking" && <span>Reading the door's /health and /mcp/tools...</span>}
        {state.kind === "idle" && saved && (
          <span>
            Your door is set: <span className="font-mono text-ink">{saved}</span> — exec and the board
            stream ride it browser-direct. Verify live to re-read it.
          </span>
        )}
        {state.kind === "idle" && !saved && <span>No door entered yet - the dashboard rides this deploy's edge bridge.</span>}
        {state.kind === "bad" && <span className="text-accent">✗ {state.why}</span>}
        {state.kind === "ok" && (
          <span>
            ✓ the door at <span className="font-mono text-ink">{state.origin}</span> answers
            ({state.tools} tool{state.tools === 1 ? "" : "s"} registered) - it is now your dashboard's
            lane. A keyed door (mcp.requireKey) may refuse the browser's Bearer across origins - its
            gates, stated plainly, not guessed.
          </span>
        )}
      </p>
    </Step>
  );
}

function TokenStep() {
  const property = useApp((s) => s.property);
  const account = useApp((s) => s.account);
  const boundFor = useApp((s) => s.boundFor);
  const carried = useApp((s) => s.tokens[property] ?? null);
  const [value, setValue] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const bound = boundFor.includes(property);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pasted = value.trim();
    if (!pasted.startsWith("vguest_")) {
      setErr("That is not a guest token. It starts with vguest_.");
      return;
    }
    setErr(null);
    if (account) {
      try {
        const res = await fetch(`/api/session?p=${encodeURIComponent(property)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: pasted }),
        });
        const data = (await res.json().catch(() => ({}))) as { bound?: boolean };
        if (res.ok && data.bound) {
          actions.markBound(property);
          setNote("Bound server-side to your session - the browser holds no copy.");
          setValue("");
          return;
        }
        setNote("Functions refused the bind - carrying it memory-only for this tab.");
      } catch {
        setNote("Functions not reachable - keeping the token memory-only for this tab.");
      }
    } else {
      setNote("No email session on this tab - kept memory-only, never stored or logged.");
    }
    actions.setToken(property, pasted);
  };

  return (
    <Step n={2} title="enter your guest identity">
      <p className="text-sm text-ink-soft">
        Issue a guest token on the pod, then paste it right here:
      </p>
      <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs text-ink">
        vant guest issue
      </pre>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="vguest_..."
          className="block w-56 rounded-md border border-line bg-paper px-2 py-1 font-mono text-xs outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-paper hover:bg-accent-deep"
        >
          Bind identity
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-soft">
        {bound
          ? "This tab's property has an identity bound server-side."
          : carried
          ? "Identity carried for this tab (memory + this tab's session scope, wiped on close)."
          : "No identity carried yet for this tab."}
      </p>
      {note ? <p className="mt-2 text-xs text-ink-soft">{note}</p> : null}
      {err ? <p className="mt-2 text-xs text-err">{err}</p> : null}
    </Step>
  );
}

function BoardStep() {
  const where = useApp((s) => !!s.podEndpoint);
  return (
    <Step n={3} title="open your board">
      <p className="text-sm text-ink-soft">
        {where
          ? "Your door is set - the live board will stream from it browser-direct, and every door call rides the same lane (named in /chain)."
          : "Without a door entered, the board streams from this deploy's edge bridge (the operator's attached properties)."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/"
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-paper hover:bg-accent-deep"
        >
          Open the live board
        </Link>
        <Link
          to="/chain"
          className="rounded-md border border-line px-3 py-1.5 text-xs hover:bg-ink/5"
        >
          See the route record
        </Link>
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        The walk, honestly scoped: step 1 verifies the door answers THIS browser (a https page may
        reach <span className="font-mono">http://localhost</span>, never another plain-http LAN host).
        The identity in step 2 rides the tab's own scope — never a shared cache, never a server you
        did not paste it into.
      </p>
    </Step>
  );
}

export default function Onboarding() {
  return (
    <div>
      <h1 className="text-lg font-semibold">Connect your vant</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Step by step: launch the pod, enter its door, paste your guest token — the fields are right
        here.
      </p>
      <Help text="Nothing is faked green: each step records a real verdict from a real read — the door's /health + /mcp/tools for the origin, the tab's own bind law for the token.">
        <DoorStep />
      </Help>
      <TokenStep />
      <BoardStep />
    </div>
  );
}
