import { useEffect, useState } from "react";
import { health, tools, breakers, ApiError } from "../../api";

/**
 * Module: status (catalog #3).probe cards + the edge's per-property
 * breaker view (prd-web.md 3.6). Every failed card says WHY (offline vs
 * refused) - nothing is greenwashed, nothing is decorated.
 */

type CardKind =
  | { s: "checking" }
  | { s: "up"; detail: string }
  | { s: "offline" }
  | { s: "refused"; status?: number; why: string };

function useProbe(_name: string, fn: () => Promise<unknown>): CardKind {
  const [state, setState] = useState<CardKind>({ s: "checking" });
  useEffect(() => {
    let alive = true;
    setState({ s: "checking" });
    const t0 = performance.now();
    fn()
      .then(() => alive && setState({ s: "up", detail: `${Math.round(performance.now() - t0)}ms` }))
      .catch((err: ApiError) => {
        if (!alive) return;
        setState(
          err.kind === "network"
            ? { s: "offline" }
            : { s: "refused", status: err.status, why: err.message },
        );
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function useEdgeBreakers(): CardKind {
  const [state, setState] = useState<CardKind>({ s: "checking" });
  useEffect(() => {
    let alive = true;
    breakers()
      .then((b) => {
        if (!alive) return;
        const entries = Object.entries(b.breakers ?? {});
        if (entries.length === 0) setState({ s: "up", detail: "closed (no flaps recorded)" });
        else if (entries.some(([, v]) => v.state === "open")) {
          setState({ s: "up", detail: "OPEN - bridge cooling down" });
        } else {
          const fails = entries.reduce((n, [, v]) => n + v.fails, 0);
          setState({ s: "up", detail: `closed; ${fails} recent failure${fails === 1 ? "" : "s"}` });
        }
      })
      .catch(() => alive && setState({ s: "offline" }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function Card({ name, kind }: { name: string; kind: CardKind }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <span className="font-medium">{name}</span>
      {kind.s === "checking" ? (
        <span className="text-xs text-ink-soft">probing...</span>
      ) : kind.s === "up" ? (
        <span className="rounded-full border border-moss/40 bg-moss/10 px-2 py-0.5 text-xs text-moss">
          up - {kind.detail}
        </span>
      ) : kind.s === "offline" ? (
        <span className="rounded-full border border-err/40 bg-err/10 px-2 py-0.5 text-xs text-err">
          not reachable - functions not deployed or pod down
        </span>
      ) : (
        <span className="rounded-full border border-err/40 bg-err/10 px-2 py-0.5 text-xs text-err">
          refused{kind.status ? ` (${kind.status})` : ""} - {kind.why}
        </span>
      )}
    </div>
  );
}

export default function Status() {
  const healthProbe = useProbe("pod health (/api/health)", health);
  const toolsProbe = useProbe("door tools (/api/mcp/tools)", tools);
  const edgeProbe = useEdgeBreakers();

  return (
    <div>
      <h1 className="text-lg font-semibold">Status</h1>
      <p className="mt-1 text-sm text-ink-soft">
        The frontend, its edge bridge, and the attached property's pod.
        A card that is not green says exactly what is missing - the page
        never fakes a healthy endpoint.
      </p>
      <div className="mt-6 space-y-2">
        <Card
          name="this frontend"
          kind={{ s: "up", detail: "static page rendering" }}
        />
        <Card name="edge bridge (this deployment)" kind={edgeProbe} />
        <Card name="pod health" kind={healthProbe} />
        <Card name="door tools" kind={toolsProbe} />
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        A red card means that surface is down or refusing - cards show real
        probe results only.
      </p>
    </div>
  );
}
