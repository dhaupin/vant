import { useEffect, useState } from "react";
import { ApiError, setUserStatus, users } from "../../api";
import { Help, Modal } from "../../frame/Tooltip";

/**
 * Module: users (catalog #13 at /users, Tier S, phase P3 - now REAL).
 * The dashboard's OWN account admin (prd-web.md 3.5), distinct from pod
 * guests: the roster rides /api/users (admin-only), mutations ride
 * /api/users/set-status with the door's self-disable guard. The email
 * is stored HASHED server-side; the roster shows the hash and never
 * expands it. Viewer identities get the typed 403 stated verbatim.
 */

interface AccountRow {
  emailHash: string;
  role: "admin" | "viewer";
  status: "active" | "disabled";
  created: number;
}

type State =
  | { s: "loading" }
  | { s: "ok"; rows: AccountRow[] }
  | { s: "down"; msg: string };

export default function Users() {
  const [state, setState] = useState<State>({ s: "loading" });
  const [confirm, setConfirm] = useState<{ row: AccountRow; next: "active" | "disabled" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setState({ s: "loading" });
    users()
      .then((data: { users?: AccountRow[] }) => setState({ s: "ok", rows: data.users ?? [] }))
      .catch((err: ApiError) =>
        setState({
          s: "down",
          msg: err.message,
        }),
      );
  };

  useEffect(load, []);

  const applyStatus = async () => {
    if (!confirm) return;
    setBusy(true);
    setNotice(null);
    try {
      await setUserStatus(confirm.row.emailHash, confirm.next);
      setConfirm(null);
      load();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : String(err));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-lg font-semibold">Users</h1>
      <p className="mt-1 text-sm text-ink-soft">
        The dashboard's own accounts (email-OTP sign-ins), not pod guest
        identities. Emails live as HASHES server-side; the hash shown is
        the identity, it never expands back. First verified account on a
        deployment bootstraps admin.
      </p>

      <div className="mt-6 rounded-lg border border-line bg-surface p-4">
        <Help text="Roster from GET /api/users: admin-only by the door's rule - a viewer identity receives the typed 403 stated, never a quiet empty table. Disable = every gate refuses that account (verify, session probe, bound tokens, audit) until re-enabled.">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">Account roster</p>
        </Help>

        {state.s === "loading" ? <p className="text-sm text-ink-soft">Reading the roster...</p> : null}
        {state.s === "down" ? (
          <p className="text-sm text-ink-soft">
            {state.msg.includes("E_FORBIDDEN")
              ? "This roster is admin-only; your identity is a viewer (typed 403, by design)."
              : state.msg}
          </p>
        ) : null}
        {state.s === "ok" && state.rows.length === 0 ? (
          <p className="text-sm text-ink-soft">No accounts yet - the first email-code sign-in creates one.</p>
        ) : null}
        {state.s === "ok" && state.rows.length > 0 ? (
          <ul className="space-y-1.5">
            {state.rows.map((row) => (
              <li
                key={row.emailHash}
                className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-1.5 text-xs"
              >
                <span className="font-mono text-[11px]">{row.emailHash.slice(0, 12)}...</span>
                <RoleChip role={row.role} />
                <span
                  className={`rounded border px-1.5 py-0.5 ${
                    row.status === "active"
                      ? "border-line text-ink-soft"
                      : "border-err/50 bg-err/5 text-err"
                  }`}
                >
                  {row.status}
                </span>
                <span className="ml-auto font-mono text-[10px] text-ink-soft">
                  {new Date(row.created).toISOString().slice(0, 10)}
                </span>
                <button
                  onClick={() => setConfirm({ row, next: row.status === "active" ? "disabled" : "active" })}
                  className="rounded border border-line px-2 py-0.5 hover:bg-ink/5"
                >
                  {row.status === "active" ? "Disable" : "Enable"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {notice ? <p className="mt-3 text-xs text-err">{notice}</p> : null}
        <button
          onClick={load}
          disabled={state.s === "loading"}
          className="mt-3 rounded border border-line px-2 py-1 text-xs hover:bg-ink/5 disabled:opacity-50"
        >
          Re-read
        </button>
      </div>

      <Modal
        title={confirm?.next === "disabled" ? "Disable this account?" : "Re-enable this account?"}
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        detail={
          confirm?.next === "disabled"
            ? "Every gate refuses this account until an admin re-enables it."
            : "The account can sign in again immediately."
        }
      >
        <p className="text-sm text-ink-soft">
          Account <span className="font-mono">{confirm?.row.emailHash.slice(0, 12)}...</span> goes{" "}
          <span className="font-mono">{confirm?.next}</span>.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setConfirm(null)}
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-ink/5"
          >
            Stay
          </button>
          <button
            onClick={() => void applyStatus()}
            disabled={busy}
            className={`rounded-md px-3 py-1.5 text-sm text-paper disabled:opacity-50 ${
              confirm?.next === "disabled" ? "bg-err hover:opacity-90" : "bg-accent hover:bg-accent-deep"
            }`}
          >
            {busy ? "Working..." : confirm?.next === "disabled" ? "Disable" : "Enable"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function RoleChip({ role }: { role: "admin" | "viewer" }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-medium ${
        role === "admin" ? "border-accent/50 bg-accent/5 text-accent" : "border-line text-ink-soft"
      }`}
    >
      {role}
    </span>
  );
}
