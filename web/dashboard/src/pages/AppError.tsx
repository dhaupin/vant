import { Link } from "@tanstack/react-router";

/** Themed app error page (prd-web.md 3.3 rule 8): recovery, not scare copy. */
export default function AppError() {
  return (
    <div className="rounded-lg border border-err/40 bg-err/5 p-6">
      <p className="font-mono text-xs text-err">error</p>
      <h1 className="mt-1 text-lg font-semibold">Something broke at the edge</h1>
      <p className="mt-2 max-w-lg text-sm text-ink-soft">
        The dashboard hit an error it could not recover from on its own.
        The status page shows whether the pod bridge or a function
        endpoint is down. Reloading is honest: it starts a fresh session
        and you re-paste the token.
      </p>
      <div className="mt-4 flex gap-3 text-sm">
        <Link to="/status" className="rounded-md bg-accent px-3 py-1.5 text-paper hover:bg-accent-deep">
          Check status
        </Link>
        <a
          href="https://github.com/dhaupin/vant/issues"
          rel="noopener"
          className="rounded-md border border-line px-3 py-1.5 hover:bg-ink/5"
        >
          Report on GitHub
        </a>
      </div>
    </div>
  );
}
