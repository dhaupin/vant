import { useState } from "react";
import { Modal } from "../../frame/Tooltip";
import { actions, useApp } from "../../state";

/**
 * The ONE modal system in use (Base UI Dialog behind the frame, 10):
 * an escalation-grade action always confirms with a typed modal.
 * Sign-out (prd-web.md 3.5): with a live email-OTP account, the
 * SERVER-SIDE session is destroyed (best-effort; the cookie is cleared
 * by the response either way) and bound tokens drop with it - the
 * session WAS their server home. The pasted-token-fallback mode keeps
 * its old memory-only sign-out.
 */
export function ConfirmationModal() {
  const [open, setOpen] = useState(false);
  const property = useApp((s) => s.property);
  const account = useApp((s) => s.account);

  const signOut = async () => {
    if (account) {
      try {
        await fetch("/api/auth/session", { method: "DELETE" });
      } catch {
        // store unreachable: the local state still clears; the server
        // session expires on its own TTL
      }
      actions.clearAccount();
    } else {
      actions.setToken(property, null);
    }
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-err/40 px-3 py-1.5 text-sm text-err hover:bg-err/5"
      >
        {account ? "Sign out (end session)" : "Sign out (forget token)"}
      </button>
      <Modal
        title="Sign out?"
        open={open}
        onClose={() => setOpen(false)}
        detail={
          account
            ? "The server-side session (any bound pod tokens with it) is destroyed."
            : "The token is memory-only - closing the tab does this too."
        }
      >
        <p className="text-sm text-ink-soft">
          {account ? (
            <>
              End the account session? Any pod tokens bound server-side
              go with it; the dashboard returns to the login gate.
            </>
          ) : (
            <>
              Drop the pasted token for property{" "}
              <span className="font-mono">{property}</span>? The dashboard
              returns to the login gate.
            </>
          )}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-ink/5"
          >
            Stay
          </button>
          <button
            onClick={() => void signOut()}
            className="rounded-md bg-err px-3 py-1.5 text-sm text-paper hover:opacity-90"
          >
            Sign out
          </button>
        </div>
      </Modal>
    </>
  );
}
