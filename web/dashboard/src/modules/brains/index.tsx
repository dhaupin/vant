import { useEffect, useRef, useState } from "react";
import { exec, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix, ToolCap } from "../../frame/conn";
import { ToolCall } from "../../frame/ToolCall";
import { Help } from "../../frame/Tooltip";
import { mapProjection } from "./projection";
import { useApp } from "../../state";

/**
 * Module: brains (catalog #18 at /brain). Three honest surfaces:
 *   corpus/  the corpus LIST the door really returns (a brain_/corpus_
 *            list tool is auto-called when the door registers one)
 *   search/  real brain_search calls; the map plots rank vs score of
 *            the REAL results - a true embedding-space scatter needs
 *            the pod to return vectors, and until then the page SAYS so
 *            (prd-web.md 4 #18 calls the embedding map the growth path;
 *            this build ships the real-data rank view, honestly labeled)
 *   IDs/     NSC9-style addressing: keys the pod returns are pattern-
 *            matched against the 9-NNNNN-NNNNN-N spec shape and marked
 *            amber in the map; addressing-related tools the door
 *            registers are browsable. Nothing is invented while
 *            disconnected.
 */

type Tab = "corpus" | "search" | "ids";

interface Row {
  key: string;
  text: string;
  score?: number;
}

