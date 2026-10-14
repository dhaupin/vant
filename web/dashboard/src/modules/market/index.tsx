import { useState } from "react";
import { exec, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { useEvents } from "../../frame/events";

/**
 * Module: market (catalog #10). Same honesty contract: real market_
 * tools from the door get call panels; real market events from the
 * stream get listed; everything else is a plain, short statement.
 */
export default function Market() {
  const fan = useEvents();
  const toolsQ = useToolsQuery();
  const caps = toolsQ.isSuccess ? toolsByPrefix(toolsQ.data, "market_") : [];
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
  } else if (toolsQ.isSuccess && caps.length === 0) {
    body = (
      <NotConnected why="The door answered but registers no market_ tools. Events still stream below when they occur." />
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Market</h1>
      <p className="mt-1 text-sm text-ink-soft">
        market-family events plus the market_ tools the door reports.
      </p>
      {body}
      {caps.map((cap) => (
        <CallLine key={cap.name} name={cap.name} />
      ))}
      <div className="mt-4">
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

function CallLine({ name }: { name: string }) {
  const [args, setArgs] = useState("{}");
  const [out, setOut] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
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
    <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen((o) => !o)} className="font-mono text-xs font-medium cursor-pointer">
          {open ? "-" : "+"} {name}
        </button>
        <button onClick={call} disabled={busy} className="rounded bg-accent px-2.5 py-1 text-xs text-paper hover:bg-accent-deep disabled:opacity-50">
          {busy ? "Calling..." : "Call"}
        </button>
      </div>
      {open ? (
        <textarea
          rows={3}
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          spellCheck={false}
          className="mt-2 w-full rounded border border-line bg-paper p-2 font-mono text-xs"
        />
      ) : null}
      {out ? (
        <pre className={`mt-2 overflow-auto rounded border p-3 font-mono text-xs ${bad ? "border-err/40" : "border-line"}`}>
          {out}
        </pre>
      ) : null}
    </div>
  );
}
