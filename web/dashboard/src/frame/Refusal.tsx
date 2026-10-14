import type { ApiError } from "../api";

/**
 * ONE refusal primitive (prd-web.md 3.3 rule 6). Modules import this,
 * never re-implement. Typed to match the door's honest surfaces: a
 * refusal is a STATE, not a swallow.
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
  const title =
    kind === "network"
      ? "The pod bridge is unreachable"
      : error.status === 401 || error.status === 403
        ? "Refused for this identity"
        : error.status === 429
          ? "Throttled"
          : "Refused";
  const hint =
    kind === "network"
      ? "Check the status page; the bridge may be offline or the breaker is open."
      : error.status === 401 || error.status === 403
        ? "Your token is pasted per load (MVP). A seat with the right role, or a fresh token, is the fix."
        : error.status === 429
          ? "The door rate-limited this session. Wait a moment, then retry."
          : "The door said no. It keeps saying no for a reason.";
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
