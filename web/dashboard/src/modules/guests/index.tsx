import { ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { ToolCall } from "../../frame/ToolCall";
import { useApp } from "../../state";

/**
 * Module: guests (catalog #12, Tier S). Same honesty contract: the
 * guest_ tools the door REALLY registers get call panels; anything else
 * gets one plain sentence, never a sample roster.
 */
export default function Guests() {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const toolsQ = useToolsQuery();

  if (!token) {
    return <NotConnected why="No identity is active yet." />;
  }
  if (toolsQ.isError) {
    const e = toolsQ.error as ApiError;
    if (e.kind === "network") return <NotConnected why="The bridge is unreachable, so the guest surface cannot be read." />;
    return <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
  }
  if (toolsQ.isPending) {
    return <p className="text-sm text-ink-soft">Asking the door for its tool list...</p>;
  }

  const caps = toolsByPrefix(toolsQ.data, "guest_");
  if (caps.length === 0) {
    return (
      <NotConnected why="The door answered but exposes no guest_ tools to this identity. Guest lifecycle stays on the pod CLI (vant guest issue/list/revoke) until a pod confirms its surface here." />
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Guests</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Guest lifecycle against the door's real guest_ tools. Every call
        is door-gated; a revoke asks the typed-refusal states to speak up
        before the door judges it.
      </p>
      {caps.map((cap) => (
        <ToolCall key={cap.name} name={cap.name} description={cap.description} />
      ))}
    </div>
  );
}
