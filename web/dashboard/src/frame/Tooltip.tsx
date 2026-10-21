import { Tooltip } from "@base-ui/react/tooltip";
import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { useApp } from "../state";

/**
 * The help layer (prd-web.md 10): ONE Tooltip primitive; Base UI is the
 * sole headless-primitive source (prd-web.md 2.6, owner round 3). Copy
 * sits NEXT TO the thing it explains. Gated by the settings toggle.
 */
export function Help({ text, children }: { text: string; children: React.ReactNode }) {
  const help = useApp((s) => s.help);
  // touch parity, take two (mobile report, brain.creadev.org): the original
  // fix relied on Base UI's own touch handling inside the trigger, which on
  // real phones opened AND instantly collapsed the tooltip (the vguest_ tab
  // report). A coarse pointer now OWNS the open state: controlled Root + a
  // click toggle that swallows Base UI's competing tap handling. Desktop
  // hover stays fully uncontrolled; tap-outside still closes via
  // onOpenChange(false). Hook stays above the help-state early return so
  // the call order never changes between renders.
  const [tapOpen, setTapOpen] = useState(false);
  if (!help) {
    return children;
  }
  const touch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
  return (
    <Tooltip.Root
      open={touch ? tapOpen : undefined}
      onOpenChange={touch ? (open: boolean) => setTapOpen(open) : undefined}
    >
      <Tooltip.Trigger
        render={(props: React.ComponentProps<"span">) => (
          <span
            {...props}
            role={"button"}
            tabIndex={0}
            aria-expanded={touch && tapOpen ? true : undefined}
            aria-label={`Help: ${text.slice(0, 60)}`}
            className="inline-flex cursor-help touch-manipulation select-none items-baseline gap-1 align-baseline"
            onClick={
              touch
                ? (e: React.MouseEvent<HTMLSpanElement>) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTapOpen((open) => !open);
                  }
                : props.onClick
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onClick?.(e as unknown as React.MouseEvent<HTMLSpanElement>);
              }
            }}
          >
            {children}
            <span
              aria-hidden
              className="grid size-4 place-items-center rounded-full border border-accent/50 text-[9px] font-semibold leading-none text-accent"
            >
              ?
            </span>
          </span>
        )}
      />
      <Tooltip.Portal>
        <Tooltip.Positioner align="end" sideOffset={6} className="z-50">
          <Tooltip.Popup className="max-w-72 rounded-md border border-line bg-surface p-2 text-xs text-ink-soft shadow-md">
            {text}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** The ONE modal system (prd-web.md 10) - Base UI Dialog wrapped once. */
export function Modal({
  title,
  open,
  onClose,
  children,
  detail,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** explanatory copy for the header (help-layer style) */
  detail?: string;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o: boolean) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]" />
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <Dialog.Popup className="w-full max-w-md rounded-lg border border-line bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
                {detail ? <Dialog.Description className="mt-0.5 text-xs text-ink-soft">{detail}</Dialog.Description> : null}
              </div>
              <Dialog.Close
                render={(props: React.ComponentProps<"button">) => (
                  <button {...props} aria-label="Close" className="rounded px-2 text-ink-soft hover:bg-ink/5">
                    x
                  </button>
                )}
              />
            </div>
            {children}
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
