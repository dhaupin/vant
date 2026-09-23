# Vant Content Restructure — Product Requirements Document

**Version:** 1.0  
**Branch:** axolotl  
**Date:** 2026-09-23  
**Status:** Approved by dhaupin, pending implementation  
**Companion:** prd-brand.md (voice, naming, banned list)

---

## 1. Goal

The docs and lander predate the axolotl multibrain refactor and the memory
expansion. Outside labs/, most content is stale, misweighted, or describes
removed surfaces. This PRD restructures both public channels around the
locked positioning: agent memory first, agentic runtime second, agent-first
audiences throughout.

**Channels (both deploy automatically on push to main):**
- docs site: Jekyll + custom menu/search layer, frontmatter-driven.
  https://docs.creadev.org/vant/ (GitHub Pages)
- lander: single dist/index.html. https://vant.creadev.org (Cloudflare Pages)

## 2. Positioning hierarchy (locked)

1. **Memory first.** The brain is the product. Three memory systems:
   brain files (markdown), memory store (key-value and documents with TTL),
   brain search (semantic retrieval over the corpus: embeddings, rerank,
   citations for grounding). Plus horcrux (brain in an image) and geometry
   (experimental addressing).
2. **Runtime second.** Security chain (sandbox, validation, rate limiting,
   escrow), write-ahead journal, atomic writes, metrics, health.
3. **Git-native ownership.** Memory is plain files in the user's repo.
   Git features are product features: diff, blame, PR review, revert,
   branch-per-agent.
4. **Universality.** Any agent, any LLM, any harness. MCP for tool-using
   agents, plain files for everything else.
5. **Multi-brain and multi-agent.** Named brains with a stack, branch crews,
   succession and trust levels.

## 3. New docs IA (frontmatter contract)

Current: 111 files, deep nav_order integers, several dead pages. Target
structure and nav_order bands (10s stepping leaves room for inserts):

```
/                       docs/index.md                      0
/getting-started/       index, quick-start(11), install(12),
                        setup(13), agent-onboarding(14), faq(15)
/memory/                index(20), brain(21), memory-store(22),
                        search(23), citations(24), horcrux(25),
                        geometry(26), prune(27)
/runtime/               index(30), runtime(31), mcp(32), api(33),
                        server(34)
/multi-agent/           index(40), brains(41), branches(42),
                        succession(43), agents(44)
/operations/            index(50), storage(51), wal(52), events(53),
                        cache(54), cron(55), ci(56), metrics(57)
/security/              index(60), sandbox(61), gates(62), escrow(63),
                        sudo(64), rls(65)
/integrations/          index(70), github(71), agent-skills(72),
                        linear(73), docker(74), s3(75)
/reference/             index(80), cli(81), config(82), deprecations(83),
                        CHANGELOG.md(84)
/advanced/              index(90), search-architecture(91),
                        api-architecture(92), nsc9-spec(93),
                        rpc(94), style(95), troubleshooting(96)
```

**Rules:**
- nav_order is a single integer, no gaps under 10. permalink matches path.
- Every section has an index page: what is in this section, when to read
  which page, one command example.
- Frontmatter keys: version, permalink, layout, title, nav_order,
  description (hub and landing pages).
- No duplicate permalinks. Pages moved get a one-line pointer left behind
  ONLY if a stale link risk exists (GitHub README deep links); otherwise
  the old file is deleted, not stubbed.

**Dead or duplicate pages to fold:** docs/advanced/stego.md and
steganography.md (one page), essential/onboard.md and ai-onboard.md (one
page), advanced/framework.md (absorbed into runtime), advanced/frontend.md
(fold into lander notes or delete), essential/manual-brain.md (fold into
memory/brain), advanced/efficiency.md + pruning.md (fold into memory/prune),
MCP_THEME_RFC.md (move to labs or delete from public docs), integrations/
hybrid.md + providers.md + repos.md (consolidate into github.md + s3.md),
docs/tutorials/* (fold surviving tutorials into getting-started or the
owning section; the section itself dissolves).

**agent-onboarding.md (new):** the agent-first page. Wake sequence
(read brain, check migration status), working loop (learn, remember,
search), sleep sequence (write lessons, commit), MCP connect snippet, and
the AGENTS.md contract. Written to be executed by an agent with no human.

## 4. Content standards (per page)

- Opening: what this is, one sentence. Then a code receipt within the
  first screen.
- Every command: fenced, tagged, explainer sentence before it (what it
  does, what it needs).
- Claims trace to a module or command in the repo. No aspirational copy.
- Multibrain paths are canonical: models/public/<brain>/,
  models/private/<brain>/, stack in models/state.json. Flat layouts appear
  only inside migration notes.
- Version strings come from lib/version.js. Never hardcode in body text
  except CHANGELOG and migration history.
- Cross-reference style: relative markdown links between docs pages
  (Jekyll resolves them on Pages).

## 5. Channel scope

### docs site (S1-S9, S11)
Rewrite hub and hero. Rebuild getting-started. New memory/ section is the
center of gravity and gets the deepest treatment. Runtime and security get
accuracy passes against the current code. Reference/cli.md gets a
completeness sweep against bin/ help entries with corrected examples.
Stale counts (tool counts, file counts, test counts) become qualitative or
reference the source of truth instead of numbers.

### lander dist/index.html (S10)
Single-file rewrite preserving the existing head/meta/OG/sitemap contract
and JSON-LD structure where valid. Sections, in order: hero (tagline,
one-line what-it-is, two CTAs: install and MCP connect), three memory
systems, git ownership, runtime depth, multi-brain and agents, FAQ trimmed
to real questions, footer with docs and GitHub. No emoji, no em dashes,
no banned list words. The soul line appears once, in the hero or about
block, followed by the concrete disk-level explanation.

### README.md (S4)
Mirror of the lander hierarchy in GitHub-native form: positioning one
paragraph, memory systems table, two quick paths (human install, agent
MCP connect), feature table, migration section kept verbatim from current
(it is accurate and hard-won), docs links updated to new IA permalinks.

## 6. Sequencing

| Step | Scope | Depends on |
|------|-------|-----------|
| S1 | docs/index.md + positioning | PRDs |
| S2 | getting-started rebuild + new agent-onboarding | S1 |
| S3 | memory/ section (new) | S1 |
| S4 | README rewrite | S1 |
| S5 | multi-agent/ section (from essential) | S1 |
| S6 | runtime/ section | S1 |
| S7 | operations/ + security/ accuracy passes | S1 |
| S8 | integrations/ consolidation | S1 |
| S9 | reference/ + dead-page folding + frontmatter sweep | S2-S8 |
| S10 | lander rewrite | PRDs (independent of docs) |
| S11 | AGENTS.md cross-check against new IA | S9 |
| S12 | full verification + handoff + push | all |

## 7. Verification

- `node test/docs.test.js` green (frontmatter, permalinks, link targets).
- Grep gates: zero banned phrases, zero em dashes, zero emoji in docs/ and
  dist/index.html (labs/ exempt). Zero backronym instances on public surfaces.
- Every permalink resolves; every internal link target exists.
- All fences tagged; spot-check that no code block lacks an explainer.
- Labs handoff: TASKS.md session block + MEM wipe per convention.

## 8. Non-goals

- No code changes. Docs and lander only (labs PRDs excepted).
- No new CI workflows; existing docs.yml deploys on main push as-is.
- No translation, no blog, no tutorials expansion beyond folding.
- The lander stays a single static file; no framework introduction.
