import { useEffect, useState } from "react";
import { actions, useApp, useAppRaw } from "../../state";
import { Help } from "../../frame/Tooltip";
import { ConfirmationModal } from "./confirm";

/**
 * Relay posture (prd-relay.md 4.0 - "participate as a relay" lives in
 * settings). HONEST BY CONSTRUCTION: the browser cannot flip this toggle
 * - it is the operator's deploy posture (Pages env), so this card READS
 * the deploy's public capabilities and states what it sees. No fake
 * switch, ever (the pass-217 honesty directive).
 */
type Caps = {
  relay: string;
  flavor: string;
  gated: boolean;
  gateReady: boolean;
  e2e: string;
  events: string;
};

/** the usage side (prd-relay.md 6.1): the USER'S own reach choice -
 *  persisted, theirs alone; drives chain routing once the chain editor
 *  and the pairing-time e2e keys land (stated in plain text, never
 *  fake-routed before). */
function RelayUsage() {
  const on = useApp((s) => s.relayUsage);
  return (
    <div className="text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => actions.setRelayUsage(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          reach this pod <span className="font-medium text-ink">through relay hops</span> when
          available (off = direct Mode A/B)
        </span>
      </label>
      <p className="mt-2 text-ink-soft">
        {on
          ? "Saved to your profile. What it does TODAY: nothing routes differently yet - the chain editor and the pairing-time e2e keys (prd-relay.md 5/6.1) are what make it live, and those land next. Until then traffic stays direct; this page never pretends otherwise."
          : "Direct reach (Mode A/B). Turn on when you want your traffic to ride relay hops instead."}
      </p>
    </div>
  );
}

/**
 * The corrected-arc setting (pass 233): this dashboard RUNS WITH a
 * /web/relay endpoint. The user enters the relay's origin; the card
 * verifies it LIVE against that relay's PUBLIC capabilities page
 * (cross-origin readable by contract - caps are secrets-free) and
 * states the honest today-truth: verification is live NOW; execution
 * THROUGH the relay goes live with the pairing-time e2e rung
 * (prd-relay.md 5/6.1) - the card never fake-routes.
 */
type RelayCaps = {
  relay: string;
  flavor: string;
  gated: boolean;
  gateReady: boolean;
  e2e: string;
  events: string;
};

function RelayEndpoint() {
  const saved = useApp((s) => s.relayEndpoint);
  const [draft, setDraft] = useState(saved);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "ok"; caps: RelayCaps }
    | { kind: "bad"; why: string }
  >({ kind: "idle" });

  const verify = () => {
    const ep = draft.trim().replace(/\/+$/, "");
    if (!ep) {
      actions.setRelayEndpoint("");
      setState({ kind: "bad", why: "Empty endpoint - every reach stays direct until one is entered and verified." });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(ep);
    } catch {
      setState({ kind: "bad", why: "Not a usable URL (protocol + host required)." });
      return;
    }
    if (parsed.protocol !== "https:") {
      setState({ kind: "bad", why: "https only - a relay run in the public posture is never http." });
      return;
    }
    setState({ kind: "checking" });
    fetch(parsed.origin + "/api/r/capabilities")
      .then((r) => {
        if (r.status === 404) {
          setState({ kind: "bad", why: "Answered but exposes no /api/r surface: this deploy is NOT a relay." });
          return undefined;
        }
        if (r.ok) return r.json().then((c: RelayCaps) => c);
        setState({ kind: "bad", why: `Answered outside posture (HTTP ${r.status}).` });
        return undefined;
      })
      .then((caps) => {
        if (!caps) return;
        if (caps.relay !== "r/2" || caps.e2e !== "envelope-required") {
          setState({ kind: "bad", why: `Caps exist but are not contract r/2 envelope-required - this dashboard speaks r/2 only.` });
          return;
        }
        actions.setRelayEndpoint(parsed.origin);
        setState({ kind: "ok", caps });
      })
      .catch(() => setState({ kind: "bad", why: "Unreachable - the relay answered nothing (down, or the URL is wrong)." }));
  };

  return (
    <div className="text-sm">
      <label className="block">
        <span className="text-ink-soft">relay endpoint (a /web/relay origin):</span>
        <div className="mt-1 flex gap-2">
          <input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://relay.example.com"
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
      <p className="mt-2 text-ink-soft">
        {state.kind === "checking" && <span>Reading the relay's public capabilities...</span>}
        {state.kind === "idle" && saved && <span>Saved endpoint <span className="font-mono text-ink">{saved}</span> (unverified this visit - verify live to re-read its posture).</span>}
        {state.kind === "idle" && !saved && <span>No relay endpoint set - the dashboard reaches its pod directly (Mode A/B) with nothing riding a hop.</span>}
        {state.kind === "bad" && <span className="text-accent">✗ {state.why}</span>}
        {state.kind === "ok" && (
          <span>
            ✓ verified live: <span className="font-mono text-ink">{state.caps.flavor}</span>, caps{" "}
            <span className="font-mono text-ink">{state.caps.relay}</span>, gated (HMAC route secret), gate ready{" "}
            <span className="text-ink">{String(state.caps.gateReady)}</span>, stream {state.caps.events}
          </span>
        )}
      </p>
      <p className="mt-2 text-ink-soft">
        Today's truth, stated plainly: the endpoint is verified live (the
        relay proves its own posture); execution <span className="font-medium text-ink">through</span> it
        routes with the pairing-time e2e rung (prd-relay.md 5) - until then
        this card verifies and remembers, and nothing fake-routes.
      </p>
    </div>
  );
}

