import type { ReactNode } from "react";

/** The single spinner accent - no module ships an ad-hoc spinner (prd-web.md 10). */
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label ?? "loading"}
      style={{ width: size, height: size }}
      className="inline-block animate-spin rounded-full border-2 border-accent/25 border-t-accent"
    />
  );
}

/** Skeleton shimmer for panels - shapes, not decoration. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-ink/10 dark:bg-ink/15 ${className}`}
    />
  );
}

/** Panel skeleton: the standard shape every async view initially renders. */
export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div data-skeleton className="space-y-3">
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/** Long-operation progress bar (one accent). */
export function Progress({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
    >
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Honest empty state - sibling to the loading system. */
export function EmptyState({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 text-sm">
      <p className="font-medium">{title}</p>
      {detail ? detail : null}
    </div>
  );
}
