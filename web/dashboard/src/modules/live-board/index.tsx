import { useEffect, useMemo, useState } from "react";
import { tools, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { Spinner, EmptyState } from "../../frame/ui";
import { Help } from "../../frame/Tooltip";
import { MODULES } from "../../frame/registry";
import { useEvents } from "../../frame/events";
import { useApp } from "../../state";

/**
 * Module: live-board (catalog #1). Renders off the frame's ONE SSE
 * fanout - it never opens its own EventSource (prd-web.md 3.3 resp. 3).
 * Dead-board state is HONEST (6): it says which surface is missing.
 */
const manifest = MODULES.find((m) => m.id === "live-board")!;

export default function LiveBoard() {
  const fan = useEvents();
  const property = useApp((s) => s.property);
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const [bridge, setBridge] = useState<
    { kind: "loading" } | { kind: "ok"; count: number } | { kind: "down"; err: ApiError }
  >({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    setBridge({ kind: "loading" });
    if (!token) {
      return () => {
        alive = false;
      };
    }
    tools()
      .then((t) => {
        if (alive) setBridge({ kind: "ok", count: t.tools?.length ?? 0 });
      })
      .catch((e: ApiError) => {
        if (alive) setBridge({ kind: "down", err: e });
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const visible = useMemo(() => {
    const wanted = new Set<string>(manifest.families);
    return fan.ring.filter((e) => wanted.has(e.family)).slice(-25).reverse();
  }, [fan.ring]);

  const statusChip =
    fan.status === "live"
      ? { cls: "border-moss/40 bg-moss/10 text-moss", txt: "board live" }
      : fan.status === "connecting"
        ? { cls: "border-accent/40 bg-accent/10 text-accent", txt: "connecting" }
        : fan.status === "down"
          ? { cls: "border-err/40 bg-err/10 text-err", txt: "stream down" }
          : { cls: "border-line text-ink-soft", txt: "idle" };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Live board</h1>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusChip.cls}`}>
          {fan.status === "connecting" ? <Spinner size={10} /> : null} {statusChip.txt}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        The pod's event families, streamed through the ONE frame-owned
        connection for property <span className="font-mono">{property}</span>.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {manifest.families.map((f) => (
          <Help key={f} text={`Events on this stream build the ${f} view.`}>
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-soft">
              {f}
            </span>
          </Help>
        ))}
      </div>

      <div className="mt-6">
        {bridge.kind === "down" ? (
          <>
            <Refusal error={bridge.err} onRetry={() => setBridge({ kind: "loading" })} detail="Bridge probe below the board stays authoritative for exec paths." />
          </>
        ) : null}
        {fan.status === "live" && visible.length === 0 ? (
          <EmptyState
            title="Connected, no events yet"
            detail={
              <p className="mt-1 text-ink-soft">
                The stream is up ({bridge.kind === "ok" ? `${bridge.count} tools behind it` : "bridge reachable"}).
                Families arrive as the pods do things.
              </p>
            }
          />
        ) : null}
        {fan.status !== "live" && bridge.kind !== "down" ? (
          <EmptyState
            title={fan.status === "down" ? "Stream down" : fan.status === "connecting" ? "Connecting" : "Not connected"}
            detail={
              <p className="mt-1 text-ink-soft">
                {fan.status === "down"
                  ? "The events stream could not be established. The breaker view (status module) shows whether the bridge itself is cooling down."
                  : fan.status === "connecting"
                    ? "Establishing the stream..."
                    : "Paste a valid token; the board connects once the bridge is reachable."}
              </p>
            }
          />
        ) : null}
        {visible.length > 0 ? (
          <ul className="space-y-1.5">
            {visible.map((e, i) => (
              <li
                key={`${e.at}-${i}`}
                className="flex items-baseline gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-xs"
              >
                <span className="font-mono text-accent">{e.family}</span>
                <span className="min-w-0 flex-1 truncate text-ink-soft">
                  {summarize(e.raw)}
                </span>
                <span className="font-mono text-[10px] text-ink-soft">
                  {new Date(e.at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function summarize(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const agent = typeof r.agentId === "string" ? r.agentId : undefined;
    const text = typeof r.text === "string" ? r.text : undefined;
    const parts = [agent, text].filter(Boolean);
    if (parts.length > 0) return parts.join(": ");
    return Object.keys(r).slice(0, 3).join(" / ") || "event";
  }
  return String(raw ?? "event");
}
