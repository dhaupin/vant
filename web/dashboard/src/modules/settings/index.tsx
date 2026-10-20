import { useEffect, useState } from "react";
import { actions, useApp, useAppRaw } from "../../state";
import { Help } from "../../frame/Tooltip";
import { ConfirmationModal } from "./confirm";
import { relayCaps, E2E_LAW, ApiError, type RelayCaps as ApiRelayCaps } from "../../api";
import { exportProfile, importProfile, PROFILE_FILENAME } from "../../lib/profile";

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
 *  persisted, theirs alone. LIVE since the P6b rung: with an e2e key
 *  bound (the /pairing redeem's one-time delivery) door calls ride the
 *  SEALED lane; without one, ON names intent and traffic stays on the
 *  direct pod bridge (stated plainly, never fake-routed). */
function RelayUsage() {
  const on = useApp((s) => s.relayUsage);
  const boundKey = useApp((s) => s.channelKeys[s.property] ?? null);
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
          reach this pod <span className="font-medium text-ink">through the chain</span> when
          available (off = direct Mode A/B)
        </span>
      </label>
      <p className="mt-2 text-ink-soft">
        {on
          ? "Saved to your profile. LIVE lane: " +
            (boundKey
              ? "an e2e key is bound — door calls seal to the pod's channel key and ride the edge's relay.ride family; any sealed-lane refusal fails over to the direct pod bridge, recorded in /chain's route record."
              : "no e2e key bound yet — bind once at /pairing (the redeem's one-time reply) and door calls will ride SEALED; without it traffic stays on the direct pod bridge, honestly.")
          : "Direct reach (Mode A/B). Turn on when you want your door calls to ride the sealed e2e lane instead."}
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
        Today's truth, stated plainly: the endpoint is verified live
        (caps r/2, envelope-required). Upstream relays carry ciphertext only
        (envelope-required caps); a paired profile's e2e channel binds at
        /pairing and rides through the dashboard edge — this endpoint is a
        hop partner, never a key holder (prd-relay.md §5).
      </p>
    </div>
  );
}

/**
 * (P6b) THE CHAIN EDITOR (prd-relay.md 3.3): the user's ordered hop list,
 * hand-curated by decision. Add = verify the origin's LIVE PUBLIC caps
 * (the one cross-origin fetch the chain contract allows, and only there),
 * badge each hop from its OWN read, remove/reorder freely. Non-sensitive
 * entries only (origins + caps metadata), persisted like the reach prefs.
 */
