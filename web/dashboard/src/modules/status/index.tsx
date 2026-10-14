import { useEffect, useState } from "react";
import { health, tools, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";

/**
 * Module: status (catalog #3). Healths of this frontend's surfaces and
 * the attached property's pod bridge - the cards the PRD's status module
 * promises (prd-web.md 4 #3, 10). Per-pod / node healths grow here as
 * properties attach.
 */
type ProbeState =
  | { name: string; kind: "loading" }
  | { name: string; kind: "up"; ms: number }
  | { name: string; kind: "down"; err: ApiError };

function useProbe(name: string, fn: () => Promise<unknown>): ProbeState {
  const [state, setState] = useState<ProbeState>({ name, kind: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ name, kind: "loading" });
    const t0 = performance.now();
    fn()
      .then(() => alive && setState({ name, kind: "up", ms: Math.round(performance.now() - t0) }))
      .catch((err: ApiError) => alive && setState({ name, kind: "down", err }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function Chip({ s }: { s: ProbeState }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <span className="font-medium">{s.name}</span>
      {s.kind === "loading" ? (
        <span className="text-ink-soft">probing...</span>
      ) : s.kind === "up" ? (
        <span className="rounded-full border border-moss/40 bg-moss/10 px-2 py-0.5 text-xs text-moss">
          up - {s.ms}ms
        </span>
      ) : (
        <span className="rounded-full border border-err/40 bg-err/10 px-2 py-0.5 text-xs text-err">
          {s.err.kind === "network" ? "offline" : `refused (${s.err.status ?? "?"})`}
        </span>
      )}
    </div>
  );
}

export default function Status() {
  const healthProbe = useProbe("pod health (/api/health)", health);
  const toolsProbe = useProbe("door tools (/api/mcp/tools)", tools);

  return (
    <div>
      <h1 className="text-lg font-semibold">Status</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Healths for this deploy and the attached property. The breaker
        model: repeated failures open it (prd-web.md 3.6); this page is
        where that becomes visible.
      </p>
      <div className="mt-6 space-y-2">
        <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <span className="font-medium">Frontend build</span>
          <span className="rounded-full border border-moss/40 bg-moss/10 px-2 py-0.5 text-xs text-moss">
            static page rendering
          </span>
        </div>
        <Chip s={healthProbe} />
        <Chip s={toolsProbe} />
        {healthProbe.kind === "down" ? (
          <Refusal error={healthProbe.err} />
        ) : null}
      </div>
    </div>
  );
}
