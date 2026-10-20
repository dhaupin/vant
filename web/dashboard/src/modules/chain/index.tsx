import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  E2E_LAW,
  bridgeLost,
  type BridgeReply,
  properties,
  relayCaps,
  type RelayCaps,
} from "../../api";
import { useApp } from "../../state";
import { Refusal } from "../../frame/Refusal";

/**
 * Module: chain (#20, prd-carrier-share.md 3.2 P5b, from prd-relay.md 3.3
 * + 6.1). The chain is the WRITE-READ split: the editor lives in Settings
 * ("Use relays" / "Run with a relay" — the two-sided contract 6.1); this
 * module is the READ. A probe rides the door (the relay.lost beacon
 * through the real intake); the only UI-side fetches are the
 * contract-defined PUBLIC caps routes — nothing else is ever probed
 * browser-side (prd-relay.md 3.1's probe seam, one-way boundary).
 */

/** The honest core-rung line, stated once — never a greenwashed badge. */
export const CORE_RUNG =
  "core rung — the hop pipe is ciphertext-only (r/2 " + E2E_LAW + " caps, " +
  "stated verbatim); the pairing-time e2e channel (relay-blind body, " +
  "prd-relay.md 5) lands at the P6b rung. Nothing routes through this " +
  "hop until then.";

export type CapsState =
  | { s: "stub" }
  | { s: "unreachable" }
  | { s: "off" } // 404: not a relay — a record, not a crash
  | { s: "on"; caps: RelayCaps };

/** The public caps read of a relay origin (state-machine, not a dead promise). */
export function HopRow({
  label,
  note,
  state,
  active,
}: {
  label: string;
  note?: string;
  state: CapsState;
  active?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono">{label}</span>
        {active ? (
          <span className="rounded border border-accent bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            ACTIVE hop
          </span>
        ) : (
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-soft">
            not routed yet
          </span>
        )}
      </div>
      {state.s === "stub" ? <p className="mt-1 text-xs text-ink-soft">reading caps…</p> : null}
      {state.s === "unreachable" ? (
        <p className="mt-1 text-xs text-err">the origin answered nothing — down, or the URL is wrong.</p>
      ) : null}
      {state.s === "off" ? (
        <p className="mt-1 text-xs text-ink-soft">
          honest record: not a relay (no /api/r surface is mounted) — the chain does not include it.
        </p>
      ) : null}
      {state.s === "on" ? (
        <p className="mt-1 text-xs text-ink-soft">
          caps <span className="font-mono text-ink">{state.caps.relay}</span> ·{" "}
          {state.caps.flavor} · {state.caps.e2e} · gate ready{" "}
          <span className="text-ink">{String(state.caps.gateReady ?? "?")}</span>
          {state.caps.gateReady ? "" : " — hops refuse until the gate key lands"}
        </p>
      ) : null}
      {note ? <p className="mt-1 text-[11px] text-ink-soft">{note}</p> : null}
      {state.s === "on" ? (
        <p className="mt-1 text-[11px] text-ink-soft">{CORE_RUNG}</p>
      ) : null}
    </div>
  );
}

/**
 * DOOR-PROBE. A probe rides the door: the relay.lost beacon through the
 * REAL intake (server-side HMAC, the pod door behind it). The verdict
 * card renders the ack verbatim — ok answers, typed E_* refusals, and
 * transport refusals are all honest records, none decorated.
 */
