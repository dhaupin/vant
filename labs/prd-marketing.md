# Vant Marketing & Adoption — Product Requirements Document

**Version:** 1.0 **Branch:** axolotl **Date:** 2026-10-21 **Status:** Drafted from pass 322 funnel review, pending owner approval **Companion:** prd-brand.md (voice + naming — the rules here inherit it), prd-content.md (docs IA)

---

## 1. Goal

The docs and lander tell the story well. What leaks is the step between "reader" and "running install": the usability layer. This PRD pre-makes the decisions for every known funnel gap so each ships as one focused pass without re-deriving the rationale, re-arguing tradeoffs, or re-discovering the npm name collision every time.

**Non-goals up front:** no paid channels, no SEO games, no blog, no social presence, no demo servers. Vant's sales motion is the repo itself; this PRD only removes friction from it.

## 2. The funnel (locked)

```
  lander / README / docs
        │  "what is it"  (WELL COVERED — prd-brand + prd-content)
        ▼
  30-second proof        ← GAP 1: show, don't tell
        ▼
  install                ← GAP 2: the one-liner (npm scale name)
        ▼
  first connection       ← GAP 3: copy-paste MCP client configs
        ▼
  spreading use          ← GAP 4: AGENTS.md adoption snippet
        ▼
  "what am I committing?"← GAP 5: the brain, shown inline
```

Rule: a fix narrows exactly one tier. Nothing upstream gets rewritten to fix something downstream.

**Brand line (owner directive 2026-10-23):** the funnel speaks the adopted tagline **"Trusting the universe, but with receipts"** (prd-brand.md §6). The motto rides fixed surfaces only (hero kicker, footer closer, README epigraph, docs hub quote, brain "THE WAY"); tier copy stays verifiable and descriptor-led. "Receipts" is a literal test claim: the gates and packs are the receipts, so the line survives the claims-are-checkable rule (prd-brand §3.6) by pointing at them.

**The brand forms ladder (owner directive 2026-10-23).** Every brand has its forms: a slogan, a prose form, a short form, and a long form. Vant's ladder, top to bottom:

| Form | What it is | Where it rides |
|---|---|---|
| **Slogan** | "Trusting the universe, but with receipts" (prd-brand §6) | hero kicker, footer closer, README epigraph, docs hub, brain "THE WAY" |
| **Prose** | "Versatile Autonomous Networked Tool" — the bizarre luck of this brand: the long PROSE form IS the acronym | LEGAL.md license notice + ROADMAP.md identity line (prd-brand §2 KEEP-forever); never quoted on tier copy |
| **Short** | Vant in prose, `vant` in code | EVERY funnel surface; the only form a tier is allowed to carry |
| **Long** | the descriptive claim family: "Agent memory that lives in your repo." (prd-brand §6 candidate 1) + the SEO descriptions | hero/H1 adjacents, meta descriptions, feature-table intro |

The prose form is WHY the brand never outgrows its name (the broad wording is the claim), and it doubles as the legal record: LEGAL.md's license notice and ROADMAP.md's identity line are the sanctioned appearances, and any future trademark or licensing filing pulls the expansion from that record rather than re-deriving it. Funnel copy never spells it out — the name is simply Vant — but the record lives above us and nothing in this funnel may shorten, re-spell, or retcon it (exact spelling "Versatile"; the misspelling guard in prd-brand §2 applies).

**The graduation (owner directive 2026-10-23, "everywhere").** The funnel is positioned as **the memory-first agent OS** (prd-brand §1 graduated). Rules unchanged beneath the graduation: tier 1 still leads with the brain (memory is the door), depth tiers speak the layer (transports, governance, runtime) and every layer claim maps to modules via the architecture page's layer map. The forms ladder above is untouched: the short form remains simply Vant, no command or code ever spells "OS", and the motto keeps its fixed surfaces.

## 3. GAP 2 — Installability (the structural unlock, ship first)

**Situation:** the npm name `vant` is owned by an unrelated Vue UI library (owner chenjiahan, active). Every surface carries an awkward parenthetical confessing this, and the "5 minute path" is four commands (clone, cd, npm ci, vant start).

