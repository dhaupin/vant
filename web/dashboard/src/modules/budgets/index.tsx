import { ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { ToolCall } from "../../frame/ToolCall";
import { useApp } from "../../state";

/**
 * Module: budgets (catalog #15, Tier S). Real escrow_/budget_ tools get
 * call panels; budgets the door keeps to itself are stated as such.
 */
export default function Budgets() {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const toolsQ = useToolsQuery();

  if (!token) {
    return <NotConnected why="No identity is active yet." />;
  }
  if (toolsQ.isError) {
    const e = toolsQ.error as ApiError;
    if (e.kind === "network") return <NotConnected why="The bridge is unreachable, so budget surfaces cannot be read." />;
    return <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
  }
  if (toolsQ.isPending) {
    return <p className="text-sm text-ink-soft">Asking the door for its tool list...</p>;
  }

  const caps = [
    ...toolsByPrefix(toolsQ.data, "escrow_"),
    ...toolsByPrefix(toolsQ.data, "budget_"),
  ];
  if (caps.length === 0) {
    return (
      <NotConnected why="The door answered but exposes no escrow_/budget_ tools to this identity. Budget checks remain enforced at the pod's door regardless - this page simply has nothing to display." />
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Budgets</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Workspace/escrow budget views through the tools this door really
        registers.
      </p>
      {caps.map((cap) => (
        <ToolCall key={cap.name} name={cap.name} description={cap.description} />
      ))}
    </div>
  );
}