function ChainEditor() {
  const chain = useApp((s) => s.chain);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "added"; origin: string; flavor: string; e2e: string }
    | { kind: "bad"; why: string }
  >({ kind: "idle" });

  const add = async () => {
    const origin = draft.trim().replace(/\/+$/, "");
    if (!origin) {
      setState({ kind: "bad", why: "Empty origin — nothing to probe." });
      return;
    }
    if (!/^https:\/\//.test(origin)) {
      setState({ kind: "bad", why: "https only — a hop is never plain http in the public posture." });
      return;
    }
    setState({ kind: "checking" });
    try {
      const caps: ApiRelayCaps = await relayCaps(origin);
      actions.addHop({ origin: origin.replace(/\/+$/, ""), flavor: caps.flavor, e2e: caps.e2e ?? E2E_LAW });
      setState({ kind: "added", origin: origin.replace(/\/+$/, ""), flavor: caps.flavor, e2e: caps.e2e ?? E2E_LAW });
      setDraft("");
    } catch (e) {
      const why = e instanceof ApiError ? e.message : "the origin answered nothing";
      setState({ kind: "bad", why });
    }
  };

  return (
    <div className="text-sm">
      <label className="block">
        <span className="text-ink-soft">add a hop (an https origin serving r/2 envelope-required caps):</span>
        <div className="mt-1 flex gap-2">
          <input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
            placeholder="https://relay.example.com"
            className="w-full rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs"
          />
          <button
            onClick={() => void add()}
            disabled={state.kind === "checking" || !draft.trim()}
            className="shrink-0 rounded-md border border-line px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
          >
            {state.kind === "checking" ? "probing…" : "probe & add"}
          </button>
        </div>
      </label>
      <p className="mt-2 text-xs text-ink-soft">
        {state.kind === "added" && (
          <span className="text-moss">
            ✓ added from its own caps read: {state.flavor}, e2e {state.e2e}
            {state.e2e !== E2E_LAW ? " — NOT envelope-required: refused at exec time" : ""}
          </span>
        )}
        {state.kind === "bad" && <span className="text-accent">✗ {state.why}</span>}
        {state.kind === "checking" && <span>Reading the origin's public capabilities…</span>}
        {state.kind === "idle" && <span>Order matters for the riders that hold each hop's gate (CLI/agent lanes). YOUR browser lane rides this deploy's own edge: sealed calls go browser → dashboard edge → pod with the edge relay-blind (§5); the saved hops stay upstream partners — carried ciphertext, never holders of your e2e key.</span>}
      </p>
      <div className="mt-3 space-y-2">
        {chain.length === 0 ? (
          <p className="text-xs text-ink-soft">No hops yet — the chain is the direct pod bridge alone.</p>
        ) : (
          chain.map((hop, i) => (
            <div key={hop.id} className="flex flex-wrap items-center gap-2 rounded border border-line bg-paper px-2 py-1">
              <span className="font-mono text-xs text-ink">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{hop.origin}</span>
              <span className="text-[10px] text-ink-soft">{hop.flavor}</span>
              <span
                className={
                  "rounded border px-1.5 py-0.5 text-[10px] " +
                  (hop.e2e === E2E_LAW
                    ? "border-moss/40 bg-moss/10 text-moss"
                    : "border-err/40 bg-err/5 text-err")
                }
              >
                e2e {hop.e2e}
              </span>
              <button
                onClick={() => actions.moveHop(hop.id, -1)}
                disabled={i === 0}
                className="rounded border border-line px-1.5 py-0.5 text-[10px] hover:bg-ink/5 disabled:opacity-30"
                aria-label="move hop earlier"
              >
                ↑
              </button>
              <button
                onClick={() => actions.moveHop(hop.id, 1)}
                disabled={i === chain.length - 1}
                className="rounded border border-line px-1.5 py-0.5 text-[10px] hover:bg-ink/5 disabled:opacity-30"
                aria-label="move hop later"
              >
                ↓
              </button>
              <button
                onClick={() => actions.removeHop(hop.id)}
                className="rounded border border-err/30 px-1.5 py-0.5 text-[10px] text-err hover:bg-err/5"
              >
                remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * (pass 273, prd-relay.md §2.2) THE SOVEREIGN PROFILE TRANSPORT: the
 * instance profile rides ONE passphrase-sealed file (bolete-profile.enc,
 * the horcrux pattern, web scale) — chain, channel keys, pod guest
 * identities (inside the seal only), reach choice. Export = a download;
 * import = typed-open + merge (never clobbering what this tab holds).
 * No passphrase ever crosses the wire; a wrong one opens to nothing.
 */
function SovereignProfileCard() {
  const app = useAppRaw();
  const [expPass, setExpPass] = useState("");
  const [impPass, setImpPass] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const carrying = Object.keys(app.tokens).filter((p) => app.tokens[p]);

  const doExport = async () => {
    try {
      const assets = {
        chain: app.chain,
        channelKeys: app.channelKeys,
        tokens: app.tokens,
        relayUsage: app.relayUsage,
      };
      const out = await exportProfile(assets, expPass);
      const blob = new Blob([out.text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = out.filename;
      a.click();
      URL.revokeObjectURL(url);
      setNote(`exported ${out.filename} — ${carrying.length} identit${carrying.length === 1 ? "y" : "ies"}, ${Object.keys(app.channelKeys).length} key(s), ${app.chain.length} hop(s). The file opens with THIS passphrase only; nothing plaintext ever left this tab.`);
      setExpPass("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "the export refused");
    }
  };

  const doImport = async (data: string) => {
    try {
      const p = await importProfile(data, impPass);
      let tok = 0, key = 0, hop = 0;
      for (const [prop, tk] of Object.entries(p.tokens)) {
        if (!app.tokens[prop]) { actions.setToken(prop, tk); tok++; }
      }
      for (const [prop, ck] of Object.entries(p.channelKeys)) {
        if (!app.channelKeys[prop]) { actions.bindChannelKey(prop, ck); key++; }
      }
      for (const h of p.chain) {
        if (!app.chain.some((x) => x.origin === h.origin)) { actions.addHop({ origin: h.origin, flavor: h.flavor, e2e: h.e2e }); hop++; }
      }
      if (p.relayUsage && !app.relayUsage) actions.setRelayUsage(true);
      setNote(`imported: ${tok} identit${tok === 1 ? "y" : "ies"} bound, ${key} key(s) bound, ${hop} hop(s) added — held where it already existed, untouched. The profile is yours from here on (§2.2).`);
      setImpPass("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "the import refused");
    }
  };

  return (
    <div className="text-sm">
      <p className="text-xs text-ink-soft">
        carries: {carrying.length || 0} pod identit{carrying.length === 1 ? "y" : "ies"}{" "}
        {carrying.length ? <span className="font-mono text-ink">({carrying.join(", ")})</span> : null}, {" "}
        {Object.keys(app.channelKeys).length} e2e key(s), {app.chain.length} chain hop(s), reach {app.relayUsage ? "on" : "direct"}.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-ink-soft">passphrase (8+)</span>
          <input
            type="password"
            value={expPass}
            onChange={(e) => setExpPass(e.target.value)}
            className="block w-40 rounded-md border border-line bg-surface px-2 py-1 text-xs"
          />
        </label>
        <button
          onClick={() => void doExport()}
          disabled={expPass.length < 8}
          className="rounded-md border border-line px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
        >
          export {PROFILE_FILENAME}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <input
          type="file"
          accept=".enc,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            f.text().then((data) => void doImport(data));
          }}
          className="w-40 text-xs"
        />
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-ink-soft">passphrase</span>
          <input
            type="password"
            value={impPass}
            onChange={(e) => setImpPass(e.target.value)}
            className="block w-40 rounded-md border border-line bg-surface px-2 py-1 text-xs"
          />
        </label>
      </div>
      {note ? <p className="mt-2 text-xs text-ink-soft">{note}</p> : null}
      <DeviceProfileLane onNote={(m) => setNote(m)} />
    </div>
  );
}

/**
 * (pass 274, §2.2 STORAGE RUNG) the DEVICE lane: seal the whole profile
 * into IndexedDB under the NON-EXTRACTABLE device key (possession =
 * unlock; survives tab resets), restore it on any mount (the AuthGate
 * wires the auto-restore; this card surfaces an explicit one + forget),
 * and the WebAuthn PRF attempt (path (b)) which refuses TYPED when the
 * platform cannot serve it — never a fake unlock.
 */
function DeviceProfileLane({ onNote }: { onNote: (m: string) => void }) {
  const device = useApp((s) => s.deviceProfile);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 rounded-md border border-line bg-surface p-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">this device (IndexedDB, non-extractable key)</p>
      <p className="mt-1 text-xs text-ink-soft">
        {device?.sealed ? (
          <span>
            stored: {device.tokens} identit{device.tokens === 1 ? "y" : "ies"}, {device.keys} key(s), {device.hops} hop(s) — sealed to this device's own key (a page can use it, never export it)
          </span>
        ) : (
          <span>nothing stored on this device yet</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await actions.storeDeviceProfile();
              onNote("stored on this device — the profile now survives tab resets (possession is the unlock, §2.2)");
            } catch (e) {
              onNote(e instanceof Error ? e.message : "the device store refused");
            } finally { setBusy(false); }
          }}
          disabled={busy}
          className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
        >
          store on this device
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              const landed = await actions.restoreDeviceProfile();
              onNote(landed ? "restored from this device (bound only empty seats)" : "nothing new to bind — the device copy is already held here");
            } catch (e) {
              onNote(e instanceof Error ? e.message : "the device read refused");
            } finally { setBusy(false); }
          }}
          disabled={busy}
          className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
        >
          restore now
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await actions.forgetDeviceProfile();
              onNote("forgotten: this device's stored copy (and its key) wiped");
            } catch (e) {
              onNote(e instanceof Error ? e.message : "the wipe refused");
            } finally { setBusy(false); }
          }}
          disabled={busy}
          className="rounded border border-err/30 px-2 py-1 text-xs text-err hover:bg-err/5 disabled:opacity-50"
        >
          forget this device
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await actions.bindPrfKey();
              onNote("bound: a PRF-capable passkey now seals this profile — the unlock lane (b) is live (assert it to open)");
            } catch (e) {
              onNote(e instanceof Error ? e.message : "the passkey binding refused");
            } finally { setBusy(false); }
          }}
          disabled={busy}
          className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
        >
          bind a passkey (PRF seal)
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              const landed = await actions.restorePrfProfile();
              onNote(landed
                ? "unlocked with the passkey's PRF (bound only empty seats)"
                : "no PRF binding is stored on this device yet — bind one first");
            } catch (e) {
              onNote(e instanceof Error ? e.message : "the PRF attempt refused");
            } finally { setBusy(false); }
          }}
          disabled={busy}
          className="rounded border border-line px-2 py-1 text-xs text-ink-soft hover:bg-ink/5 disabled:opacity-50"
        >
          try passkey unlock (PRF)
        </button>
      </div>
      <p className="mt-1 text-[10px] text-ink-soft">
        unlock lanes: (a) the passphrase file (export above), (b) passkey PRF
        (bind here, then assert — the KEK derives from the passkey's PRF
        output deterministically; nothing unlockable lives without the
        authenticator's key material).
      </p>
    </div>
  );
}

