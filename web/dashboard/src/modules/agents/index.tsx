import { useEffect, useState } from "react";
import { exec, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { PanelSkeleton } from "../../frame/ui";

/**
 * Module: agents (catalog #2). P1 scaffold: one honest probe of the
 * roster surface through the single client; roster cards render from
 * whatever the pod returns once the bridge is live. No client-side
 * gating - the door's filtering IS the view (prd-web.md 6).
 */
type Probe =
  | { kind: "loading" }
  | { kind: "ok"; items: Array<{ agentId: string; name?: string; role?: string; state?: string }> }
  | { kind: "down"; err: ApiError };

function extractRoster(result: unknown): Array<{ agentId: string; name?: string; role?: string; state?: string }> {
  // The door owns shapes; we render a conservative projection and never
  // guess keys beyond the documented agent record.
  if (!result || typeof result !== "object") return [];
  const arr = (result as { agents?: unknown[] }).agents ?? (Array.isArray(result) ? result : []);
  return arr
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      agentId: String(r.id ?? r.agentId ?? ""),
      name: typeof r.name === "string" ? r.name : undefined,
      role: typeof r.role === "string" ? r.role : undefined,
      state: typeof r.state === "string" ? r.state : undefined,
    }))
    .filter((r) => r.agentId);
}

export default function Agents() {
  const [probe, setProbe] = useState<Probe>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setProbe({ kind: "loading" });
    exec("agent_list")
      .then((r) => {
        if (!alive) return;
        setProbe({ kind: "ok", items: extractRoster(r) });
      })
      .catch((err: ApiError) => {
        if (alive) setProbe({ kind: "down", err });
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Agents</h1>
        <button
          onClick={() => setAttempt((a) => a + 1)}
          className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5"
        >
          Re-probe
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        The roster, filtered by the door before it ever reaches here.
      </p>

      <div className="mt-6">
        {probe.kind === "loading" ? (
          <PanelSkeleton rows={3} />
        ) : probe.kind === "down" ? (
          <Refusal error={probe.err} onRetry={() => setAttempt((a) => a + 1)} />
        ) : probe.items.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-soft">
            An honest empty roster: the door returned nothing for this
            identity (or the install simply has no crew yet).
          </div>
        ) : (
          <ul className="space-y-2">
            {probe.items.map((a) => (
              <li
                key={a.agentId}
                className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              >
                <span className="font-medium">{a.name ?? a.agentId}</span>
                <span className="flex gap-2 text-xs text-ink-soft">
                  {a.role ? <span className="rounded border border-line px-1.5">{a.role}</span> : null}
                  {a.state ? <span className="rounded border border-line px-1.5">{a.state}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
