# Docs Archive

Retired docs pages, preserved for history. Nothing here is linked from the
docs site nav, and nothing here should be trusted as current - each page was
archived because it documented something that never existed, something that
was removed, or a duplicate of a better-maintained page.

| Page | Why it was retired |
|------|--------------------|
| getting-started/omega-init.md | The "one prompt to bootstrap anywhere" experiment. Documented a boot flow (`.agent-brain` dirs, `npm start`, `vant load` as bootstrap) that no shipped version used. A fun artifact, not a doc. |
| advanced/framework.md | Documented `lib/framework.js`, which was deleted and merged into `lib/vant.js` (compute + embed now live there). |
| advanced/frontend.md | Advertised `vant-js-sdk` / `vant-python-sdk` client SDKs. No such packages exist in this repo or on npm. |
| reference/api.md | Advertised a `require('vant').runtime / .ipc / .agents / .brain / .search / .islands` module surface. None of those exports exist in `lib/vant.js`. The honest API reference is the Runtime API Reference page in docs. |
| advanced/schema.md | Duplicate of docs/reference/schema.md, which is the maintained, accurate schema page. |

Archived: 2026-10-06 (pass 130, docs power run on axolotl).
Restoring one? `git mv` it back under `docs/`, fix its claims against the
current code, re-add frontmatter, and re-run the docs linters.
