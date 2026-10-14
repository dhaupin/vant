import { ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { ToolCall } from "../../frame/ToolCall";
import { useApp } from "../../state";

/**
 * Module: pairing (catalog #14, Tier S). Honest contract: real
 * pairing_/voucher_ tools get call panels; the deep-link QR redeem view
 * lands with the P3 spec - until then the CLI voucher flow is stated as
 * what it is, not drawn as if it were clickable.
 */
export default function Pairing() {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const toolsQ = useToolsQuery();

  if (!token) {
    return <NotConnected why="No identity is active yet." />;
  }
  if (toolsQ.isError) {
    const e = toolsQ.error as ApiError;
    if (e.kind === "network") return <NotConnected why="The bridge is unreachable, so the pairing surface cannot be read." />;
    return <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
  }
  if (toolsQ.isPending) {
    return <p className="text-sm text-ink-soft">Asking the door for its tool list...</p>;
  }

  const caps = [
    ...toolsByPrefix(toolsQ.data, "pairing_"),
    ...toolsByPrefix(toolsQ.data, "voucher_"),
  ];
  if (caps.length === 0) {
    return (
      <NotConnected
        why="The door answered but exposes no pairing_/voucher_ tools. The voucher flow is: `vant guest pair --code <code>` on the pod CLI. The dashboard QR + deep-link redeem view lands with the P3 spec and will be stated here when real."
      />
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Pairing</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Pairing vouchers through the tools this door really registers.
      </p>
      {caps.map((cap) => (
        <ToolCall key={cap.name} name={cap.name} description={cap.description} />
      ))}
    </div>
  );
}