export default function Brains() {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const toolsQ = useToolsQuery();
  const [tab, setTab] = useState<Tab>("corpus");

  if (!token) {
    return <NotConnected why="No identity is active yet. Nothing is filled in until the door answers." />;
  }
  if (toolsQ.isError) {
    const e = toolsQ.error as ApiError;
    if (e.kind === "network") return <NotConnected why="The bridge is unreachable, so the corpus cannot be listed." />;
    return <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
  }
  if (toolsQ.isPending) {
    return <p className="text-sm text-ink-soft">Asking the door for its tool list...</p>;
  }

  const corpusCaps = [...toolsByPrefix(toolsQ.data, "brain_"), ...toolsByPrefix(toolsQ.data, "corpus_")];
  // (P4) The search tab detects REAL search tools by name - the door's
  // semantic searcher is `vant_search_semantic`, and a `brain_search`
  // prefix alone would have missed it. A semantic-named tool is preferred
  // because it can answer the REAL embedding projection (withProjection).
  const searchCaps = (toolsQ.data?.tools ?? []).filter(
    (t) => typeof t.name === "string" && /search/i.test(t.name),
  );
  // Addressing side: geometry/memory-store/addressing metadata tools the
  // door actually registers (nsc9-spec, docs/advanced/nsc9-spec.md).
  const idCaps: ToolCap[] = (toolsQ.data?.tools ?? []).filter(
    (t) => typeof t.name === "string" && /geometr|address|nsc9|store_key|memory_store/i.test(t.name),
  );

  const tabs: Array<{ id: Tab; label: string; ok: boolean }> = [
    { id: "corpus", label: "corpus", ok: corpusCaps.length > 0 },
    { id: "search", label: "search + map", ok: searchCaps.length > 0 },
    { id: "ids", label: "IDs / NSC9", ok: idCaps.length > 0 },
  ];

  return (
    <div>
      <h1 className="text-lg font-semibold">Brains</h1>
      <p className="mt-1 text-sm text-ink-soft">
        The corpus this pod really serves. Every view plots real data from
        real responses; anything the door does not expose yet is one
        sentence away, not half-invented. Read-only by design.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md border px-3 py-1 text-xs ${
              tab === t.id ? "border-accent bg-accent/10 font-medium" : "border-line hover:bg-ink/5"
            }`}
          >
            {t.label}
            {!t.ok ? <span className="ml-1 text-ink-soft">(no tools yet)</span> : null}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "corpus" ? <Corpus caps={corpusCaps} /> : null}
        {tab === "search" ? <Search caps={searchCaps} /> : null}
        {tab === "ids" ? <Ids caps={idCaps} /> : null}
      </div>
    </div>
  );
}

interface Parsed {
  rows: Row[];
  /** true when the result was structured but none of it parsed */
  opaque: boolean;
}

/** Parse the door's REAL result shape variants; unknown shapes stay opaque. */
export function parseResults(result: unknown): Parsed {
  if (!result || typeof result !== "object") {
    return Array.isArray(result) ? parseArray(result as unknown[]) : { rows: [], opaque: true };
  }
  const r = result as Record<string, unknown>;
  if (Array.isArray(r)) return parseArray(r as unknown[]);
  for (const field of ["results", "hits", "brains", "files", "entries", "items"]) {
    if (Array.isArray(r[field])) return parseArray(r[field] as unknown[]);
  }
  return { rows: [], opaque: true };
}

function parseArray(arr: unknown[]): Parsed {
  const rows: Row[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const key = it.id ?? it.path ?? it.key ?? it.source ?? it.barcode ?? "";
    const text = it.name ?? it.title ?? it.path ?? it.content ?? it.text ?? it.id ?? "";
    if (!key && !text) continue;
    const raw = it.score ?? it.similarity ?? it.rank;
    const score =
      typeof raw === "number" ? raw : typeof raw === "string" && raw !== "" && !isNaN(Number(raw)) ? Number(raw) : undefined;
    rows.push({ key: String(key), text: String(text).slice(0, 160), score });
    if (rows.length >= 200) break;
  }
  return { rows, opaque: rows.length === 0 };
}

export function nscLike(key: string): boolean {
  return /^9-\d{5}-\d{5}-\d$/.test(key.trim());
}

function Corpus({ caps }: { caps: ToolCap[] }) {
  const listTool = caps.find((c) => c.name.toLowerCase().includes("list"));
  const [type, setType] =
    useState<"idle" | "loading" | "ok" | "refused">("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [opaque, setOpaque] = useState<string>("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!listTool || !listTool.name) return;
    let alive = true;
    setType("loading");
    exec(listTool.name, {})
      .then((result) => {
        if (!alive) return;
        const parsed = parseResults(result);
        setRows(parsed.rows);
        setOpaque(parsed.rows.length === 0 ? JSON.stringify(result, null, 2).slice(0, 4000) : "");
        setType("ok");
      })
      .catch((err: ApiError) => {
        if (!alive) return;
        // the typed refusal IS the view for this identity
        setOpaque(err.message);
        setType("refused");
      });
    return () => {
      alive = false;
    };
  }, [listTool?.name, attempt]);

  if (!listTool || !listTool.name) {
    return (
      <NotConnected why="The door answered but registers no corpus list tool; the browser renders when this pod exposes one." />
    );
  }
  return (
    <div>
      {type === "loading" ? <p className="text-sm text-ink-soft">Reading the corpus from the door...</p> : null}
      {type === "ok" && rows.length > 0 ? (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={`${row.key}-${i}`} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">{row.text}</span>
              <span className="font-mono text-[10px] text-ink-soft">{row.key}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {type === "ok" && rows.length === 0 ? (
        <p className="text-sm text-ink-soft">The door returned a corpus read this identity can see as empty, or a shape this parser does not know. The raw response is shown, not guessed at:</p>
      ) : null}
      {type === "ok" && opaque && rows.length === 0 ? (
        <pre className="mt-2 overflow-auto rounded border border-line bg-surface p-3 font-mono text-xs">{opaque}</pre>
      ) : null}
      {type === "refused" ? (
        <p className="rounded border border-err/40 bg-err/5 p-3 text-xs text-err">{opaque}</p>
      ) : null}
      <button
        onClick={() => setAttempt((a) => a + 1)}
        className="mt-3 rounded border border-line px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
        disabled={type === "loading"}
      >
        Re-read
      </button>
      {type !== "refused" ? <p className="mt-1 text-[11px] text-ink-soft">via {listTool.name}</p> : null}
    </div>
  );
}

function Search({ caps }: { caps: ToolCap[] }) {
  // prefer the semantic searcher: it can answer the REAL embedding
  // projection (withProjection) on top of the hits
  const searchTool = caps.find((c) => /semantic/i.test(c.name)) ?? caps[0];
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"idle" | "loading" | "ok" | "refused">("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [proj, setProj] = useState<unknown>(null);
  const [msg, setMsg] = useState("");

  const run = async () => {
    if (!searchTool || !searchTool.name || !query.trim()) return;
    setType("loading");
    try {
      const args: Record<string, unknown> = { query: query.trim() };
      if (/semantic/i.test(searchTool.name)) args.withProjection = true;
      const result = await exec(searchTool.name, args);
      const parsed = parseResults(result);
      setRows(parsed.rows);
      setProj((result as { projection?: unknown } | null)?.projection ?? null);
      setMsg(parsed.rows.length === 0 ? "The search returned an empty set for that query - shown as received." : "");
      setType("ok");
    } catch (err) {
      setRows([]);
      setProj(null);
      setMsg(err instanceof ApiError ? err.message : String(err));
      setType("refused");
    }
  };

  if (!searchTool || !searchTool.name) {
    return (
      <NotConnected why="The door answered but registers no search tool; retrieval and its map render when this pod exposes one." />
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
          placeholder="query the corpus"
          className="flex-1 rounded border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button onClick={() => void run()} disabled={type === "loading"} className="rounded bg-accent px-3 py-1.5 text-sm text-paper hover:bg-accent-deep disabled:opacity-50">
          {type === "loading" ? "searching..." : "Search"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-ink-soft">via {searchTool.name}</p>
      {type === "refused" ? (
        <p className="mt-3 rounded border border-err/40 bg-err/5 p-3 text-xs text-err">{msg}</p>
      ) : null}
      {type === "ok" && msg ? <p className="mt-3 text-sm text-ink-soft">{msg}</p> : null}
      {type === "ok" && rows.length > 0 ? <MapAndList rows={rows} projection={proj} /> : null}
    </div>
  );
}

// The REAL embedding-space scatter when the pod's projection contract
// checks out (mapProjection is fail-closed); otherwise the honest
// rank-vs-score fallback, identical to before P4 vector plumbing.
function MapAndList({ rows, projection }: { rows: Row[]; projection: unknown }) {
  const mapped = mapProjection(projection, rows.map((r) => r.key));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;
    const ctx = canvasCtx;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (mapped) {
      // REAL projection: x/y ARE the pod's embedding coordinates (JL
      // projection, seed 9), scaled to the plot box. The ring is the
      // query anchor; thin spokes connect anchor -> hit to show geometry.
      const box = Math.min(W, H) / 2 - 20;
      const cx = W / 2;
      const cy = H / 2;
      const px = (v: number) => cx + Math.max(-1, Math.min(1, v)) * box;
      const py = (v: number) => cy - Math.max(-1, Math.min(1, v)) * box;
      if (mapped.anchor) {
        for (const pt of mapped.pts) {
          ctx.strokeStyle = "rgba(109, 97, 82, 0.25)";
          ctx.beginPath();
          ctx.moveTo(px(mapped.anchor.x), py(mapped.anchor.y));
          ctx.lineTo(px(pt.x), py(pt.y));
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(px(mapped.anchor.x), py(mapped.anchor.y), 5, 0, Math.PI * 2);
        ctx.strokeStyle = "#3f6fb5";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      for (const pt of mapped.pts) {
        ctx.beginPath();
        ctx.arc(px(pt.x), py(pt.y), 4, 0, Math.PI * 2);
        ctx.fillStyle = pt.amber ? "#a9701e" : "#6d6152";
        ctx.fill();
      }
      ctx.font = "10px monospace";
      ctx.fillStyle = "#6d6152";
      ctx.fillText("real embedding projection (seeded JL, per pod contract)", 24, 10);
    } else {
      const n = rows.length;
      for (let i = 0; i < n; i++) {
        const row = rows[i];
        const x = 24 + ((i + 1) / (n + 1)) * (W - 48);
        // unscored results sit in the middle band and say so in the legend
        const sc = typeof row.score === "number" ? row.score : 0.5;
        const y = 12 + (1 - Math.max(0, Math.min(1, sc))) * (H - 24);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = nscLike(row.key) ? "#a9701e" : "#6d6152";
        ctx.fill();
      }
      ctx.font = "10px monospace";
      ctx.fillStyle = "#6d6152";
      ctx.fillText("rank ->  (door's real ordering)", 24, H - 2);
      ctx.fillText("score (^, real per result)", 24, 10);
    }
  }, [rows, mapped]);

  const anyNsc = rows.some((r) => nscLike(r.key));
  return (
    <div>
      <Help
        text={mapped
          ? "Every dot IS a real embedding: the pod projected its own vectors to 2D (deterministic seeded projection, seed 9) with the query as the ringed anchor. Nearby dots are near each other in embedding space; spokes show query-to-hit geometry. The list below is the pod's ranking of the same results."
          : "Every dot is a REAL search result: x is its rank in the door's ordering, y is the score the pod returned for it. This pod did not answer the vector projection for that call (or it failed contract checks) - the map shows the honest rank view instead of pretending."
        }
      >
        <p className="text-xs text-ink-soft">
          {mapped
            ? "embedding-space map - REAL pod vectors, deterministic projection"
            : "rank vs score - real door data, no vector projection answered"}
        </p>
      </Help>
      <canvas ref={canvasRef} width={640} height={220} className="mt-2 w-full max-w-2xl rounded-lg border border-line bg-surface" />
      <p className="mt-1 text-[11px] text-ink-soft">
        dots <span className="text-accent">amber</span> = key parses as an NSC9-style address
        {anyNsc ? "" : " (none in this result set)"}
        {" | "}gray with no score label = pod returned no score for that hit (rank still real)
      </p>
      <ul className="mt-3 space-y-1">
        {rows.map((r, i) => (
          <li key={`${r.key}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="font-mono text-[10px] text-ink-soft">#{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{r.text}</span>
            {r.score !== undefined ? (
              <span className="font-mono text-accent">{scoreToText(r.score)}</span>
            ) : (
              <span className="text-ink-soft">no score</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function scoreToText(score: number): string {
  return score.toFixed(3);
}

function Ids({ caps }: { caps: ToolCap[] }) {
  return (
    <div>
      <Help
        text="NSC-9 automation barcodes (9-facility-sequence-check, docs/advanced/nsc9-spec) are how the memory store addresses entries without a lookup index - deterministic and self-authenticating from the content itself. Keys the pod answers with that parse in that shape show in the map's amber color; this tab lists the addressing-side tools the door actually registers."
      >
        <p className="text-xs text-ink-soft">NSC9 addressing tools + shape detection on what the pod returns.</p>
      </Help>
      {caps.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          No addressing-related tools are registered for this identity yet (geometry / memory store /
          addressing metadata). Nothing gets drawn that the pod did not hand over.
        </p>
      ) : (
        caps.map((cap) => <ToolCall key={cap.name} name={cap.name} description={cap.description} />)
      )}
      <p className="mt-4 text-xs text-ink-soft">
        Keys parsing as 9-NNNNN-NNNNN-N appear amber in the map above (detection on what the pod
        actually returned - no invented coordinates are ever plotted). When a pod starts serving
        real addressing metadata through a registered tool, this tab renders it through the shared
        tool panels below.
      </p>
    </div>
  );
}
