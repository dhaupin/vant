import { useEffect, useState } from "react";
import { tools, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { Spinner, EmptyState } from "../../frame/ui";
import { Help } from "../../frame/Tooltip";
import { MODULES } from "../../frame/registry";

/**
 * Module: live-board (catalog #1). P1 MVP of the module: it renders the
 * family legend and probes the bridge; the full SSE fanout renders the
 * moment the Worker functions are deployed (prd-web.md 3.1 contract).
 * The board's dead state is HONEST (6): it says what is missing.
 */
export default function LiveBoard() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ok"; count: number } | { kind: "down"; err: ApiError }
  >({ kind: "loading" });
  const [probe, setProbe] = useState(0);
  const manifest = MODULES.find((m) => m.id === "live-board")!;

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    tools()
      .then((t) => {
        if (alive) setState({ kind: "ok", count: t.tools?.length ?? 0 });
      })
      .catch((e: ApiError) => {
        if (alive) setState({ kind: "down", err: e });
      });
    return () => {
      alive = false;
    };
  }, [probe]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Live board</h1>
        <button
          onClick={() => setProbe((p) => p + 1)}
          className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5"
        >
          Re-probe
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        The pod's event families, streamed live through the bridge.
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
        {state.kind === "loading" ? (
          <div className="flex gap-2 text-sm text-ink-soft">
            <Spinner label="probing bridge" /> probing the bridge...
          </div>
        ) : state.kind === "ok" ? (
          <EmptyState
            title="Bridge reachable"
            detail={
              <p className="mt-1 text-ink-soft">
                {state.count} tools registered behind it. The SSE fanout
                for these families lands with the deployed functions
                (worker contract, prd-web.md 3.1) - until then this board
                is honest skeleton, not fake data.
              </p>
            }
          />
        ) : (
          <Refusal error={state.err} onRetry={() => setProbe((p) => p + 1)} />
        )}
      </div>
    </div>
  );
}
