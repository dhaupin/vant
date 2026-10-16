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
  const account = useApp((s) => s.account);
  const bound = useApp((s) => s.boundFor.includes(s.property));
  // authed = pasted token OR a live account session (pod tokens bound
  // SERVER-SIDE ride the HttpOnly cookie; prd-web.md 3.5)
  const authed = !!token || (!!account && bound);
  return useQuery({
    queryKey: ["tools", property, token ? "tokened" : account && bound ? "bound" : "anon"],
    queryFn: tools,
    enabled: authed,
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
