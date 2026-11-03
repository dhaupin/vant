import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Modal — the homebrew dialog (wave 19.28, no deps). One card on a scrim:
 * Escape closes, the scrim closes, the close button closes, body scroll
 * locks while open, and focus moves to the card on open (the sign-in form
 * takes it from there). Deliberately tiny: the lander needs ONE modal,
 * not a modal library.
 */
export function Modal({
  title,
  onClose,
  children,
  width = "max-w-sm",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4"
      data-testid="lander-modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${width} rounded-lg border border-line bg-surface p-4 shadow-lg outline-none`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{title}</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-soft hover:bg-ink/5"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** One mount-toggled modal with its open state owned by the caller. */
export function useModal(): { open: boolean; show: () => void; hide: () => void } {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}
