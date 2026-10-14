import { ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { ToolCall } from "../../frame/ToolCall";
import { useApp } from "../../state";

/**
 * Module: work (catalog #7). The console discovers the pod's REAL work_
 * tools from the door and calls exactly those - no assumed schemas, no
 * invented fields. While disconnected: one plain "Not connected".
 */
export default function Work() {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const toolsQ = useToolsQuery();

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
        <ToolCall key={cap.name} name={cap.name} description={cap.description} />
      ))}
    </div>
  );
}