**Decision (pre-made, override only with a filed note here):** publish to npm under the scoped name `@vant/cli`.

- `npx @vant/cli start` becomes the entire install story.
- The unscoped-`vant` disclaimer disappears from README, home page, install docs, and the home JSON-LD HowToStep — replaced by the one no-op sentence "the unscoped `vant` package is unrelated" at most once per surface, only where confusion is likely (install.md, README).
- Name candidates checked in priority order: `@vant/cli`, then `@vant-brain/cli`, then `@vant-memory/cli`. Register whichever is free; every reference then reads that literal.
- Unscoped-package squatting (e.g. requesting takedown of the Vue library) is a never. Scoped publishing makes it unnecessary and the Vue project is innocent.

**Implementation shape (one pass):**
- New `npm:` publish path in CI (ci.yml): on version tag, `npm publish --access public` with provenance. package.json needs `publishConfig`, correct `files:` allowlist (bin/, lib/, models/public/ seed files, docs/ NOT included), and a bin map unchanged (`vant`, `mcp`).
- Note: package.json `author` email is a placeholder (`vant@example.com`); fix to the real maintainer address at publish time, not before.
- Surface updates: hero terminal block (home), README quick start, install.md, FAQ "is it on npm" answer, JSON-LD HowToStep, docs truth gates that may pin the clone path.

**Acceptance:** `npx @vant/cli --version` works in a scratch dir with zero git steps; no `clone && cd && npm ci` remains in any hero/quickstart surface; publish workflow green on a dry tag.

## 4. GAP 1 — Show, don't tell (proof assets)

**Situation:** the only visual asset is vant-og.png. Claims like "the lattice is your agent's memory graph. Drag it" ask for belief without evidence. The wake loop, the thing that IS the product, has never been seen by anyone without a terminal and 40MB of node_modules.

**Decision:** two artifacts, both self-hosted (repo-tracked, no third-party hosting dependencies):

| Artifact | Content | Placed |
|----------|---------|--------|
| `<web/home/assets/wake-loop.(cast|svg|png)>` | terminal capture: `vant onboard wake` → identity/goals/lessons load lines → prompt | home §02 Five minutes, under the install block |
| `<web/home/assets/lattice.(gif|mp4)>` | 8-12s: lattice drag, pulses landing, a lesson arriving | home hero right column or under the drag-hint line |

- Preferred capture format: asciinema `.cast` rendered via `asciinema-player` vendored, OR rendered-to-SVG/PNG stills (svg-term). No external CDN scripts; the one-way web/ boundary law applies to player assets too.
- og:image gets a refresh only after the lattice capture exists: the current OG tile and the actual hero should show the same product.
- Voice rules apply to captions: no emoji, no banned words, one sentence.

**Acceptance:** both assets render on vant.creadev.org on mobile data speeds (<500KB each preferred, hard cap 2MB); the home gate (check-home six checks) extended to confirm local-asset references resolve; no new external requests introduced.

## 5. GAP 3 — Copy-paste MCP client configs

**Situation:** docs/runtime/mcp.md §Connect a client says clients "speak stdio" and points at prose. A curious reader must hand-derive a JSON block. This is the highest-friction moment for tool-using agents, which are the primary audience.

**Decision:** add a "Connect your client" section to docs/runtime/mcp.md (and link from docs/getting-started/agent-onboarding.md) with ready-made fenced blocks, each with a one-sentence explainer per prd-brand §4:

- Claude Desktop (`claude_desktop_config.json` mcpServers block)
- Cursor (`~/.cursor/mcp.json` block)
- Generic stdio MCP (the same shape, labeled "any other stdio client")
- HTTP door (localhost:3457) example for raw-HTTP callers — already documented, just given the same copy-paste treatment

**Truth constraints:** every snippet must be against current behavior (command `vant mcp` or the installed bin path; port 3457; auth optional locally, x-api-key when requireKey). Snippets get checked by the docs truth gates as fenced `\`\`\`json` blocks — no orphan blocks.

**Acceptance:** a reader can go from zero to "vant tools listed in Claude Desktop" with exactly two copy-pastes (config + a CLI start); docs tests and coverage gates green.

