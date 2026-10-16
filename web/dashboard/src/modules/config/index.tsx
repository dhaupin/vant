import { ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery } from "../../frame/conn";
import { ToolCall } from "../../frame/ToolCall";
import { useApp } from "../../state";

/**
 * Module: config (catalog #16, Tier S). Real config-related tools get
 * call panels; the browser additionally owns config through the same
 * brain-scoped resolver the CLI uses.
 */
export default function Config() {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const toolsQ = useToolsQuery();

  if (!token) {
    return <NotConnected why="No identity is active yet." />;
  }
  if (toolsQ.isError) {
    const e = toolsQ.error as ApiError;
    if (e.kind === "network") return <NotConnected why="The bridge is unreachable, so the config surface cannot be read." />;
    return <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
  }
  if (toolsQ.isPending) {
    return <p className="text-sm text-ink-soft">Asking the door for its tool list...</p>;
  }

  const all = toolsQ.data?.tools ?? [];
  const caps = all.filter(
    (t) =>
      typeof t.name === "string" &&
      (t.name.toLowerCase().includes("config") || t.name.toLowerCase().includes("settings")),
  );
  if (caps.length === 0) {
    return (
      <NotConnected why="The door answered but exposes no config-related tools. Runtime config edits remain on the pod CLI (`vant config get|set`) per the PRD until a pod confirms more here." />
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Config</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Config surfaces through the tools this door really registers.
        Standing config writes stay on the pod CLI per prd-web.md 5 (P3);
        anything named like a write is here because the door offers it,
        not because this page endorses casual use.
      </p>
      {caps.map((cap) => (
        <ToolCall
          key={cap.name}
          name={cap.name}
          description={
            cap.name.toLowerCase().includes("set")
              ? `${cap.description ?? ""} (write - the PRD asks you to think twice)`.trim()
              : cap.description
          }
        />
      ))}
    </div>
  );
}
