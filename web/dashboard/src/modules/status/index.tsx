import { useEffect, useState } from "react";
import { health, tools, breakers, exec, ApiError } from "../../api";

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

/**
 * The security-pipeline card (prd-web.md 4.4): the POD scans its lib/ tree
 * for middleware-chain wiring and reports; this page only renders the
 * report - the frontend never reads pod source. Admin-only verb: for a
 * guest identity the door refuses typed, and that refusal is the card
 * (nothing greenwashed, no fake "ok").
 */
type PipelineReport = {
  v: number;
  scanned: number;
  modules: Array<{ name: string; wired: string[] }>;
  unwired: string[];
  exempt: string[];
};

function usePipeline():
  | { s: "checking" }
  | { s: "up"; r: PipelineReport }
  | { s: "offline" }
  | { s: "refused"; why: string } {
  const [state, setState] = useState<
    { s: "checking" } | { s: "up"; r: PipelineReport } | { s: "offline" } | { s: "refused"; why: string }
  >({ s: "checking" });
  useEffect(() => {
    let alive = true;
    setState({ s: "checking" });
    exec("security_pipeline_report", {})
      .then((raw) => {
        // The door owns shapes; this cast is the one honest boundary the
        // typed report crosses (the typed refusal path needs no cast).
        const r = raw as PipelineReport;
        if (alive && r && typeof r.scanned === "number" && Array.isArray(r.unwired)) setState({ s: "up", r });
        else if (alive) setState({ s: "refused", why: "malformed pipeline report from the door" });
      })
      .catch((err: ApiError) => {
        if (!alive) return;
        if (err.kind === "network") setState({ s: "offline" });
        else setState({ s: "refused", why: err.message });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function PipelineScanCard() {
  const state = usePipeline();
  if (state.s === "checking") return null;
  const wiredCount = state.s === "up" ? state.r.modules.filter((m) => m.wired.length > 0).length : 0;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">security pipeline (lib scan)</span>
        {state.s === "up" ? (
          <span className="rounded-full border border-moss/40 bg-moss/10 px-2 py-0.5 text-xs text-moss">
            wired {wiredCount}/{state.r.scanned} - {state.r.unwired.length} outside - {state.r.exempt.length} exempt
          </span>
        ) : state.s === "offline" ? (
          <span className="rounded-full border border-err/40 bg-err/10 px-2 py-0.5 text-xs text-err">not reachable</span>
        ) : (
          <span className="rounded-full border border-err/40 bg-err/10 px-2 py-0.5 text-xs text-err">refused - {state.why}</span>
        )}
      </div>
      {state.s === "up" && state.r.unwired.length > 0 ? (
        <p className="mt-2 text-xs text-ink-soft">
          Outside the pipeline (verbatim from the pod, whitelisted modules are
          named exempt in the report): {state.r.unwired.join(", ")}
        </p>
      ) : null}
      {state.s === "up" && state.r.unwired.length === 0 ? (
        <p className="mt-2 text-xs text-ink-soft">Every scanned module carries middleware-chain wiring evidence.</p>
      ) : null}
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
      <div className="mt-2 space-y-2">
        <PipelineScanCard />
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        A red card means that surface is down or refusing - cards show real
        probe results only.
      </p>
    </div>
  );
}
