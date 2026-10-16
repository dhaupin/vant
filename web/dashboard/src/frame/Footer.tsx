/**
 * Frame-owned footer (prd-web.md 10): the do-follow creadev.org plug,
 * the legal pages, and repo-docs cross-linking. On EVERY page, always -
 * no module can drop it because it is not a module surface at all.
 */
export function Footer() {
  return (
    <footer className="mt-8 border-t border-line px-4 py-4 text-xs text-ink-soft">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href="https://creadev.org"
          rel="dofollow"
          className="font-medium text-accent hover:underline"
        >
          creadev.org
        </a>
        <a href="/terms" className="hover:underline">
          Terms
        </a>
        <a href="/privacy" className="hover:underline">
          Privacy
        </a>
        <a
          href="https://github.com/dhaupin/vant"
          rel="noopener"
          className="hover:underline"
        >
          GitHub
        </a>
        <a
          href="https://docs.creadev.org/vant"
          rel="noopener"
          className="hover:underline"
        >
          Docs
        </a>
        <span className="ml-auto">
          Open-source, no warranty. The agents act; you approve. Use at your own risk.
        </span>
      </div>
    </footer>
  );
}
