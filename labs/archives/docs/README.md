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
| memory/horcrux-bootstrap.md | Consolidated into docs/memory/horcrux.md ("Zero-config boot from an image" section). Horcrux and stego each keep one canonical doc; this split page was the confusion. |
| advanced/architecture.md | Consolidated into docs/essential/architecture.md ("The API surface" section absorbed the ownership model); the rest was stale (flat pre-multibrain models tree, dead links). Architecture is now one canonical page in Essential. |
| advanced/citations.md | Duplicate of docs/memory/citations.md - identical subject, identical API table (both verified against lib/citations.js exports). Older copy archived; inbound links retargeted. |
| advanced/pruning.md | Duplicate of docs/memory/prune.md. Its extra depth (daemon mode, stats, list flags) is REAL (bin/prune.js -D/-s/-l all exist) but was absorbed into the canonical page rather than kept as a split doc. |
| advanced/search.md | Overlap of docs/memory/search.md with real depth (hybrid/HyDE modes, MCP tools, rehydration settings) PLUS fiction: searchLTC and getCacheStats/clearCache/rehydrate do not exist in lib/search.js, the documented vant_search {mode,files} schema does not match the registered tool (query+limit only; hybrid/hyde are separate tools), lib/query.js does not exist, and the "Requires LTC / 50KB max" caveats contradicted lib defaults. Verified content absorbed into memory/search.md with the fiction corrected or dropped. |
| operations/deployment.md | Duplicate of docs/getting-started/deploy.md, which is the canonical deployment guide (backed by repo DEPLOY.md). Older tutorial copy archived; inbound links retargeted. |

Archived: 2026-10-06 (pass 130 docs power run; pass 133 added
memory/horcrux-bootstrap.md and advanced/architecture.md).
Restoring one? `git mv` it back under `docs/`, fix its claims against the
current code, re-add frontmatter, and re-run the docs linters.
