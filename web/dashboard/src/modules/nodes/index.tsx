import { ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery } from "../../frame/conn";
import { ToolCall } from "../../frame/ToolCall";

/**
 * Module: nodes (catalog #17 at /nodes, O A S, phase P3). ONE honest
 * surface: the node-registry / mesh tools the door ACTUALLY registers,
 * browsable through the shared call panels. Per prd-web.md 3.4, mesh
 * discovery feeding the PROPERTY list is a later branch - this module
 * does not pretend to enumerate installs the door did not hand over.
 */
export default function Nodes() {
  const toolsQ = useToolsQuery();

  if (toolsQ.isError) {
    const e = toolsQ.error as ApiError;
    if (e.kind === "network") {
      return <NotConnected why="The bridge is unreachable, so the node surface cannot be read." />;
    }
    return <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
  }
  if (toolsQ.isPending) {
    return <p className="text-sm text-ink-soft">Asking the door for its tool list...</p>;
  }

  // (detection repair, pass 225) The door really registers
  // `nodes_list` and `agora_nodes` — the old prefix list matched
  // NEITHER (node_ ≠ nodes_, and nothing matched agora_nodes), so
  // this page showed "no tools" against a door that had them.
  const all = toolsQ.data?.tools ?? [];
  const caps = all.filter(
    (t) => typeof t.name === "string" && /^(nodes?_|mesh_|agora_nodes|node-registry|registry_)/.test(t.name),
  );

  return (
    <div>
      <h1 className="text-lg font-semibold">Nodes</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Node-registry and mesh status through this pod's real tools.        Every node is a registered pod; attached installs (any pod) remain
        the property switcher's domain (prd-web.md 3.4).
      </p>
      {caps.length > 0 ? (
        <div className="mt-4">
          {caps.map((cap) => (
            <ToolCall key={cap.name} name={cap.name} description={cap.description} />
          ))}
        </div>
      ) : (
        <NotConnected why="The door answered but registers no node_/mesh_/registry_ tools for this identity yet; this page renders nothing the pod did not hand over." />
      )}
    </div>
  );
}
