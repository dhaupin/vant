# Vant Marketing & Adoption — Product Requirements Document

**Version:** 1.0
**Branch:** axolotl
**Date:** 2026-10-21
**Status:** Drafted from pass 322 funnel review, pending owner approval
**Companion:** prd-brand.md (voice + naming — the rules here inherit it), prd-content.md (docs IA)

---

## 1. Goal

The docs and lander tell the story well. What leaks is the step between
"reader" and "running install": the usability layer. This PRD pre-makes
the decisions for every known funnel gap so each ships as one focused
pass without re-deriving the rationale, re-arguing tradeoffs, or
re-discovering the npm name collision every time.

**Non-goals up front:** no paid channels, no SEO games, no blog, no
social presence, no demo servers. Vant's sales motion is the repo itself;
this PRD only removes friction from it.

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

Rule: a fix narrows exactly one tier. Nothing upstream gets rewritten to
fix something downstream.

## 3. GAP 2 — Installability (the structural unlock, ship first)

**Situation:** the npm name `vant` is owned by an unrelated Vue UI
library (owner chenjiahan, active). Every surface carries an awkward
parenthetical confessing this, and the "5 minute path" is four commands
(clone, cd, npm ci, vant start).

**Decision (pre-made, override only with a filed note here):** publish to
npm under the scoped name `@vant/cli`.

- `npx @vant/cli start` becomes the entire install story.
- The unscoped-`vant` disclaimer disappears from README, home page,
  install docs, and the home JSON-LD HowToStep — replaced by the one
  no-op sentence "the unscoped `vant` package is unrelated" at most once
  per surface, only where confusion is likely (install.md, README).
- Name candidates checked in priority order: `@vant/cli`, then
  `@vant-brain/cli`, then `@vant-memory/cli`. Register whichever is
  free; every reference then reads that literal.
- Unscoped-package squatting (e.g. requesting takedown of the Vue
  library) is a never. Scoped publishing makes it unnecessary and the
  Vue project is innocent.

**Implementation shape (one pass):**
- New `npm:` publish path in CI (ci.yml): on version tag, `npm publish
  --access public` with provenance. package.json needs `publishConfig`,
  correct `files:` allowlist (bin/, lib/, models/public/ seed files,
  docs/ NOT included), and a bin map unchanged (`vant`, `mcp`).
- Note: package.json `author` email is a placeholder
  (`vant@example.com`); fix to the real maintainer address at publish
  time, not before.
- Surface updates: hero terminal block (home), README quick start,
  install.md, FAQ "is it on npm" answer, JSON-LD HowToStep, docs truth
  gates that may pin the clone path.

**Acceptance:** `npx @vant/cli --version` works in a scratch dir with
zero git steps; no `clone && cd && npm ci` remains in any hero/quickstart
surface; publish workflow green on a dry tag.

## 4. GAP 1 — Show, don't tell (proof assets)

**Situation:** the only visual asset is vant-og.png. Claims like "the
lattice is your agent's memory graph. Drag it" ask for belief without
evidence. The wake loop, the thing that IS the product, has never been
seen by anyone without a terminal and 40MB of node_modules.

**Decision:** two artifacts, both self-hosted (repo-tracked, no
third-party hosting dependencies):

| Artifact | Content | Placed |
|----------|---------|--------|
| `<web/home/assets/wake-loop.(cast|svg|png)>` | terminal capture: `vant onboard wake` → identity/goals/lessons load lines → prompt | home §02 Five minutes, under the install block |
| `<web/home/assets/lattice.(gif|mp4)>` | 8-12s: lattice drag, pulses landing, a lesson arriving | home hero right column or under the drag-hint line |

- Preferred capture format: asciinema `.cast` rendered via
  `asciinema-player` vendored, OR rendered-to-SVG/PNG stills (svg-term).
  No external CDN scripts; the one-way web/ boundary law applies to
  player assets too.
- og:image gets a refresh only after the lattice capture exists: the
  current OG tile and the actual hero should show the same product.
- Voice rules apply to captions: no emoji, no banned words, one sentence.

**Acceptance:** both assets render on vant.creadev.org on mobile data
speeds (<500KB each preferred, hard cap 2MB); the home gate (check-home
six checks) extended to confirm local-asset references resolve; no
new external requests introduced.

## 5. GAP 3 — Copy-paste MCP client configs

**Situation:** docs/runtime/mcp.md §Connect a client says clients
"speak stdio" and points at prose. A curious reader must hand-derive a
JSON block. This is the highest-friction moment for tool-using agents,
which are the primary audience.

**Decision:** add a "Connect your client" section to
docs/runtime/mcp.md (and link from docs/getting-started/agent-onboarding.md)
with ready-made fenced blocks, each with a one-sentence explainer per
prd-brand §4:

