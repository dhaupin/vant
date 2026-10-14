import { useState } from "react";
import { Modal } from "../../frame/Tooltip";
import { actions, useApp } from "../../state";

/**
 * The ONE modal system in use (Base UI Dialog behind the frame, 10):
 * an escalation-grade action always confirms with a typed modal.
 */
export function ConfirmationModal() {
  const [open, setOpen] = useState(false);
  const property = useApp((s) => s.property);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-err/40 px-3 py-1.5 text-sm text-err hover:bg-err/5"
      >
        Sign out (forget token)
      </button>
      <Modal
        title="Sign out?"
        open={open}
        onClose={() => setOpen(false)}
        detail="The token is memory-only - closing the tab does this too."
      >
        <p className="text-sm text-ink-soft">
          Drop the pasted token for property <span className="font-mono">{property}</span>?
          The dashboard returns to the login gate.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-ink/5"
          >
            Stay
          </button>
          <button
            onClick={() => {
              actions.setToken(property, null);
              setOpen(false);
            }}
            className="rounded-md bg-err px-3 py-1.5 text-sm text-paper hover:opacity-90"
          >
            Sign out
          </button>
        </div>
      </Modal>
    </>
  );
}
