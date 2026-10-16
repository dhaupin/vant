import { useEffect, useState } from "react";
import { exec, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { useApp } from "../../state";

/**
 * Module: guests (catalog #12, Tier S) — P3 owner-seat rung.
 * The door's REAL guest surface is the contract (probed live 2026-10-16):
 *   guest_issue  { name, role?, scopeOwner?, trustLevel?, expires? }
 *                -> { token, guest }  (the raw token rides ONE response —
 *                hashed at rest — so this page shows it once and then
 *                honestly forgets it; a reload cannot bring it back)
 *   guest_list   {} -> { guests: [<public projections>] }
 *   guest_revoke { id } (denylist-backed: dead at once in every process)
 * Guest-issue/list/revoke are ADMIN-ONLY at the door; a guest seat sees
 * the typed refusal, rendered verbatim. No sample roster is ever drawn.
 */

interface Guest {
  id: string;
  name?: string;
  role?: string;
  scopeOwner?: string | null;
  trustLevel?: string;
  createdAt?: number;
  expiresAt?: number | null;
  lastSeenAt?: number | null;
  revokedAt?: string | null;
}

const ROLES = ["observer", "human", "agent"] as const;
const TRUSTS = ["high", "medium", "low", "none"] as const;

export default function Guests() {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const toolsQ = useToolsQuery();
  const caps = toolsQ.isSuccess ? toolsByPrefix(toolsQ.data, "guest_") : [];
  const has = (n: string) => caps.some((c) => c.name === n);

  return (
    <div>
      <h1 className="text-lg font-semibold">Guests</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Guest lifecycle over the door's real guest_ tools. Identities are
        hashed at rest — issue shows the raw token exactly once, and this
        page forgets it on the next load, exactly like the ledger does.
      </p>

      {toolsQ.isError ? (
        (() => {
          const e = toolsQ.error as ApiError;
          return e.kind === "network"
            ? <NotConnected why="The bridge is unreachable, so the guest surface cannot load." />
            : <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
        })()
      ) : null}
      {toolsQ.isSuccess && caps.length === 0 ? (
        <NotConnected why="The door answered but exposes no guest_ tools to this identity. Guest lifecycle stays on the pod CLI (vant guest issue/list/revoke) until a pod confirms its surface here." />
      ) : null}

      {has("guest_list") ? <Roster readGuard={!token ? "load-only" : undefined} /> : null}
      {has("guest_issue") ? <IssueForm adminGuard={!token} /> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- roster */

async function callGuests<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const r = (await exec(name, args)) as { result?: T } & Record<string, unknown>;
  // The door wraps tool payloads in { result }; tolerate unwrapped too.
  return (r && typeof r === "object" && "result" in r ? (r.result as T) : (r as unknown as T));
}

function Roster({ readGuard }: { readGuard?: string }) {
  const [rows, setRows] = useState<Guest[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "refused">("loading");
  const [refusal, setRefusal] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokedName, setRevokedName] = useState("");

  const load = async () => {
    setState("loading");
    try {
      const r = await callGuests<{ guests?: Guest[] }>("guest_list", {});
      setRows(Array.isArray(r?.guests) ? r.guests : []);
      setState("ok");
    } catch (err) {
      setRefusal(err instanceof ApiError ? err.message : "the door did not answer");
      setState("refused");
    }
  };

  useEffect(() => { void load(); }, []);

  const revoke = async (id: string, label: string) => {
    setBusyId(id);
    try {
      const r = await callGuests<{ revoked?: boolean }>("guest_revoke", { id });
      // The door answers { revoked: false } for an unknown id — honor the
      // typed verdict instead of a blanket success (no fake confirmations).
      if (r?.revoked === false) {
        setRefusal(`the door did not revoke ${id} (unknown or already-gone id — the roster is the truth)`);
        setState("refused");
      } else {
        setRevokedName(label);
        await load();
      }
    } catch (err) {
      setRefusal(err instanceof ApiError ? err.message : "the revoke did not reach the door");
      setState("refused");
    } finally {
      setBusyId(null);
    }
  };

  if (state === "refused") {
    return (
      <div className="mt-4">
        <Refusal error={{ message: refusal, status: 403 }} onRetry={() => void load()} />
        <p className="mt-2 text-xs text-ink-soft">
          guest_list is admin-only: a guest seat is exactly the caller the
          door refuses here (revoke is the same law).
        </p>
        {readGuard ? (
          <p className="mt-1 text-xs text-ink-soft">
            No pasted identity on this load ({readGuard}) — the door answers
            nothing without one, honestly.
          </p>
        ) : null}
      </div>
    );
  }

  if (state === "loading" || rows === null) {
    return <p className="mt-4 text-sm text-ink-soft">Reading the roster from the door…</p>;
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          roster ({rows.length}{rows.length === 1 ? " identity" : " identities"})
        </p>
        <button type="button" onClick={() => void load()} className="text-xs text-ink-soft underline hover:text-ink">
          refresh
        </button>
      </div>
      {revokedName ? (
        <p className="mt-2 rounded-md border border-moss/40 bg-moss/10 px-3 py-1.5 text-xs text-moss">
          Revoked <span className="font-mono">{revokedName}</span> — denylist-backed: dead at once in every future process.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">The roster is honestly empty — no guest identities on this pod yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
          {rows.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-medium">{g.name ?? g.id}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
                {g.role ?? "?"}
              </span>
              {g.trustLevel ? (
                <span className="text-[10px] text-ink-soft">trust {g.trustLevel}</span>
              ) : null}
              {g.scopeOwner ? (
                <span className="font-mono text-[10px] text-accent">scope {g.scopeOwner}</span>
              ) : null}
              {g.expiresAt ? (
                <span className="text-[10px] text-ink-soft">expires {new Date(g.expiresAt).toLocaleString()}</span>
              ) : (typeof g.revokedAt === "string" ? (
                <span className="text-[10px] text-err">revoked {g.revokedAt}</span>
              ) : (
                <span className="text-[10px] text-moss">active</span>
              ))}
              {g.lastSeenAt ? (
                <span className="text-[10px] text-ink-soft">seen {new Date(g.lastSeenAt).toLocaleString()}</span>
              ) : null}
              <span className="font-mono text-[10px] text-ink-soft">{g.id}</span>
              <button
                type="button"
                onClick={() => void revoke(g.id, g.name ?? g.id)}
                disabled={busyId === g.id}
                className="ml-auto rounded border border-err/40 px-2 py-0.5 text-xs text-err hover:bg-err/5 disabled:opacity-50"
              >
                {busyId === g.id ? "revoking…" : "revoke"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- issuer */

function IssueForm({ adminGuard }: { adminGuard?: boolean }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("observer");
  const [trust, setTrust] = useState<(typeof TRUSTS)[number]>("medium");
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [shownToken, setShownToken] = useState<string | null>(null);
  const [shownGuest, setShownGuest] = useState<string>("");
  const [refusal, setRefusal] = useState("");

  const issue = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setRefusal("");
    const args: Record<string, unknown> = { name: clean, role, trustLevel: trust };
    if (scope.trim()) args.scopeOwner = scope.trim();
    try {
      const r = await callGuests<{ token?: string; guest?: Guest; code?: string; error?: string }>(
        "guest_issue",
        args,
      );
      if (r?.error) {
        setRefusal(String(r.error));
      } else if (r?.token) {
        setShownToken(r.token); // shown ONCE; never stored in any state but this
        setShownGuest(r.guest?.name ?? clean);
        setName("");
        setScope("");
      }
    } catch (err) {
      setRefusal(err instanceof ApiError ? err.message : "the door did not answer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">issue identity</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void issue(); }}
          placeholder="guest name"
          spellCheck={false}
          className="min-w-40 flex-1 rounded border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-accent"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
          className="rounded border border-line bg-paper px-2 py-1 text-sm">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={trust} onChange={(e) => setTrust(e.target.value as (typeof TRUSTS)[number])}
          className="rounded border border-line bg-paper px-2 py-1 text-sm">
          {TRUSTS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="scopeOwner (optional, e.g. team:alpha)"
          spellCheck={false}
          className="w-full rounded border border-line bg-paper px-2 py-1 font-mono text-xs outline-none focus:border-accent sm:w-64"
        />
        <button
          type="button"
          onClick={issue}
          disabled={busy || !name.trim()}
          className="rounded bg-accent px-3 py-1 text-sm text-paper hover:bg-accent-deep disabled:opacity-50"
        >
          {busy ? "issuing…" : "Issue"}
        </button>
      </div>
      {adminGuard ? (
        <p className="mt-2 text-xs text-ink-soft">
          Heads-up: guest_issue is admin-only at the door — a guest seat will
          read the typed refusal in place, and that is the honest answer.
        </p>
      ) : null}
      {refusal ? (
        <p className="mt-2 rounded-md border border-err/40 bg-err/5 px-3 py-2 text-xs text-err">
          {refusal}
        </p>
      ) : null}
      {shownToken ? (
        <div className="mt-3 rounded-md border border-accent/40 bg-accent/5 p-3">
          <p className="text-xs font-medium text-accent">
            Token for {shownGuest} — SHOWN ONCE. Hashed at rest in the ledger;
            this page forgets it on the next render. Copy it now.
          </p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded border border-line bg-paper p-2 font-mono text-xs">
            {shownToken}
          </pre>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => { void navigator.clipboard?.writeText(shownToken); }}
              className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5"
            >
              Copy token
            </button>
            <button
              type="button"
              onClick={() => setShownToken(null)}
              className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5"
            >
              I copied it — hide forever
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