function RelayPosture() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "on"; caps: Caps } | { kind: "off" } | { kind: "down" }
  >({ kind: "loading" });

  // the read is cheap and PUBLIC (no pod token involved); a recheck button
  // exists because operators flip the env mid-session - the card must not
  // stale-cache its own conclusion
  const read = () => {
    setState({ kind: "loading" });
    let alive = true;
    fetch("/api/r/capabilities")
      .then((r) => {
        if (!alive) return;
        if (r.status === 404) setState({ kind: "off" });
        else if (r.ok) r.json().then((c: Caps) => { if (alive) setState({ kind: "on", caps: c }); });
        else setState({ kind: "down" });
      })
      .catch(() => { if (alive) setState({ kind: "down" }); });
    return () => { alive = false; };
  };

  useEffect(() => read(), []);

  if (state.kind === "loading") {
    return <p className="text-sm text-ink-soft">Reading this deploy's relay posture...</p>;
  }
  if (state.kind === "down") {
    return <p className="text-sm text-ink-soft">The edge is unreachable, so the relay posture cannot be read right now.</p>;
  }
  if (state.kind === "off") {
    return (
      <div className="text-sm text-ink-soft">
        <p>
          This deploy is <span className="font-medium text-ink">not a relay</span> (no /api/r
          surface is mounted). To piggyback it as a relay, the operator sets two
          Pages-settings vars (both edge-posture keys, never code strings):
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li><span className="font-mono">VANT_RELAY_ENABLED=1</span> - mount the gated /api/r surface</li>
          <li><span className="font-mono">VANT_RELAY_GATE_KEY=&lt;256-bit hex&gt;</span> - the hop gate credential (mint one with <span className="font-mono">vant relay gate</span>)</li>
        </ul>
        <p className="mt-2">
          Without the key the surface serves nothing (fail-closed). Hops are
          encrypted-pipes only; plaintext bodies refuse.
        </p>
      </div>
    );
  }
  const c = state.caps;
  return (
    <div className="text-sm">
      <button
        onClick={read}
        className="mb-2 rounded-md border border-line px-2 py-0.5 text-xs text-ink-soft hover:bg-ink/5"
      >
        re-read posture
      </button>
      <p>
        This deploy <span className="font-medium text-accent">piggybacks as a relay</span> ({c.flavor},
        caps <span className="font-mono">{c.relay}</span>). The toggle lives in
        Pages settings - the browser cannot flip it, so this row is a read, not a control.
      </p>
      <ul className="mt-2 list-disc pl-5 text-ink-soft">
        <li>gated: <span className="text-ink">{String(c.gated)}</span> (the gate IS the route HMAC secret: <span className="font-mono">X-Signature-256</span>)</li>
        <li>gate ready: <span className="text-ink">{String(c.gateReady)}</span>{c.gateReady ? "" : " - no key set: hops refuse until VANT_RELAY_GATE_KEY lands in Pages settings"}</li>
        <li>e2e posture: <span className="font-mono">{c.e2e}</span> - encrypted pipes only, no plaintext hops</li>
        <li>hop events/stream: {c.events}</li>
      </ul>
    </div>
  );
}

/**
 * Module: settings (catalog #4). Theme (both modes, system), the help
 * layer toggle, session controls, and the property-attach notes (3.4).
 * All frame-owned conventions; this module only surfaces them.
 */
export default function Settings() {
  const app = useAppRaw();

  return (
    <div>
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Everything here is frame-level; modules never ship their own
        settings plumbing.
      </p>

      <Section title="Theme">
        <Help text="Light and dark ship from day one (prd-web.md 2.6); tokens are CSS vars so the brand carries across both.">
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => actions.setTheme(t)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  app.theme === t ? "border-accent bg-accent/10 font-medium" : "border-line hover:bg-ink/5"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Help>
      </Section>

      <Section title="Help layer">
        <Help text="Tooltips on confusing controls, inputs, and surfaces. Off removes the ? markers without changing behavior.">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={app.help}
              onChange={(e) => actions.toggleHelp(e.target.checked)}
            />
            show help markers everywhere
          </label>
        </Help>
      </Section>

      <Section title="Use relays (your reach)">
        <RelayUsage />
      </Section>

      <Section title="Run with a relay (web/relay endpoint)">
        <RelayEndpoint />
      </Section>

      <Section title="Run a relay (piggyback)">
        <RelayPosture />
      </Section>

      <Section title="Session & properties">
        <p className="text-sm text-ink-soft">
          Property <span className="font-mono text-ink">{app.property}</span>;
          attach more via the Pages env registry
          (<span className="font-mono">VANT_PROPERTY_&lt;ID&gt;_* in Pages settings, prd-web.md 3.4</span>).
        </p>
        <ConfirmationModal />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">{title}</p>
      {children}
    </div>
  );
}
