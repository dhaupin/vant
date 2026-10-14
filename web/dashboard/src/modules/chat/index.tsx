import { useState } from "react";
import { exec, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix, type ToolCap } from "../../frame/conn";
import { useEvents } from "../../frame/events";

/**
 * Module: chat (catalog #8). Two honest surfaces, nothing else: the
 * msg-family events the shared fanout has actually delivered, and a
 * call panel for the msg_ tools the door REALLY registers. No assumed
 * channels, no invented tails.
 */
export default function Chat() {
  const fan = useEvents();
  const toolsQ = useToolsQuery();

  const caps: ToolCap[] = toolsQ.isSuccess ? toolsByPrefix(toolsQ.data, "msg_") : [];

  return (
    <div>
      <h1 className="text-lg font-semibold">Chat</h1>
      <p className="mt-1 text-sm text-ink-soft">
        msg family events from the shared stream, plus the msg_ tools the
        door reports.
      </p>

      <div className="mt-6">
        {toolsQ.isError ? (
          (() => {
            const e = toolsQ.error as ApiError;
            return e.kind === "network"
              ? <NotConnected why="The bridge is unreachable, so tools and tails cannot load." />
              : <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
          })()
        ) : null}
        {toolsQ.isSuccess && caps.length === 0 ? (
          <NotConnected why="The door answered but registers no msg_ tools; there is nothing to call and nothing to fake." />
        ) : null}
        {fan.ring.filter((e) => e.family === "msg").length === 0 ? (
          <p className="mt-2 text-xs text-ink-soft">
            No msg events on the stream yet{fan.status === "live" ? " - the stream is live and quiet" : ""}.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {fan.ring
              .filter((e) => e.family === "msg")
              .slice(-20)
              .reverse()
              .map((e, i) => (
                <li key={`${e.at}-${i}`} className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs">
                  <span className="font-mono text-accent">msg</span>{" "}
                  <span className="text-ink-soft">{e.raw && typeof e.raw === "object" ? JSON.stringify(e.raw).slice(0, 160) : String(e.raw ?? "")}</span>
                </li>
              ))}
          </ul>
        )}
        {caps.map((cap) => (
          <details key={cap.name} className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
            <summary className="cursor-pointer font-mono text-xs font-medium">{cap.name}</summary>
            {cap.description ? <p className="mt-1 text-xs text-ink-soft">{cap.description}</p> : null}
            <CallPanel name={cap.name} />
          </details>
        ))}
      </div>
    </div>
  );
}

function CallPanel({ name }: { name: string }) {
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
