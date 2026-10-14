import { useEffect, useSyncExternalStore } from "react";

/**
 * The ONE SSE connection per ACTIVE property (prd-web.md 3.3 resp. 3:
 * N modules must never mean N EventSources - the pod caps at 32). The
 * frame subscribes once and fans each module manifest's `families` out.
 * Auth rides the peer's perimeter: our /api/mcp/events for the worker
 * functions can add Authorization server-side from the session cookie;
 * the browser's EventSource never sees the token.
 */

export interface BoardEvent {
  family: string;
  raw: unknown;
  at: number;
}

const RING_MAX = 80;

interface FanoutState {
  status: "idle" | "connecting" | "live" | "down";
  property: string;
  ring: BoardEvent[];
}

type Listener = () => void;
const listeners = new Set<Listener>();
let state: FanoutState = { status: "idle", property: "", ring: [] };
let es: EventSource | null = null;
let desiredProperty: string | null = null;

function setState(patch: Partial<FanoutState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeEvents(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function eventsSnapshot(): FanoutState {
  return state;
}

export function useEvents(): FanoutState {
  return useSyncExternalStore(subscribeEvents, eventsSnapshot, eventsSnapshot);
}

/** Which families did this property's stream actually see? (honest view) */
export function seenFamilies(): Set<string> {
  return new Set(state.ring.map((e) => e.family));
}

export function setDesiredProperty(property: string): void {
  // idempotent: the same active property with a live stream reconnects NOTHING
  if (desiredProperty === property && es && es.readyState <= 1) return;
  desiredProperty = property;
  reconnect();
}

function reconnect() {
  if (es) {
    es.close();
    es = null;
  }
  if (!desiredProperty) return;
  setState({ status: "connecting", property: desiredProperty, ring: state.ring });
  // switch closes the OLD stream before opening the next (prd-web.md 3.4)
  const next = new EventSource(`/api/mcp/events?p=${encodeURIComponent(desiredProperty)}`);
  es = next;
  next.onopen = () => {
    if (es === next) setState({ status: "live" });
  };
  next.onerror = () => {
    if (es === next) setState({ status: "down" });
  };
  next.onmessage = (ev) => {
    if (es !== next) return;
    let family = "";
    let raw: unknown = null;
    try {
      const parsed = JSON.parse(ev.data) as Record<string, unknown>;
      raw = parsed;
      family =
        (typeof parsed.family === "string" && parsed.family) ||
        (typeof parsed.type === "string" && parsed.type) ||
        (typeof (parsed as { event?: unknown }).event === "string" &&
          String(parsed.event)) ||
        "other";
    } catch {
      family = "other";
      raw = ev.data;
    }
    setState({
      ring: [...state.ring.slice(-(RING_MAX - 1)), { family, raw, at: Date.now() }],
    });
  };
}

/** Module-level helper: subscribe while mounted (families honored by the
 *  caller filtering the ring; one connection is the frame's, always). */
export function useBoardConnection(enabled: boolean) {
  useEffect(() => {
    if (enabled) setDesiredProperty(desiredProperty ?? "");
  }, []);

}

/** Full teardown (settings sign-out, app teardown). */
export function closeBoard(): void {
  desiredProperty = null;
  if (es) {
    es.close();
    es = null;
  }
  setState({ status: "idle" });
}