- Claude Desktop (`claude_desktop_config.json` mcpServers block)
- Cursor (`~/.cursor/mcp.json` block)
- Generic stdio MCP (the same shape, labeled "any other stdio client")
- HTTP door (localhost:3457) example for raw-HTTP callers — already
  documented, just given the same copy-paste treatment

**Truth constraints:** every snippet must be against current behavior
(command `vant mcp` or the installed bin path; port 3457; auth optional
locally, x-api-key when requireKey). Snippets get checked by the docs
truth gates as fenced `\`\`\`json` blocks — no orphan blocks.

**Acceptance:** a reader can go from zero to "vant tools listed in
Claude Desktop" with exactly two copy-pastes (config + a CLI start);
docs tests and coverage gates green.

## 6. GAP 4 — AGENTS.md adoption snippet

**Situation:** the most stubborn growth loop in agent tooling is
proliferating via agents.md files (agent-facing READMEs) across user
repos. Vant has no packaged block for it; every adopting human hand-writes
their agent's vant instructions.

**Decision:** ship a canonical copy-paste fragment. Location:
- New docs page `docs/integrations/agents-md.md`
  (or folded into agent-onboarding if IA review prefers — pick ONE and
  record in implementation notes) — nav_order per IA bands.
- Root `AGENTS.md` links to it as "use us" advertisement: the repo
  already lives by it; the page exports the pattern.

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

Source of truth for verbs: bin/onboard.js routed verbs (status, wake,
summary, files, read, search, system, help — verified on the real CLI
in pass docs). If a verb changes, this fragment changes in the same
pass. The sleep line must reference only mechanisms that exist; if a
real sleep verb ships, the fragment and this PRD note update together.

**Acceptance:** an agent given ONLY this fragment, on a repo with vant
installed, can complete one wake/learn/sleep cycle; docs IA gates stay
green; the fragment stays under 15 lines.

## 7. GAP 5 — The brain, shown inline

**Situation:** the top unspoken objection is "what exactly am I
committing to my repo?" The home page answers in prose. The actual
files in models/public/vant/ are the answer.

**Decision:** add one collapsible detail block (`<details>`) on the home
page FAQ section: an abridged, curated rendering of a real brain file
set — identity.md opening lines, a few lines from lessons.md, one entry
from errors.md. NOT fetched from GitHub at runtime (static, inlined at
build/edit time, consistent with the home page being a checked-in
artifact). Label it clearly as sample copy, sourced from vant's own
public brain.

**Truth constraint:** every line shown must actually exist in a tracked
file; the sample says which files it excerpts. Refresh cadence: at
version bumps only, by edit, not dynamically.

**Acceptance:** the details block passes the home gate; all quoted
lines exist in current tracked files (checked at CI time with a
presence lint in check-home if cheap, else noted as manual review).

## 8. Sequencing

| Step | Scope | Depends on |
|------|-------|-----------|
| M1 | GAP 3: MCP client configs (docs only, cheap) | — |
| M2 | GAP 4: AGENTS.md snippet page | — |
| M3 | GAP 2: npm scoped publish + surface one-liner rewrites | owner confirm name; needs npm account token in CI |
| M4 | GAP 1: proof assets | a screen-record session; example: existing cast assets available first |
| M5 | GAP 5: inline brain sample | M4's page layout calm |

M1/M2 are a single-focus afternoon each and untouched by anything else.
M3 is the fork in the roadmap: everything downstream (hero blocks, docs
gates) reads differently after it. M4/M5 are polish that should not block
M3.

## 9. Decision log (append-only)

- 2026-10-21: `@vant/cli` chosen as publish path; unscoped `vant`
  squatting declined; Vue library left alone (innocent party, active
  maintainers, no confusion risk with a scoped edge).
- 2026-10-21: no paid channels, no blog, no SEO worker pages. Discovery
  strategy remains: GitHub-native visibility, HN/show-hn when v1.0
  quality bar hit, word-of-mouth from agent-to-agent propagation.
- 2026-10-21: proof assets self-hosted in-repo; no third-party players
  or CDNs; web/ one-way boundary respected.

## 10. Non-goals (locked)

- No translation.
- No frameworks, no build pipeline for web/home (that door opens with
  the module-frame phases, not here).
- No marketplace listing governance (covered by prd-storage/market).
- No paid ads, sponsorships, or SEO schemes.
- No demo/hosted anything: the local-first, own-your-files promise IS
  the differentiator; do not introduce a hosted surface to "simplify"
  onboarding.

## 11. Verification for any pass implementing this PRD

- Pass the language gate over home page and docs changes.
- Keep home gate green (permalinks + six checks), adding local-asset
  checks per GAP 1 acceptance.
- Docs tests + frontmatter + link integrity green.
- Every claim added by these pages must map to a module, command, or
  tracked asset in the repo (prd-brand §3 rule 6, unchanged).
- Labs handoff: TASKS.md session block per convention.
