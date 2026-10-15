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

/** The tap contract: family frames arrive as DEFAULT-message events with
 *  the full bus type embedded as `tapType` (prd door /mcp/events tap).
 *  Modules key on the ROOT segment. The one NAMED frame survives as its
 *  own contract: `tap.revoked` (the pod announcing the stream kill at the
 *  next beat after a mid-stream guest revocation). */
function familyOf(raw: unknown, evType: string): string {
  let t = evType && evType !== "message" ? evType : "";
  if (!t && raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).tapType === "string") {
    t = String((raw as Record<string, unknown>).tapType);
  }
  if (!t) return "other";
  return t.split(":")[0] || t;
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
  // board contract: family frames are DEFAULT-message events (data only,
  // type embedded as `tapType`); this onmessage finally receives them.
  next.onmessage = (ev) => {
    if (es !== next) return;
    let family = "";
    let raw: unknown = null;
    try {
      const parsed = JSON.parse(ev.data) as Record<string, unknown>;
      raw = parsed;
      family = familyOf(parsed, ev.type);
    } catch {
      family = "other";
      raw = ev.data;
    }
    setState({
      ring: [...state.ring.slice(-(RING_MAX - 1)), { family, raw, at: Date.now() }],
    });
  };
  // the pod's own annihilation note: a guest token revoked mid-stream is
  // announced as a NAMED frame at the next beat; the browser closes the
  // connection and renders the honest dead state instead of a silent clog.
  next.addEventListener("tap.revoked", () => {
    if (es !== next) return;
    setState({
      ring: [
        ...state.ring.slice(-(RING_MAX - 1)),
        { family: "sys", raw: { tapType: "tap.revoked" }, at: Date.now() },
      ],
      status: "down",
    });
    next.close();
  });
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
