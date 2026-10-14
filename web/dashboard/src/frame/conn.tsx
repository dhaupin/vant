import { useQuery } from "@tanstack/react-query";
import { tools } from "../api";
import { useApp } from "../state";

/**
 * The honest-connection layer (owner directive: NO fake data, NO bloat -
 * if it is not connected, SAY so, plainly). Every module renders through
 * these; nobody invents list-shaped filler while a bridge is down.
 */

export function useToolsQuery() {
  const property = useApp((s) => s.property);
  const token = useApp((s) => s.tokens[s.property] ?? null);
  return useQuery({
    queryKey: ["tools", property, token ? "tokened" : "anon"],
    queryFn: tools,
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
  });
}

export interface ToolCap {
  name: string;
  description?: string;
}

export function toolsByPrefix(
  data: { tools?: Array<{ name: string; description?: string }> } | undefined,
  prefix: string,
): ToolCap[] {
  if (!data || !Array.isArray(data.tools)) return [];
  return data.tools.filter((t) => typeof t.name === "string" && t.name.startsWith(prefix));
}

/** The ONE plain refusal-of-connection statement. One short paragraph,
 *  the reason, the recoveries. No decoration, no fake list items. */
export function NotConnected({ why }: { why: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 text-sm">
      <p className="font-medium">Not connected</p>
      <p className="mt-1 text-ink-soft">{why}</p>
      <p className="mt-2 text-xs text-ink-soft">
        Recoveries: check the status page (bridge healths), re-paste a
        valid token via settings, or deploy the Worker functions with the
        pod origin set in Pages settings.
      </p>
    </div>
  );
}
