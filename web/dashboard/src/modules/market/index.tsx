import { useState } from "react";
import { exec, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { useEvents } from "../../frame/events";

/**
 * Module: market (catalog #10, P2 depth). Wired to the door's REAL set
 * (schemas probed live 2026-10-15): market_search { query?, type?, tags? }
 * is the BROWSE (market_list is the write/listing tool — it demands
 * type+title+price and answers MCP_INPUT_INVALID without them);
 * market_get { listingId } opens one listing. Results render verbatim
 * below the search form; typed refusals surface as-is.
 */

interface Listing {
  id?: string;
  listingId?: string;
  type?: string;
  title?: string;
  summary?: string;
  price?: string;
  tags?: unknown;
  [k: string]: unknown;
}

export default function Market() {
  const fan = useEvents();
  const toolsQ = useToolsQuery();
  const caps = toolsQ.isSuccess ? toolsByPrefix(toolsQ.data, "market_") : [];
  const hasBrowse = caps.some((c) => c.name === "market_search");

  const events = fan.ring.filter((e) => e.family === "market").slice(-15).reverse();

  let body = null;
  if (toolsQ.isError) {
    const e = toolsQ.error as ApiError;
    body =
      e.kind === "network" ? (
        <NotConnected why="The bridge is unreachable, so market tools cannot load." />
      ) : (
        <Refusal error={e} onRetry={() => toolsQ.refetch()} />
      );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Market</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Browse listings through the door's market_search (the write path,
        market_list, stays a raw panel below — it is a listing tool, not a
        browse). Refusals answer typed.
      </p>
      {body}
      {hasBrowse ? <BrowsePanel canGet={caps.some((c) => c.name === "market_get")} /> : null}
      {caps
        .filter((c) => c.name !== "market_search" && c.name !== "market_get")
        .map((cap) => (
          <details key={cap.name} className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
            <summary className="cursor-pointer font-mono text-xs font-medium">{cap.name}</summary>
            {cap.description ? <p className="mt-1 text-xs text-ink-soft">{cap.description}</p> : null}
            <RawArgsPanel name={cap.name} />
          </details>
        ))}
      <div className="mt-6">
        {events.length === 0 && fan.status === "live" ? (
          <p className="text-xs text-ink-soft">Stream live; no market events yet.</p>
        ) : null}
        <ul className="space-y-1.5">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs">
              <span className="font-mono text-accent">market</span>{" "}
              <span className="text-ink-soft">
                {e.raw && typeof e.raw === "object" ? JSON.stringify(e.raw).slice(0, 140) : String(e.raw ?? "")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BrowsePanel({ canGet }: { canGet: boolean }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "err">("idle");
  const [err, setErr] = useState<string>("");
  const [detail, setDetail] = useState<{ id: string; text: string; bad: boolean } | null>(null);

  const search = async () => {
    setState("loading");
    setErr("");
    setDetail(null);
    const args: Record<string, unknown> = {};
    const q = query.trim();
    if (q) args.query = q;
    if (type) args.type = type;
    try {
      const r = (await exec("market_search", args)) as { results?: unknown };
      const arr = Array.isArray(r?.results) ? r.results as Listing[] : [];
      setRows(arr);
      setState("done");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "the search did not reach the door");
      setState("err");
    }
  };

  const open = async (id: string) => {
    setDetail({ id, text: "loading…", bad: false });
    try {
      const r = await exec("market_get", { listingId: id });
      setDetail({ id, text: JSON.stringify(r, null, 2), bad: false });
    } catch (e) {
      setDetail({ id, text: e instanceof ApiError ? e.message : "not readable", bad: true });
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Browse listings</h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
          placeholder="query (optional)"
          className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="listing type"
          className="shrink-0 rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
        >
          <option value="">any type</option>
          <option value="knowledge">knowledge</option>
          <option value="insight">insight</option>
          <option value="memory">memory</option>
          <option value="favor">favor</option>
        </select>
        <button
          type="button"
          onClick={search}
          disabled={state === "loading"}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:bg-accent-deep disabled:opacity-50"
        >
          {state === "loading" ? "Searching…" : "Search"}
        </button>
      </div>

      {state === "err" ? (
        <p className="mt-3 rounded-md border border-err/40 bg-err/5 px-3 py-2 text-xs text-err">{err}</p>
      ) : null}
      {state === "done" && rows ? (
        rows.length === 0 ? (
          <p className="mt-3 text-xs text-ink-soft">No listings match — an honest empty board, not fabricated rows.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((row, i) => {
              const id = row.id ?? row.listingId ?? `row-${i}`;
              return (
                <li key={String(id)} className="rounded border border-line bg-paper px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{row.title ?? "(untitled)"}</span>
                    {row.price ? <span className="text-xs text-ink-soft">{row.price}</span> : null}
                  </div>
                  {row.summary ? <p className="mt-0.5 text-xs text-ink-soft">{String(row.summary).slice(0, 160)}</p> : null}
                  {canGet ? (
                    <button type="button" onClick={() => void open(String(id))} className="mt-1 text-xs text-accent underline">
                      open {String(id)}
                    </button>
                  ) : null}
                  {detail && detail.id === String(id) ? (
                    <pre className={`mt-2 overflow-auto rounded border p-2 font-mono text-xs ${detail.bad ? "border-err/40" : "border-line"}`}>
                      {detail.text}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

function RawArgsPanel({ name }: { name: string }) {
  const [args, setArgs] = useState("{}");
  const [out, setOut] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const call = async () => {
    setBusy(true);
    try {
      const result = await exec(name, JSON.parse(args || "{}") as Record<string, unknown>);
      setOut(JSON.stringify(result, null, 2));
      setBad(false);
    } catch (err) {
      setOut(err instanceof ApiError ? err.message : String(err));
      setBad(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2">
      <textarea
        rows={3}
        value={args}
        onChange={(e) => setArgs(e.target.value)}
        spellCheck={false}
        className="w-full rounded border border-line bg-paper p-2 font-mono text-xs"
      />
      <button
        onClick={call}
        disabled={busy}
        className="mt-2 rounded bg-accent px-2.5 py-1 text-xs text-paper hover:bg-accent-deep disabled:opacity-50"
      >
        {busy ? "Calling..." : "Call"}
      </button>
      {out ? (
        <pre className={`mt-2 overflow-auto rounded border p-3 font-mono text-xs ${bad ? "border-err/40" : "border-line"}`}>
          {out}
        </pre>
      ) : null}
    </div>
  );
}