## 6. GAP 4 — AGENTS.md adoption snippet

**Situation:** the most stubborn growth loop in agent tooling is proliferating via agents.md files (agent-facing READMEs) across user repos. Vant has no packaged block for it; every adopting human hand-writes their agent's vant instructions.

**Decision:** ship a canonical copy-paste fragment. Location:
- New docs page `docs/integrations/agents-md.md` (or folded into agent-onboarding if IA review prefers — pick ONE and record in implementation notes) — nav_order per IA bands.
- Root `AGENTS.md` links to it as "use us" advertisement: the repo already lives by it; the page exports the pattern.

**The fragment contract (locked):**
```
## Persistent memory (Vant)
- On session start: run vant onboard wake; read identity, goals, lessons.
- While working: use vant search <query> instead of re-deriving facts.
- On finish: write what changed to models/private/<brain>/ per the brain
  layout, then commit your brain files (there is no onboard sleep verb
  yet — files + commit ARE the sleep ceremony).
- Autonomy: check models/private/_succession.json trust level before
  acting without a human.
```

Source of truth for verbs: bin/onboard.js routed verbs (status, wake, summary, files, read, search, system, help — verified on the real CLI in pass docs). If a verb changes, this fragment changes in the same pass. The sleep line must reference only mechanisms that exist; if a real sleep verb ships, the fragment and this PRD note update together.

**Acceptance:** an agent given ONLY this fragment, on a repo with vant installed, can complete one wake/learn/sleep cycle; docs IA gates stay green; the fragment stays under 15 lines.

## 7. GAP 5 — The brain, shown inline

**Situation:** the top unspoken objection is "what exactly am I committing to my repo?" The home page answers in prose. The actual files in models/public/vant/ are the answer.

**Decision:** add one collapsible detail block (`<details>`) on the home page FAQ section: an abridged, curated rendering of a real brain file set — identity.md opening lines, a few lines from lessons.md, one entry from errors.md. NOT fetched from GitHub at runtime (static, inlined at build/edit time, consistent with the home page being a checked-in artifact). Label it clearly as sample copy, sourced from vant's own public brain.

**Truth constraint:** every line shown must actually exist in a tracked file; the sample says which files it excerpts. Refresh cadence: at version bumps only, by edit, not dynamically.

**Acceptance:** the details block passes the home gate; all quoted lines exist in current tracked files (checked at CI time with a presence lint in check-home if cheap, else noted as manual review).

## 8. Sequencing

| Step | Scope | Depends on |
|------|-------|-----------|
| M1 | GAP 3: MCP client configs (docs only, cheap) | — |
| M2 | GAP 4: AGENTS.md snippet page | — |
| M3 | GAP 2: npm scoped publish + surface one-liner rewrites | owner confirm name; needs npm account token in CI |
| M4 | GAP 1: proof assets | a screen-record session; example: existing cast assets available first |
| M5 | GAP 5: inline brain sample | M4's page layout calm |

M1/M2 are a single-focus afternoon each and untouched by anything else. M3 is the fork in the roadmap: everything downstream (hero blocks, docs gates) reads differently after it. M4/M5 are polish that should not block M3.

## 9. Decision log (append-only)

- 2026-10-21: `@vant/cli` chosen as publish path; unscoped `vant` squatting declined; Vue library left alone (innocent party, active maintainers, no confusion risk with a scoped edge).
- 2026-10-21: no paid channels, no blog, no SEO worker pages. Discovery strategy remains: GitHub-native visibility, HN/show-hn when v1.0 quality bar hit, word-of-mouth from agent-to-agent propagation.
- 2026-10-21: proof assets self-hosted in-repo; no third-party players or CDNs; web/ one-way boundary respected.

## 10. Non-goals (locked)

- No translation.
- No frameworks, no build pipeline for web/home (that door opens with the module-frame phases, not here).
- No marketplace listing governance (covered by prd-storage/market).
- No paid ads, sponsorships, or SEO schemes.
- No demo/hosted anything: the local-first, own-your-files promise IS the differentiator; do not introduce a hosted surface to "simplify" onboarding.

## 11. The marketing dept (channels, resources, distribution)

