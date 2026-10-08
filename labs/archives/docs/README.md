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
| MIGRATING-0.8.6.md (repo root) | Version-pinned cookbook for the 0.8.6 API breaks. Superseded: brain-layout migration now runs automatically on `vant start` (lib/migrations.js) and the maintained guide is docs/getting-started/migration.md. Stale on its own terms too: cites lib/framework.js callsites (file since deleted) and a long-outdated test count. Owner call, pass 136. |
| reference/CHANGELOG.md | Drifted fork of the root CHANGELOG.md — four different "v0.8.6" headings stitched together (2026-05-08 plus three Unreleased variants). Root CHANGELOG.md (rendered on GitHub) is canonical; the docs nav + reference index row now point there. |
| reference/deprecations.md | 2026-05-10 snapshot, half fiction: declared lib/brain.js REMOVED (it is the core module and still exists), claimed the stego message mode was removed (docs/memory/stego.md is canonical; encode/decode real), and steered Encrypt.encrypt/decrypt users toward aesGcm* while lib/encrypt.js keeps encrypt/decrypt as the primary exports. The true parts (lib/vector-store.js, lib/state.js, lib/repos.js merged into the Storage factory) are recorded in the changelog and docs/reference/storage.md. |
| essential/plugins.md | Advertised a plugin system that does not exist: `vant.use(plugin)`, a `plugins/` directory loader, and an npm plugin ecosystem (`npm install vant-my-plugin`, packages "vant-github" and "vant-linear"). Nothing in lib references plugins at all, and `vant.use` is not an export. The real extension surface is islands: docs/essential/extensibility.md and docs/essential/custom-island.md. |
| operations-notifications.md | Full fiction: documented `require('./lib/notifications')` with slack/discord/email/pushover/telegram channels, `broadcast()`, and `status()`. lib/notifications.js does not exist and no lib file mentions notifications; none of SLACK/DISCORD/PUSHOVER/SMTP env vars are read anywhere in lib/ or bin/. Vant's real outbound surfaces are the Telegram bot (bin/bot.js, TELEGRAM_BOT_TOKEN), in-process events (lib/event.js), and the webhooks system (bin/webhooks.js). Archived pass 142; operations/index + nav rows dropped, operations.md Notifications section rewritten to the real surfaces. |

Archived: 2026-10-06 (pass 130 docs power run; pass 133 added
memory/horcrux-bootstrap.md and advanced/architecture.md; pass 136 added
the 0.8.6-era trio MIGRATING-0.8.6.md, reference/CHANGELOG.md,
reference/deprecations.md; pass 140 added essential-plugins.md; pass 142
added operations-notifications.md).
Restoring one? `git mv` it back under `docs/`, fix its claims against the
current code, re-add frontmatter, and re-run the docs linters.
