import type { ApiError } from "../api";

/**
 * ONE refusal primitive (prd-web.md 3.3 rule 6). Modules import this,
 * never re-implement. Typed to match the door's honest surfaces: a
 * refusal is a STATE, not a swallow.
 *
 * (mobile report, brain.creadev.org) The generic fallback copy ("The door
 * said no. It keeps saying no for a reason.") told the user nothing — a
 * dead vguest_ token read as breaker jargon with no dead-branch clue. The
 * modes now carry a CONCRETE cause + the actual next action; the raw
 * upstream message still prints below for the operator, never erases.
 */
export function Refusal({
  error,
  detail,
  onRetry,
}: {
  error: ApiError | { message: string; status?: number };
  detail?: string;
  onRetry?: () => void;
}) {
  const kind = error instanceof Error && "kind" in error ? String(error["kind"]) : "refused";
  const msg = (error.message || "").toLowerCase();
  // concrete cause first (the pod's own words matter more than our labels):
  // a stale/expired/revoked guest token and a hot edge-budget trip each get
  // their own plain-language mode instead of the abstract breaker line.
  // the live bridge surfaces (src/api.ts shortRefusal) say EXACTLY these:
  const breakerOpen = msg.includes("breaker open") || msg.includes("cooling down");
  const tokenDead =
    error.status === 401 ||
    error.status === 403 ||
    msg.includes("identity not valid") ||
    msg.includes("token") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden");
  const throttled = error.status === 429 || msg.includes("throttl");
  const configMissing = msg.includes("is not configured");
  const bridgeDown = msg.includes("unreachable") || msg.includes("e_bridge") || kind === "network";

  let title = "Refused";
  let hint = "The pod door refused this request.";
  if (breakerOpen) {
    title = "The pod keeps refusing — give it a moment";
    hint = "Several calls in a row just failed, so the dashboard paused new attempts to the pod for about 15 seconds (a circuit breaker). Underneath, the last real failure is what to look at — usually an unreachable pod or a rejected token. Retry once the pause lifts.";
  } else if (configMissing) {
    title = "This property is not attached yet";
    hint = 'The dashboard has no VANT_PROPERTY_<ID>_ORIGIN entry for this pod. Add the pair in the Pages project\'s environment settings, then reload.';
  } else if (bridgeDown) {
    title = "The pod is not reachable right now";
    hint = "The dashboard could not connect to the pod's door. If you run the pod, check it is up and the tunnel/host address in settings matches. Retrying after a short wait usually clears a cooling-down breaker.";
  } else if (tokenDead) {
    title = "Your access token was rejected";
    hint = "This seat's token is missing, revoked, or was minted for a different pod. Paste a fresh token from the host (vant guest issue) or ask the pod owner for one.";
  } else if (throttled) {
    title = "Too many requests just now";
    hint = "The per-session edge budget is spent. Wait about a minute, then retry.";
  } else if (error.status && error.status >= 500) {
    title = "The pod error is the message";
    hint = "The pod answered, but with a 5xx for this call. The raw line below is the pod's own; show it to whoever runs the pod.";
  }
  return (
    <div className="rounded-lg border border-err/40 bg-err/5 p-4 text-sm">
      <p className="font-medium text-err">{title}</p>
      <p className="mt-1 text-ink-soft">{hint}</p>
      {detail ? <p className="mt-2 font-mono text-xs text-ink-soft">{detail}</p> : null}
      <p className="mt-2 text-xs text-ink-soft">{error.message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-3 rounded border border-line px-2 py-1 hover:bg-ink/5">
          Retry
        </button>
      ) : null}
    </div>
  );
}