The marketing model already exists inside the product: the audience is agents, the distribution network is agents onboarding agents, and the outposts humans gather at are the registries, directories, and communities listed here. This department runs on one principle: place the file where an agent (or the human driving one) is already searching. Never rent attention; occupy discovery surfaces.

### 11.1 Distribution posture (locked)

- **WHO:** humans running solo agents first (they install things), then crew operators, then agents themselves (via MCP discovery, AGENTS.md, and skills files).
- **WHERE:** everywhere `memory agent`, `MCP server`, `AGENTS.md` and "agent memory" searches land. Millions of agent operators exist and none of them have heard of vant yet; the network is unclaimed.
- **HOW:** listings (11.3), lists (11.4), communities (11.5), and the AGENTS.md carrier (11.6) — each surfaces the same two CTAs forever: install one-liner and MCP connect snippet (GAPS 2 and 3 upstream in this PRD).
- **NEVER:** paid placement, sponsored posts, SEO farms, cold DMs, astroturfing, ops that outgrow what one file can say about itself.

### 11.2 Asset shelf (all pre-made upstream in this PRD)

| Asset | Status | Owner gap |
|-------|--------|-----------|
| Hero copy, tagline, banned-word list | prd-brand.md | none |
| Docs IA + lander story | prd-content.md | none |
| Install one-liner | GAP 2 `@vant/cli` | npm publish pass (M3) |
| MCP client configs | GAP 3 | M1 pass |
| AGENTS.md adoption fragment | GAP 4 | M2 pass |
| Proof captures (wake loop, lattice) | GAP 1 | M4 pass |
| Inline brain sample | GAP 5 | M5 pass |
| OG image refresh | GAP 1 dependent | after M4 |
| Launch post (HN-style, ≤400 words, soul line once) | NOT WRITTEN | draft when M3 ships (needs the one-liner) |
| README "badges" (npm shield, CI badge) | NOT READY | npm publish pass; CI badge can be made anytime |

### 11.3 Registries & directories (MCP surfaces)

| Channel | Status (checked 2026-10-21) | What it takes | Priority |
|---------|------------------------------|---------------|----------|
| **MCP Registry** (registry.modelcontextprotocol.io) | live, community-run, preview | `mcp-publisher` CLI; `server.json` + namespace proof; 100-char description; package-based servers need a published package + ownership marker
  (favors GAP 2) | HIGH — but door opens at M3 (needs a published npm artifact to point at) |
| **Smithery** (smithery.ai) | live, accepting | remote servers need public HTTPS endpoint (not us); local stdio path via MCPB bundle; CLI publish | MEDIUM — revisit when MCPB bundle path investigated; not our shape today |
| **Glama** (glama.ai/mcp/servers) | live, free listings | GitHub repo URL + name + description; auto health/license checks; `glama.json` optional | HIGH — cheapest door open today (repo-URL listing, no npm requirement) |
| **PulseMCP** (pulsemcp.com) | live directory, submissions PAUSED | n/a while paused | WATCH — recheck monthly; daily-updated directory worth entering when it reopens |
| **mcp.so** | live, free review tier | submit form (free review; ignore paid) | LOW — free path exists, quality varies |
| **mcp.run** | pivoted to enterprise gateway, not a directory | n/a | DROP |
| **Anthropic/Claude connector directory** | no public submission verified | n/a | WATCH — if an open path appears, it's a big one |

Note: priority for package-based registries (Registry, Smithery) is deliberately post-M3. Pointing them at "clone the repo" violates the one-liner story we are trying to sell. Glama takes repo URLs, so it can open immediately.

### 11.4 List repos (PR-able, free)

| List | Status | Entry requirements |
|------|--------|--------------------|
| **punkpeye/awesome-mcp-servers** | accepts PRs | public repo + one-line desc + category; read CONTRIBUTING.md (remote-only servers have a separate list; ours is stdio/local, fits the main one) |
| **TeleAI-UAGI/Awesome-Agent-Memory** | accepts PRs | memory products/papers/tutorials per its CONTRIBUTING.md — vant is squarely in-category, likely the highest-signal home for us |
| **tairov/awesome-agents.md** | small curated index | AGENTS.md ecosystem entries |
| **wong2/awesome-mcp-servers** | does NOT accept PRs; site-based | skip (covered by listing through its website form if desired, LOW) |

