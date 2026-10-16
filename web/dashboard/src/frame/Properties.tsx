import { useQuery } from "@tanstack/react-query";
import { properties } from "../api";
import { useApp } from "../state";

/**
 * The multi-install registry, read from the bridge (prd-web.md 3.4): N
 * attaches = N pairs of Pages vars in ONE deployment. The frontend only
 * ever learns ids + labels; origins stay server-side where the bridge
 * resolves them for forwarding alone.
 *
 * Switch preserves route + filters + scroll (URL rides ?p=). The board
 * connection, SSE fanout, cached tool queries, and every module's data
 * re-key off the active property (each connection stays single).
 */
export function useProperties() {
  return useQuery({
    queryKey: ["properties"],
    queryFn: properties,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function usePropertyList(): Array<{ id: string; name: string }> {
  return useProperties().data?.properties?.filter((p) => /^[a-z0-9-]{1,40}$/.test(p.id)) ?? [];
}

export function useActiveProperty(): string {
  return useApp((s) => s.property);
}
