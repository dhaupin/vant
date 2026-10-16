import { Link } from "@tanstack/react-router";

/** Themed 404 (prd-web.md 3.3 rule 8): honest copy + recovery paths. */
export default function NotFound() {
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <p className="font-mono text-xs text-ink-soft">404</p>
      <h1 className="mt-1 text-lg font-semibold">No module lives at this route</h1>
      <p className="mt-2 max-w-lg text-sm text-ink-soft">
        Either the module does not exist (yet - the catalog grows), or the
        route is mistyped. The registry decides what exists; nothing is
        hidden.
      </p>
      <div className="mt-4 flex gap-3 text-sm">
        <Link to="/" className="rounded-md bg-accent px-3 py-1.5 text-paper hover:bg-accent-deep">
          Back to the live board
        </Link>
        <Link to="/settings" className="rounded-md border border-line px-3 py-1.5 hover:bg-ink/5">
          Settings
        </Link>
      </div>
    </div>
  );
}