/**
 * (P6b, pass 272) THE E2E KEY CARD: the sovereign profile's honest key
 * manager. The raw key NEVER re-displays (the binding moment showed it
 * once); the card states its hold, unbinds explicitly (profile + tab
 * copy, gone at sign-out too), and points re-bind at /pairing — the only
 * surface that ever delivers the key again is a fresh voucher redeem
 * against the CURRENT pod posture. Rotation is operator-side; unbinding
 * here never rotates the pod's channel key (stated, not implied).
 */
function E2eKeyCard() {
  const property = useApp((s) => s.property);
  const bound = useApp((s) => s.channelKeys[s.property] ?? null);
  const [confirming, setConfirming] = useState(false);
  if (!bound) {
    return (
      <p className="text-sm text-ink-soft">
        No e2e channel key is bound to this property yet — bind once at{" "}
        <a href="/pairing" className="font-mono text-accent underline">
          /pairing
        </a>{" "}
        (the redeem reply carries it exactly once). Until then door calls ride the direct pod bridge, honestly.
      </p>
    );
  }
  return (
    <div className="text-sm">
      <p>
        bound: <span className="font-mono text-ink">{bound.slice(0, 4)}…{bound.slice(-2)}</span>{" "}
        <span className="text-ink-soft">({bound.length} chars, held in this tab only — never re-displayed, never handed out by any door or caps surface)</span>
      </p>
      <p className="mt-2 text-xs text-ink-soft">
        unbind clears this profile's copy (memory + the tab's sessionStorage).
        It does <span className="font-medium text-ink">not</span> rotate the pod's
        channel key — rotation stays operator-side. To re-bind, redeem a fresh
        voucher at <span className="font-mono">/pairing</span>: the redeem is
        the binding moment and delivers the pod's CURRENT key again.
      </p>
      <div className="mt-2 flex gap-2">
        {confirming ? (
          <>
            <button
              onClick={() => { actions.unbindChannelKey(property); setConfirming(false); }}
              className="rounded border border-err/50 bg-err/10 px-2 py-1 text-xs text-err hover:bg-err/20"
            >
              unbind for real
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5"
            >
              keep it
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="rounded border border-line px-2 py-1 text-xs text-ink-soft hover:bg-ink/5"
          >
            unbind this key
          </button>
        )}
      </div>
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

      <Section title="e2e channel key (this profile)">
        <Help text="prd-relay.md §5: the pairing-time key binding. The key was shown exactly once at the redeem; this card never re-shows it.">
          <E2eKeyCard />
        </Help>
      </Section>

      <Section title="Sovereign profile (export / import)">
        <Help text="prd-relay.md §2.2: the whole profile rides one passphrase-sealed file. The passphrase is never sent anywhere; a wrong one refuses typed.">
          <SovereignProfileCard />
        </Help>
      </Section>

      <Section title="The chain (your hops, in order)">
        <Help text="prd-relay.md 3.3: chains are hand-curated. Every hop lands only after its own live caps read verifies; the e2e badge comes from that same read.">
          <ChainEditor />
        </Help>
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
