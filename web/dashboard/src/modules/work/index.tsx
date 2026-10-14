import { useState } from "react";
import { exec, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { useApp } from "../../state";

/**
 * Module: work (catalog #7). The console discovers the pod's REAL work_
 * tools from the door and calls exactly those - no assumed schemas, no
 * invented fields. While disconnected: one plain "Not connected".
 */
export default function Work() {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const toolsQ = useToolsQuery();
  const [results, setResults] = useState<Array<{ tool: string; body: string; error?: boolean }>>([]);

  if (!token) {
    return <NotConnected why="No identity is active yet. Nothing is filled in until the door answers." />;
  }
  if (toolsQ.isError) {
    const e = toolsQ.error as ApiError;
    if (e.kind === "network") return <NotConnected why="The bridge is unreachable, so the tool surface cannot be read." />;
    return <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
  }
  if (toolsQ.isPending) {
    return <p className="text-sm text-ink-soft">Asking the door for its tool list...</p>;
  }

  const caps = toolsByPrefix(toolsQ.data, "work_");
  if (caps.length === 0) {
    return (
      <NotConnected why="The door answered, and it exposes no work_ tools. If this pod should accept work, check the pod's tool registry; this page will not pretend otherwise." />
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Work</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Real tools the door reports ({caps.length}). Calls go out exactly
        as typed, and refusals come back typed.
      </p>
      {caps.map((cap) => (
        <ToolCall key={cap.name} name={cap.name} description={cap.description} onResult={(body, error) => setResults((r) => [{ tool: cap.name, body, error }, ...r].slice(0, 8))} />
      ))}
      {results.map((r, i) => (
        <pre key={i} className={`mt-3 overflow-auto rounded-lg border bg-surface p-3 font-mono text-xs ${r.error ? "border-err/40" : "border-line"}`}>
          {r.tool}: {r.body}
        </pre>
      ))}
    </div>
  );
}

function ToolCall({
  name,
  description,
  onResult,
}: {
  name: string;
  description?: string;
  onResult: (body: string, error: boolean) => void;
}) {
  const [args, setArgs] = useState("{}");
  const [busy, setBusy] = useState(false);
  const call = async () => {
    setBusy(true);
    try {
      const parsed = JSON.parse(args || "{}") as Record<string, unknown>;
      const result = await exec(name, parsed);
      onResult(JSON.stringify(result, null, 2), false);
    } catch (err) {
      if (err instanceof SyntaxError) onResult("not valid JSON - this panel calls exactly what you type", true);
      else onResult(err instanceof ApiError ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <code className="text-sm font-medium">{name}</code>
        <button onClick={call} disabled={busy} className="rounded bg-accent px-2.5 py-1 text-xs text-paper hover:bg-accent-deep disabled:opacity-50">
          {busy ? "Calling..." : "Call"}
        </button>
      </div>
      {description ? <p className="mt-1 text-xs text-ink-soft">{description}</p> : null}
      <textarea
        rows={3}
        value={args}
        onChange={(e) => setArgs(e.target.value)}
        spellCheck={false}
        className="mt-2 w-full rounded border border-line bg-paper p-2 font-mono text-xs"
      />
    </div>
  );
}
