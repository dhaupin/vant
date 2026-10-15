import { useEffect, useState } from "react";
import { ApiError, breakers } from "../../api";
import { useToolsQuery, ToolCap } from "../../frame/conn";
import { ToolCall } from "../../frame/ToolCall";
import { Help } from "../../frame/Tooltip";
import { useApp } from "../../state";

/**
 * Module: audit (catalog #11 at /audit, Tier S, phase P3). Three honest
 * surfaces:
 *   inbox/   the frontend's OWN typed-error ledger (auth outcomes,
 *            refusals, session lifecycles) via GET /api/audit - admin
 *            only; every other role gets the typed 403 rendered, not
 *            hidden
 *   breakers/ the same per-property breaker chips the status module
 *            reads (prd-web.md 3.6)
 *   pod/     whatever audit_ tools the door actually registers, through
 *            the shared call panels - or an honest "none registered"
 * No fabrication anywhere: an empty ledger says EMPTY.
 */

interface AuditEvent {
  at: number;
  kind: string;
  detail: Record<string, string | number>;
}

type InboxState =
  | { s: "idle" }
  | { s: "loading" }
  | { s: "ok"; events: AuditEvent[] }
  | { s: "down"; msg: string };

export default function Audit() {
  const account = useApp((s) => s.account);
  const toolsQ = useToolsQuery();

  // (detection repair, pass 225) The door really registers
  // `vant_audit_list` / `vant_audit_log` — the old `audit_`/`ledger_`
  // prefixes matched NEITHER, so the pod audit surface read "none
  // registered" against a door that had it.
  const all = toolsQ.data?.tools ?? [];
  const podCaps: ToolCap[] = all.filter(
    (t) => typeof t.name === "string" && /^(audit_|ledger_|vant_audit_)/.test(t.name),
  );

  return (
    <div>
      <h1 className="text-lg font-semibold">Audit</h1>
      <p className="mt-1 text-sm text-ink-soft">
        This app's own audit ledger and the breakers it saw. The pod's own
        audit surface joins below IF the door registers audit tools -
        rendered through the shared panels either way.
      </p>

      <Inbox account={account} />

      <BreakerCard />

      <h2 className="mt-8 text-sm font-semibold">Pod audit tools</h2>
      {podCaps.length > 0 ? (
        podCaps.map((cap) => <ToolCall key={cap.name} name={cap.name} description={cap.description} />)
      ) : (
        <p className="mt-2 text-sm text-ink-soft">
          The door registers no audit_/ledger_ tools for this identity yet.
          The pod's own ledger surface stays an honest blank until it does.
        </p>
      )}
    </div>
  );
}

function Inbox({ account }: { account: { role: "admin" | "viewer" } | null }) {
  const [state, setState] = useState<InboxState>({ s: "idle" });
  const [attempt, setAttempt] = useState(0);

  const load = () => {
    if (!account) {
      setState({ s: "down", msg: "No live account session - the inbox is not readable anonymously." });
      return;
    }
    setState({ s: "loading" });
    fetch("/api/audit?limit=50")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { events?: AuditEvent[]; error?: string; detail?: string };
        if (res.ok && Array.isArray(data.events)) {
          setState({ s: "ok", events: data.events });
        } else {
          setState({
            s: "down",
            msg:
              data.error === "E_FORBIDDEN"
                ? "The audit inbox is admin-only; this identity is a viewer (typed 403, by design)."
                : (data.detail ?? data.error ?? `refused: HTTP ${res.status}`),
          });
        }
      })
      .catch(() => setState({ s: "down", msg: "Functions unreachable (undeployed or offline)." }));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, account?.role]);

  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <Help text="Events this dashboard recorded about ITSELF: OTP requests/verdicts, session lifecycles, bridge refusals. Two weeks cap, no PII (role + kind only). Admin-only by the door's rule - a viewer gets the 403 stated, never a quiet empty list.">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">Typed-error inbox (this app)</p>
      </Help>
      {state.s === "loading" ? <p className="text-sm text-ink-soft">Reading the ledger...</p> : null}
      {state.s === "down" ? <p className="text-sm text-ink-soft">{state.msg}</p> : null}
      {state.s === "ok" ? (
        state.events.length === 0 ? (
          <p className="text-sm text-ink-soft">
            The ledger is empty - either nothing notable happened or the
            store was just attached. This reads as received; nothing is
            invented to fill it.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {state.events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex items-center gap-3 rounded-md border border-line px-3 py-1.5 text-xs">
                <span className="font-mono text-[10px] text-ink-soft">{new Date(e.at).toISOString().slice(11, 19)}</span>
                <span className="font-medium">{e.kind}</span>
                <span className="ml-auto truncate font-mono text-[10px] text-ink-soft">{JSON.stringify(e.detail)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <button
        onClick={() => setAttempt((a) => a + 1)}
        disabled={state.s === "loading"}
        className="mt-3 rounded border border-line px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
      >
        Re-read
      </button>
    </div>
  );
}

interface BreakerRow {
  fails: number;
  state: string;
}

function BreakerCard() {
  const [state, setState] = useState<
    { s: "loading" } | { s: "ok"; data: { breakers?: Record<string, BreakerRow>; note?: string } | null } | { s: "down"; msg: string }
  >({ s: "loading" });

  useEffect(() => {
    breakers()
      .then((data) => setState({ s: "ok", data }))
      .catch((err: unknown) =>
        setState({ s: "down", msg: err instanceof ApiError ? err.message : String(err) }),
      );
  }, []);

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-4">
      <Help text="Per-property edge breakers (prd-web.md 3.6): five consecutive pod failures open one for 15s, half-open probes recover it. The breaker lives at the EDGE but the verdicts ride the pod.">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">Edge breakers</p>
      </Help>
      {state.s === "loading" ? <p className="text-sm text-ink-soft">Reading /api/breakers...</p> : null}
      {state.s === "down" ? <p className="text-sm text-ink-soft">{state.msg}</p> : null}
      {state.s === "ok" ? (
        state.data?.breakers && Object.keys(state.data.breakers).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(state.data.breakers).map(([property, b]) => (
              <span
                key={property}
                className={`rounded-md border px-2 py-1 text-xs font-mono ${
                  b.state === "open"
                    ? "border-err/50 bg-err/5 text-err"
                    : b.state === "degraded"
                      ? "border-accent/50 bg-accent/5 text-accent"
                      : "border-line text-ink-soft"
                }`}
              >
                {property}: {b.state} ({b.fails})
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            The edge reports no breaker activity (or none exposed yet).{state.data?.note ? ` ${state.data.note}` : ""}
          </p>
        )
      ) : null}
    </div>
  );
}