export function ProbeCard() {
  const [reply, setReply] = useState<BridgeReply | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [stub, setStub] = useState(false);

  const probe = useCallback(() => {
    setStub(true);
    setWhy(null);
    setReply(null);
    bridgeLost()
      .then((r: BridgeReply) => setReply(r))
      .catch((e: ApiError) => setWhy(e.message))
      .finally(() => setStub(false));
  }, []);

  return (
    <div className="rounded-lg border border-line bg-surface p-3 text-sm">
      <button
        onClick={probe}
        disabled={stub}
        className="rounded border border-line px-2 py-0.5 text-xs hover:bg-ink/5 disabled:opacity-40"
      >
        probe the chain head (relay.lost rides the door)
      </button>
      {stub ? <p className="mt-1 text-xs text-ink-soft">through the intake…</p> : null}
      {why ? <Refusal error={{ message: why }} /> : null}
      {reply ? (
        <div className="mt-2">
          {reply.ok ? (
            <p className="text-xs">
              ok:true — door answered through the bridge (family{" "}
              <span className="font-mono">{reply.family ?? "n/a"}</span>
              {reply.ms !== undefined ? `, ${reply.ms}ms` : ""})
            </p>
          ) : (
            <Refusal
              error={{
                message: reply.code
                  ? `${reply.code}: ${reply.error ?? "refused"}`
                  : (reply.error ?? "door: refused"),
              }}
            />
          )}
          <pre className="mt-2 overflow-x-auto rounded border border-line bg-ink/5 p-2 text-[11px]">
            {JSON.stringify(reply, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export default function Chain() {
  const usage = useApp((s) => s.relayUsage);
  const endpoint = useApp((s) => s.relayEndpoint);
  const [self, setSelf] = useState<CapsState>({ s: "stub" });
  const [peer, setPeer] = useState<CapsState>({ s: "stub" });
  const [propCount, setPropCount] = useState<number | null>(null);

  const readSelf = useCallback(() => {
    setSelf({ s: "stub" });
    relayCaps(window.location.origin)
      .then((caps) => setSelf({ s: "on", caps }))
      .catch((e: ApiError) =>
        setSelf(e.status === 404 ? { s: "off" } : e.kind === "network" ? { s: "unreachable" } : { s: "off" }),
      );
  }, []);

  const readPeer = useCallback(() => {
    if (!endpoint) {
      setPeer({ s: "off" });
      return;
    }
    setPeer({ s: "stub" });
    relayCaps(endpoint)
      .then((caps) => setPeer({ s: "on", caps }))
      .catch((e: ApiError) =>
        setPeer(e.status === 404 ? { s: "off" } : e.kind === "network" ? { s: "unreachable" } : { s: "off" }),
      );
  }, [endpoint]);

  useEffect(() => {
    readSelf();
    readPeer();
    properties()
      .then((p) => setPropCount((p.properties ?? []).length))
      .catch(() => setPropCount(null));
  }, [readSelf, readPeer]);

  return (
    <div>
      <h1 className="text-lg font-semibold">Chain</h1>
      <p className="mt-1 text-sm text-ink-soft">
        The ordered hop list per property (prd-relay.md 3.3): the ACTIVE hop
        named, every hop honestly badged from its own caps read. This page is
        the READ — the editor stays in Settings, the probe rides the door, and
        nothing fake-routes.
      </p>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Reach (your choice — read here, edited in Settings)</h2>
        <p className="mt-2 text-sm">
          usage: <span className="text-ink">{usage ? "reach this pod through relay hops" : "direct (Mode A/B)"}</span>
        </p>
        <p className="mt-1 text-sm">
          chain endpoint:{" "}
          {endpoint ? (
            <span className="font-mono text-ink">{endpoint}</span>
          ) : (
            <span className="text-ink-soft">none — the chain is the direct pod bridge alone</span>
          )}
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          Today's truth: usage ON adds INTENT ONLY (prd-relay.md 6.1). Traffic
          stays direct until the chain editor + pairing-time e2e rungs make it
          live; this card never pretends otherwise.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">
          The chain (per-property hop list{propCount !== null ? ` — ${propCount} attached propert${propCount === 1 ? "y" : "ies"}` : ""})
        </h2>
        <div className="mt-2 space-y-2">
          {endpoint ? (
            <HopRow
              label="your /web/relay hop"
              note={CORE_RUNG}
              state={peer}
            />
          ) : null}
          <HopRow
            label="pod bridge (direct Mode A/B)"
            note="the dead-last local fallback (prd-relay.md 3.1) — ACTIVE today: traffic is direct; it becomes the fallback rung when hops route."
            state={{ s: "on", caps: { relay: "r/2", flavor: "direct pod bridge", e2e: E2E_LAW } }}
            active
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">This deploy as a relay (serving side, for someone else's chain)</h2>
        <div className="mt-2 space-y-2">
          <HopRow label="this deploy's /api/r surface" state={self} />
        </div>
        <button
          onClick={readSelf}
          className="mt-2 rounded border border-line px-2 py-0.5 text-xs text-ink-soft hover:bg-ink/5"
        >
          re-read posture
        </button>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Probe verdict</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          A probe rides the DOOR (the relay.lost beacon through the real
          intake). The only browser-side fetches in this module are the public
          caps routes above — nothing else is ever probed client-side.
        </p>
        <div className="mt-2">
          <ProbeCard />
        </div>
      </section>
    </div>
  );
}