### 11.5 Communities (where the humans are)

Free/community only. No sponsorships, no ad-supported Discord tiers.

| Venue | Shape | Play |
|-------|-------|------|
| **Hacker News** (Show HN) | launch window | post the launch post from 11.2 when M3 ships; soul line once; never re-post same story; expect CLI-first audience criticism and answer with receipts (test counts, module paths) |
| **r/LocalLLaMA** | high-volume subreddit | project showcases welcome self-contained local tools; vant's "no database, cat-readable" angle fits the local-first crowd; post when GAP 1 proof captures exist so the post has moving pixels |
| **MCP Discord** | protocol contributors | presence for MCP integration questions, not marketing; useful while GAP 3 snippets are being validated across clients |
| **HF Discord / LangChain Slack / llama-index Discord** | builder chat rooms | soft presence only; answer when someone asks about agent memory, link when relevant, never drive-by pitch |
| **Microsoft Agent Framework Discussions** | Q&A + showcases | watch for memory-integration threads; a well-formed answer with an AGENTS.md fragment attached beats a bare link |
| **AutoGen** | archived/legacy | only old threads worth answering when they still get views; no new investment |
| **agents.md spec site** | Linux Foundation Agentic AI Foundation | the 60k+ adoption surface; once GAP 4 lands, vant is a candidate for a showcased example repo listing on agents.md | 
| **GitHub code search / topics** | passive | keep topics sharp on package.json (add `mcp`, `agent-memory`, `llm` once publishConfig lands); GitHub is itself a discovery engine for agents.md-powered searches |

### 11.6 The AGENTS.md carrier (the actual mesh play)

Every project that pastes the GAP 4 fragment becomes a relay: their agent reads "on session start, run vant onboard wake" and eventually writes an AGENTS.md of its own recommending vant further. Carriers compound without us touching anything. The fragment IS the carrier signal; the shelf assets upstream (GAP 3 snippet, GAP 2 one-liner) are the payload.

**Supplementary carrier once M3 ships:** a `skills/` file following the shaped convention the agent ecosystems are converging on (SKILL.md files with name + description + instructions) so agent frameworks that auto-scan skills can discover vant the same way they discover other tools. The repo already models the pattern in models/public/vant/skills/vant-skill-css/SKILL.md — mirror that shape for the memory integration itself.

### 11.7 Cadence & owner (PM this like a storefront, not a campaign)

- **Monthly (15 min):** recheck PulseMCP pause status, Glama listing health, mcp.so quality drift, any new agent-registry that appears. Update this table's Status column only.
- **On M3 completion (one pass):** submit MCP Registry, submit Glama, PR punkpeye + Awesome-Agent-Memory, finalize npm badge, draft the launch post.
- **On M4 completion (one pass):** refresh OG image, then r/LocalLLaMA post + Show HN in the same week (proof assets now exist).
- **Ongoing:** answer memory-related questions in the communities table when they appear; each answer links either the AGENTS.md fragment (agents) or the install one-liner (humans).

### 11.8 Acceptance for dept passes

- Every listing PR mentions zero banned words (prd-brand list) and no claims that don't map to repo files (prd-brand rule 6).
- This section's Status columns stay honest: anything unverified this quarter gets a fresh check date and anything stale-flagged or dropped moves to a "graveyard" footnote, never silently deleted.
- Community participation leaves replies, not threads: never open a "come look at my tool" thread in a venue that didn't ask for one (Show HN and r/LocalLLaMA show-and-tell threads excepted by house rules).

## 12. Verification for any pass implementing this PRD

- Pass the language gate over home page and docs changes.
- Keep home gate green (permalinks + six checks), adding local-asset checks per GAP 1 acceptance.
- Docs tests + frontmatter + link integrity green.
- Every claim added by these pages must map to a module, command, or tracked asset in the repo (prd-brand §3 rule 6, unchanged).
- Labs handoff: TASKS.md session block per convention.
