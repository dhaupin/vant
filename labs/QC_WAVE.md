# QC Wave — axolotl (2026-09-22, sweep 2)

## Pass 15 - dist QC, live interlinks, OG image (axolotl, 2026-09-23)

**Preview staleness diagnosed:** the user's preview URL hash (290798ae) is a Cloudflare Pages build from an earlier push; the last two commits predate it. No repo defect - fresh deploys mint fresh hashes. Dist itself verified clean on disk.

**Live interlink sweep caught 10/19 docs URLs 404ing on the live site.** Root cause: the live docs site builds from main, which does not have the docs restructure yet. All 10 targets exist in the axolotl tree with correct permalink frontmatter (agent-onboarding, contributing, runtime/mcp, runtime/server, memory/brain, memory/memory-store, memory/search, memory/horcrux, security/, multi-agent/). **Merge-order note: lander and docs restructure must land in the same merge to main**, otherwise the lander ships dead links.

**Real bug fixed: og:image pointed at a nonexistent vant-og.png.** Generated a 1200x630 dependency-free PNG (dark ink, accent V mark, bitmap VANT wordmark, amber dot) via a one-shot pure-JS PNG encoder (RGBA8, filter 0, zlib IDAT, manual CRC32). One-shot removed after use; output committed. Probe gained an og:image existence gate.

**Also verified:** robots.txt (sitemaps + disallow list sane), sitemap.xml (single canonical URL), no trailing whitespace, no TODO/lorem/localhost strays. Probe 32/32.

## Pass 14 - lander mobile pass (axolotl, 2026-09-23)

- three.js vendored at dist/vendor/three.module.js (r160, 1.27MB), importmap local - page fully self-contained, no CDN
- hamburger menu under 781px (aria-expanded/controls wired, Escape + link-tap close), sun/moon icon toggle
- overflow: body overflow-x clip, minmax(0,1fr) on all 4 grids, code.path overflow-wrap, lattice camera pulls back in portrait (13 -> 17.5) so clusters fit frame
- Tooling note: str_replace view-divergence hit again on dist/index.html (3rd time); surgical perl one-liner used for one camera line, all else via file tools

## Pass 13 - Lander voice reframe: session-neutral rhythm (axolotl, 2026-09-23)

**Why:** the owner flagged that "Wake. Work. Sleep." read as shift work, and Vant is deliberately flexible: any cadence works because memory is just storage. Section 01 rebuilt around that.

**Changes (dist/index.html only):**
- 01 "Wake. Work. Sleep." -> "The rhythm is yours"; cards renamed Open the brain / Work with memory / Keep what matters; sub states the cadence is the user's choice, Vant suggests, never demands
- The buildable-storage angle added to the memory store card: memory is the flagship use, underneath is a general-purpose store (sessions, caches, blackboards, whatever you build)
- Voluntary-rhythm line added to "Keep what matters": skip a session and nothing breaks, the memory is files, it waits
- Full wake/sleep sweep: meta description, og:description, featureList, HowTo step 4, hero lede, AGENTS.md card, brain card, soul paragraph, all lattice JS comments. Zero wake/sleep mentions remain (probe-enforced)
- No docs or AGENTS.md changes: those still describe the wake/work/sleep loop, which remains a real suggested cadence, just not the only one

**Tooling note:** str_replace and write_file both failed repeatedly on this file with text verified present on disk (view divergence). The two remaining JS comment lines were finished with a surgical perl one-liner; every other edit went through file tools. Git diff confirmed exactly 29 intended line changes, nothing else.

**Verified:** probe 19/19 (added a permanent no-wake/sleep gate); FAQ schema sync 11=11; section indices 01-09; copy targets 8/8; docs links resolve; both scripts parse.

## Pass 12 - Lander funnel, framing, and flow (axolotl, 2026-09-23)

**Scope:** dist/index.html only. Three.js lattice, VantFX, CSS, schema mechanics untouched.
**Goal:** the page is now a guided path for two audiences, not a feature tour. Audience framing: humans and agents are both friends and welcome.

**Funnel changes (new section order):**
- 01 Wake.Work.Sleep., hero lede states the welcome explicitly: humans and agents are first-class here
- Hero card renamed "For humans" -> "The 5 minute path", now includes `vant onboard` (verified routed, dispatcher line 108; AGENTS.md advertises it too)
- 02 Five minutes to a first win (NEW: install/start, meet the brain, first lesson)
- 03 Bringing your own agents (NEW: AGENTS.md as the contract, MCP one-command, crews)
- 04 Three memory systems (was 02)
- 05 Git is the feature (was 03)
- 06 Built on itself (NEW dogfooding proof: agent docs linters, labs/ handoffs, this lander itself; facts verified: labs/ exists with handoffs, brain has 165 public md files, commit history is agent-driven)
- 07 Runtime underneath (was 04)
- 08 Where Vant fits (NEW honest fit check: strong fit vs not-yet; anti-boilerplate trust move)
- 09 FAQ, grew 9 -> 11: "Can I use Vant without an agent?" and "What stops an agent from writing bad lessons?" (schema synced 11=11)
- Closing soul block is now a two-door CTA ("Pick a door. Both are open.") into quick-start / agent-onboarding; footer nav gained Agent Onboarding

**Verified:** structural probe 17/18 (one artifact: bare docs.creadev.org hub link can't be mapped locally, link is fine); FAQ schema sync 11=11; section indices 01-09 sequential; copy targets 8/8; docs links 16/16 real permalinks; scripts parse; no em dash, no emoji.

> **2026-09-23 update (sweep 3):** docs production pass (T1-T4) landed on
> top of this QC. Full handoff at the bottom of this file
> ("Docs production pass"). Verdict below is unchanged and re-verified:
> full battery re-run green after the docs edits (421/0/3 smoke, runner
> 37/37, vibe 4/4, all standalone suites, build-test 15/15).

Scope: full re-sweep of the branch after the migration adversarial QC wave
(`403800f`), judged as a PR #91 go/no-go. Covers migration + broader
functionality: syntax, lint, injection patterns, router wiring, every test
suite, runner, CI, and a real-tree migration drill. Prior findings live in
AUDIT_FINDINGS.md (2026-09-18, verification ledger complete) and
COHESION_AUDIT.md (2026-09-20).

## Verdict

**GO for PR #91 from the QC side.** All suites green, CI 421/0/3, the
migration flow survives a real origin/main tree drill, and the one new
critical found by this sweep (lib-side git injection) is fixed and pinned.

## Fixed this sweep

| Commit | Finding | Severity | Detail |
|--------|---------|----------|--------|
| this wave | **Git CLI injection still live in lib/ (5 files)** | 🔴 critical | QC_WAVE v1 flagged this class fixed in `bin/branch-manager.js` (R-6/O-9), but the same `execSync(\`git commit -m "${message}"\`)` pattern survived in `lib/branch.js` and ALL FOUR git connectors (github/gitlab/bitbucket/selfhosted) — checkout/push/pull interpolated branch names, commit messages (brain-file content!), and file lists straight into shell strings. Fixed: argv-array-only `execFileSync` everywhere — new `_gitExec(args)` + `_gitRef(name)` guards on the GitProvider base (remote.js), `git()` helper in branch.js converted, connectors route through the base helpers. `--upload-pack`/`;`/backtick/`$()`/`..`/leading-dash refs are REJECTED; legit refs (agent-1, feature/x, v1.0.2) pass. Pinned by `test/git-injection.test.js` (7 suites: static scans + real-repo drills proving a hostile message lands as TEXT and no marker file appears). |
| this wave | **`audit is not defined` in lib/branch.js** | 🟠 high | `audit.info()` called in ~10 places, `audit` never required — every CLI-path commit()/checkout()/merge() did its git work then crashed (same live-bug class as vaf 1, missed there). Fixed: `const audit = require('./audit')`. Found BY the new injection drill (probe kept crashing post-commit). |
| this wave | **commit() vaf check rejected legitimate messages** | 🟡 medium | Commit messages are arbitrary text stored in git history — with git() now argv-array, metacharacters are inert. Strict DANGEROUS_PATTERNS check (blocks `;`, backticks, pipes) rejected real brain quotes. Message check is now `allowContent:true` (text, not command); agentId stays strict (path segment). |
| this wave | **`errors` unused import in lib/migrations.js** | 🟢 low | Wave-file lint standard: 0 warnings on wave files. Removed. |

## Migration flow (PR #91 merge-safety) — QC'd in wave 2, re-verified this sweep

From `403800f` (see TASKS.md 2026-09-22 session block): marker-gated
verify (failed imports retryable, exit 1, ⚠ not 🎉), default-stack rewrite
in apply(), existing-wins import (`skippedExisting`), lstat walker +
per-file try/catch (symlink refusal can't abort), alert surfaces
(health checkMigration, migrate --status loud notice, banner requires
imported>0). 28/28 suites.

This sweep re-ran: migration suites 28/28 ✓, `migrate --status` on the
live axolotl tree: v3/v3 up-to-date ✓ (no false positive on multibrain).

## Checked and clean (this sweep)

- **Syntax**: all git-tracked lib/bin/test JS `node --check` clean.
- **Full test loop**: every `test/*.test.js` suite passes by EXIT CODE
  (grep-on-tail heuristics false-fail on multi-line result blocks — exit
  codes are the only unambiguous judge).
- **Runner**: 37/37. **CI**: 421 passed, 0 failed, 0 warnings, 3 skipped
  (ENV_DENIALS + SECURITY_REFUSALS by design).
- **CLI router**: 92 command→file routes, 0 dead.
- **Lint (wave files)**: 0 errors; only pre-existing interface-stub
  unused-param warnings remain in connectors (throw-only stubs).
- **AUDIT_FINDINGS.md ledger**: all 23 criticals verified closed earlier
  on this branch (see that file's 2026-09-22 ledger; vaf 1 was the live
  fix). Nothing resurfaced.
- **Migration alert surfaces**: health, migrate --status, start banner,
  MCP brain_migration_status — all live and silent-when-happy.

## Gap ledger (v1 list → current status)

1. **`bin/branch-manager.js` shell interpolation** → ✅ CLOSED (was
   already argv-array + validated; has its own suite). The lib/ copies of
   the pattern were the real residue — fixed this sweep.
2. **AUDIT_FINDINGS verification pass** → ✅ DONE (ledger in that file).
3. **DEAD_EXPORTS ~150 exports** → 🟡 open, unchanged. Process documented
   there; deliberate per-file review discipline (c7009da incident). No
   functional risk; not a merge blocker.
4. **COHESION_AUDIT B-2 (7 divergent security chains)** → 🟡 open,
   unchanged. Structural lift, pairs with sudo PRD. Not a merge blocker.
5. **PRD open items** (sudo Web UI/external auth; storage remote
   connectors) → 🟡 open, roadmap work. Not a merge blocker.

## Remaining known-acceptables

- `lib/connectors/gitea.js` + `detectRepoFromRemote()` helpers use
  execSync with CONSTANT strings only (no interpolation) — safe.
- selfhosted `detectProvider()` same (constant `'git remote get-url origin'`).
- 3 skipped CI bins are by-design skips (see CI testBin judge docs).

## Merge-readiness summary (PR #91)

- Tests: all suites ✓ (incl. 28/28 migration, 7/7 git-injection)
- CI: 421/0/3 ✓ · Runner: 37/37 ✓
- Real-tree migration drill: 168 files imported, verified, zero residue,
  fresh-process reads OK, idempotent second start ✓
- Docs: README/AGENTS/setup/cli/docker upgrade paths shipped in `d5a63c6` ✓
- Security: lib-side git injection closed + pinned; audit crash fixed;
  AUDIT_FINDINGS ledger complete ✓

---

# Docs production pass (2026-09-23, sweep 3)

Scope: T1-T4 of the docs IA plan (labs/prd-content.md). Tutorials fold,
CLI reference rebuild, nav_order re-banding, full link + frontmatter
verification.

## What landed

- **T2, reference/cli.md rebuilt from bin/** (~1550 → ~520 lines, one
  entry per command): removed duplicate sections that contradicted each
  other (sync/test/rate/bump/changelog/update/watch/succession/load
  appeared twice with different flags); removed fabricated flags
  (`update --install/--force`, `wal --verify/--replay/--truncate`,
  `load identity`, `succession trust/diff`, `rate` as a GitHub API
  check — it is the QoS limiter); added commands the old page missed
  (learn/remember/address/locate, geometry, org, trust, brain mode,
  error, compute). Every signature verified against bin/ usage headers
  and the vant.js dispatcher.
- **T3, nav_order re-banded to the PRD decade model:** essential/
  46-54 → 35-43 (essential sits between runtime and multi-agent in the
  nav), multi-agent/ 40-45 → 44-49 (forced move: freed the 40s),
  operations/ 55-69 → 50-64 (PRD's 50s band; 15 pages, no dupes),
  security/ 70-77 → 65-72 (PRD's 60s band). Unique-value dedupe pass:
  zero duplicate nav_order integers across all 117 files.
- **nav.yml cleanup:** dissolved orphan sections from the tutorials fold
  (Integrations Extras, Multi-Agent Tutorials) folded into their owning
  sections; Operations list completed (qos/network/cache were missing);
  4 dead nav URLs fixed by modernizing legacy permalinks to match paths
  (examples, contributing, deprecations, CHANGELOG — no inbound links,
  PRD stub rule satisfied by deletion of risk, not stub pages).
- **horcrux-legacy.md → horcrux-bootstrap.md** (git mv): the page
  documents bootstrap, is nav'd and linked as horcrux-bootstrap. File
  name now matches content and links.
- **ci.md rewritten to match the real pipeline** (this branch's CI work):
  single-job test.yml with concurrency cancel-in-progress, npm cache,
  8-minute timeout, weekly schedule; docs.yml (Pages) and docker.yml
  documented; removed fictional lint.yml/deploy.yml/codecov/80%
  coverage/pre-commit script claims. Local commands now match package.json.
- **Link normalization (333 links):** docs predated the /vant/ basepath;
  most inter-doc links were leaf-relative (../../reference/config) and
  resolved ABOVE the site root from section pages, or assumed a
  never-implemented docs-root-absolute rewrite. All resolvable links
  rewritten to /vant/<permalink> site-absolute form using each target's
  real frontmatter permalink. All dead targets replaced with live ones
  (security/security → /vant/security/, essential/ai-onboard →
  agent-onboarding, entropy's ../CLI.md#compress → /vant/reference/cli).
- **Durable tooling:** scripts/check-docs-links.js (validates /vant/
  links against real permalinks, abs links against disk, rel links
  resolve; skips fences/inline code; exit 1 on break) — the one-shot
  fixer (scripts/_fix_docs_links.js) is retained for reference.

## Verification (sweep 3)

- Frontmatter lint: 117/117 docs files carry version/permalink/layout/
  title/nav_order; permalinks match paths (index pages root or trailing
  slash).
- Link checker: DOCS LINKS: PASS (117 files) — /vant/ links all match
  real permalinks; relative links all resolve.
- Nav: 79 URLs, 0 dead; nav_order unique across all files.
- Battery after all edits: test/ci.js 421/0/3, runner 37/37,
  vibe evals 4/4, coverage 41/41, all test/*.test.js suites pass,
  build-test 15/15, npm test 15/15.

## Notes for future passes

- operations/ has 15 pages against the PRD's 8-slot target list; banding
  stayed inside 50-64 without page folds. A later pass could fold
  operations/operations.md (day-2 CLI rehash) and cache.md into neighbors
  to hit the PRD shape exactly.
- /guides/ still referenced once from ROADMAP.md (outside docs/, left).
- reference/cli.md says nav_order 111 by earlier convention; it sits
  within the reference band (110-135) and is unique — fine to renumber
  in a later cosmetic pass if the PRD's 81 target is picked up.
- scripts/_fix_docs_links.js is one-shot (idempotent but not needed
  again); check-docs-links.js is the keeper.

---

# QC polish pass (2026-09-23, sweep 4)

Scope: another full docs pass for QC, formatting, accuracy, examples, and
polish, on top of sweep 3. Recovered from a crash mid-wave: the work was
sitting as a large uncommitted diff (79 files) plus two new pages and the
new style linter. This session verified it, fixed one accuracy bug it
contained, and committed it.

## What landed

- **77 docs pages edited across every section + AGENTS.md:** formatting,
  stale-claim fixes, example fixes, voice polish. AGENTS.md MCP Tools
  link retargeted runtime/mcp -> reference/mcp-tools.
- **New pages:** docs/essential/index.md (section overview, nav_order 35)
  and docs/security/encryption.md (lib/encrypt reference, nav_order 74;
  security band now contiguous 66-74).
- **nav.yml:** essential Overview + security Encryption entries added.
- **Durable tooling:** scripts/check-docs-style.js (fence language tags,
  heading-level skips, trailing whitespace, tabs in prose; exit 1 on
  findings). Joins check-docs-links.js as the two pre-commit docs gates.

## QC found + fixed during verification

- **encryption.md fabrication:** `Encrypt.encode/decode` table row does
  not exist (live-probed lib/encrypt exports). Removed.
- **encryption.md overstated at-rest claim:** "tokens are encrypted per
  user" replaced with the real contract: signToken is HS256 over base64
  payloads, signed not encrypted.
- **Accuracy spot-checks that PASSED:** rsaEncrypt/Decrypt = OAEP-SHA256,
  rsaSign/Verify exist, aesGcmEncrypt/Decrypt = AES-256-GCM with authTag,
  RSA min key 2048.

## Verification (sweep 4)

- Style lint PASS (119 files), links PASS (119 files), docs suite 6/6.
- nav_order: zero duplicates repo-wide; security band contiguous.
- Battery: ci 421/0/3, runner 37/37, all 108 standalone suites exit-0,
  coverage 41/0.

## Notes for future passes

- Scratch residue (scripts/_fix_*, _qc_*, _renumber_docs,
  _audit_probe, private/buffy) left untracked per convention; the _fix_*
  scripts are one-shots and safe to delete whenever.
- Run check-docs-style.js + check-docs-links.js before any docs commit.
- Remaining PRD follow-ups unchanged from sweep 3: operations/ 15 pages
  vs 8-slot target (fold operations.md + cache.md later), reference/cli
  nav_order 111 vs PRD 81 (cosmetic).

---

# Docs QC round 8 (2026-09-23)

Scope: another full docs pass (recovered from repeated session
interrupts): mechanical voice/fence sweep, consistency greps (ports,
versions, brain paths), accuracy of sampled commands against bin/ and
lib/, frontmatter and link validation. All findings verified against
code before editing.

## Found + fixed

- **audit.md (7 repairs):** three event tables and the RBAC table had
  mangled two-column shape (pipe-table accident from an earlier wave);
  Reporting section ran phantom `./bin/report.js --days/--start/--end`
  (real tool is `vant audit` with --out/--json, per bin/audit.js +
  bin/vant.js dispatch); SIEM block used nonexistent --format flags;
  ledger example code was exploded with `|- { ... }` residue and used a
  wrong require pattern (`require('vant').audit`); getLedger()/
  healthCheck() shapes corrected to the real API ({ status, entries },
  no args); hash-chain claim corrected (SHA256 over the full serialized
  entry, first 16 hex chars - not prevHash+action+timestamp); ledger
  action names matched to lib/audit.js (island:hydrate, stego:snapshot,
  raid:sync); retention table pointed at `.audit.log` and a phantom
  `states/active/` path - real ledger file is `.audit.json` under the
  current brain path, rate limits are in-memory counters.
- **docker.md (rewritten):** file had an unbalanced fence (23 fences,
  the Related section's closing fence) which swallowed the rest of the
  page; MCP quick start used `-p 3456:3456` for the MCP server (MCP is
  3457, `vant mcp` - 3456 is the REST/health server); env table used
  `VANT_PORT` and `MCP_REQUIRE_API_KEY`, neither of which exists (real:
  VANT_SERVER_PORT, VANT_MCP_PORT, VANT_MCP_REQUIRE_KEY per lib/config.js);
  Dockerfile CMD called nonexistent `serve` subcommand (real: `server`);
  health payload corrected to lib/server.js's `{ status, uptime }` (no
  version field); EXPOSE and compose/K8s port lists now cover both
  ports; port map table added at top.
- **succession.md:** `cat models/private/_succession.json` is a pre-0.9
  path; file lives at `models/public/vant/_succession.json` (verified on
  disk and in lib/succession.js).
- **troubleshooting.md:** same flat-path fix for the multi-line write tip
  (`models/private/filename.md` -> `models/private/vant/filename.md`).
- **storage.md:** connector table rows said TODO; replaced with real
  status (local built-in, pinecone has lib/connectors/pinecone.js,
  qdrant/weaviate are factory-registered in lib/connectors/index.js but
  have no connector files yet - planned).
- **efficiency.md:** voice fix ("Leverage" -> "Use").

## Verified accurate (no change)

- Port duality: 3456 REST (VANT_SERVER_PORT) vs 3457 MCP
  (VANT_MCP_PORT) is consistent across frontend.md, environment.md,
  rest-api.md, deployment.md after round 6; grep hits on 3456 are the
  REST server, not MCP.
- Version strings: 0.8.6 dominates (164 hits) matching package version;
  0.9.0 hits are forward-looking migration references, fine.
- nav_order: zero duplicates repo-wide; index permalinks all
  section-rooted.
- Arrows/glyphs flagged by grep all live inside code fences (linter-
  exempt) or inline code spans (rpc.md icon tables, search.md pipelines,
  vibe.md diagrams) - intentional data values, not prose decoration.
- `vant validate --ledger|--check` real (bin/validate.js).

## Tooling

- check-docs-style.js gained the voice gate (em/en dash, emoji/glyph
  with inline-code exemption) and pipe-table shape rules this round.
- check-docs-links.js keeper restored after an accidental overwrite by
  a throwaway frontmatter/link script (which validated LINKS: PASS and
  frontmatter completeness before being discarded).

## Verification (round 8)

- Style lint PASS (119 files), links PASS (119 files), docs suite 6/6.
- All fixes cross-checked against lib/audit.js, bin/audit.js,
  bin/vant.js dispatch table, lib/config.js, lib/server.js,
  lib/connectors/, lib/succession.js before editing.

## Notes for future passes

- operations/ fold + reference/cli nav_order cosmetic items still open
  (unchanged).
- docs/advanced/nsc9-spec.md draft spec uses box-drawing arrows in
  fenced diagrams; fine as-is.
- lib/connectors/index.js registers qdrant/weaviate factories whose
  files do not exist yet - requiring them throws; flagged in storage.md
  as planned. Either land the connectors or drop the factory rows in a
  future code pass.

---

# Docs QC round 9 (2026-09-23)

Scope: new check classes beyond rounds 6-8: repo paths referenced in
  docs vs disk, node --check on every fenced javascript block, VANT_*
  env vars in docs vs lib/config.js, plus accuracy sampling of APIs the
  touched examples rely on. All findings verified against code first.

## Found + fixed

- **Hidden pipe-table residue (26 sites, 9 files):** rounds 6-8 fixed
  residue in prose and tables, but the same `|` + newline + `- ` burst
  pattern survived INSIDE code fences where the prose-only linter cannot
  see. In fences the original text had commas: the explosion turned
  `", "` into the residue. Decoded by hand and restored real commas in
  mcp.md (Node/Python MCP clients, curl JSON), sync.md (results object,
  console.log calls), schema.md (isValid/validateFile return shapes),
  providers.md (destructure + provider list), boot.md,
  horcrux-bootstrap.md, audit.md, troubleshooting.md, pruning.md. Zero
  `|`-newline-`- ` residue remains anywhere in docs.
- **linear.md:** broken example `description: Goal: \`${goal...}\`` (a
  label inside an object literal) -> proper template literal.
- **search-architecture.md:** API fence mixed JS + CLI + raw JSON;
  split into javascript and bash fences, JSON folded into prose.
- **Phantom env vars purged:** `VANT_DEBUG` is read by zero code
  (debug is hard-enabled in the vant mcp/api/all trifecta modes;
  standalone server is bin/mcp.js --server). Removed from testing.md,
  deployment.md, docker.md, mcp.md. `MCP_REQUIRE_API_KEY` and
  `VANT_SYSTEM_PROMPT` also read by nothing - removed. deployment.md
  used `VANT_PORT` again (fixed to VANT_SERVER_PORT/VANT_MCP_PORT).
- **config.md phantom config.ini block:** the "MCP Security" ini block
  and settings table (MCP_TIMEOUT, MCP_MAX_CONCURRENT,
  MCP_CIRCUIT_BREAK_*, MCP_MAX_INPUT_SIZE, MCP_REQUIRE_API_KEY) are
  read by no code - removed; MCP knobs documented as the real VANT_MCP_
  env vars (port/bind/apiKey/requireKey from lib/config.js). The VAF
  keys (MAX_STRING_LENGTH etc.) were verified real in lib/vaf.js and
  kept. AUDIT_FILE stays .audit.log (vaf.js) - distinct from the
  .audit.json ledger in audit.md, both real.
- **README.md:** `MCP_REQUIRE_KEY` -> `VANT_MCP_REQUIRE_KEY`.
- **rest-api.md:** `async function callTool(name, arguments)` -
  `arguments` is a reserved binding in strict mode, real syntax error
  -> renamed to `args`.
- **providers.md:** `require('vant').providers` and
  `require('vant').branch` are phantom module surface; the real paths
  are lib/remote (getProvider/detectProvider, all provider methods
  verified) and lib/branch (status/createPR verified). Also fixed a
  duplicate `const provider` in one scope.

## Verified accurate (no change)

- Every lib/*.js and bin/*.js path referenced in docs exists on disk
  (0 missing after rounds 6-8 cleanup).
- VANT_TOKEN_SECRET, VANT_BRANCH, VANT_MSG_ENCRYPTED, VANT_WEBHOOK_*,
  VANT_AGENT_ID, VANT_GITHUB_*, VANT_MCP_PORT/BIND/API_KEY/REQUIRE_KEY,
  VANT_API_KEY all real in lib/config.js, lib/auth.js, lib/webhooks.js.
- The 11 fences flagged by node --check were triaged: 6 real bugs
  (fixed above), 5 accepted snippet idioms (top-level await in usage
  examples, object fragments, `{ ... }` placeholders) - left as-is.
- vant mcp/api/all trifecta modes exist and hard-enable debug;
  bin/mcp.js --server/--stdio/--port real; lock status/force real;
  sync --status/--pull/--push/--branch real; health has -q only.

## Tooling notes

- scripts/_repair_pipe_residue.js (one-shot, untracked) proved a
  blanket join is unsafe - it restored the join in fences but commas
  inside code need human eyes. Deleted after hand-fixing; do NOT
  automate this join blindly. The tmp path/syntax checker
  (scripts/tmp-qc-paths-syntax.js) is workspace-local for now; worth
  promoting with a whitelist for accepted idioms if fence QC becomes a
  recurring need.

## Verification (round 9)

- Style PASS (119), links PASS (119), docs suite 6/6, nav_order all
  unique. Zero pipe residue, 0 missing repo paths, remaining syntax
  flags all whitelisted idioms.

---

# Lander rebuild + pass 10 (2026-09-23)

Scope: dist/ lander rewrite (frame, schema, content, rigging, single
file, no framework) plus docs polish half still queued. Every claim on
the page re-verified against the codebase before shipping.

## Claims verified + corrected

- **vant memory <cmd> is a phantom command:** bin/help.js advertises
  `vant memory <cmd>` and bin/memory.js exists, but the vant.js
  dispatcher has no memory route - live probe prints "Unknown command:
  memory". The old lander's Work block used `vant memory learn`.
  Replaced with the verified surface: `vant learn <key> <content>` and
  `vant search <query>` (both dispatch-verified; learn/remember are
  handled inline, address/locate too). NOTE for a future code pass:
  either wire memory.js into the dispatcher or drop it from help.
- **Stats band corrected with real counts:** 120 CLI commands -> 93
  (parsed COMMANDS map in bin/vant.js), 125 lib modules -> 89
  (ls lib/*.js). Doc pages 119, test files 108 - verified. Version
  stat relabeled "MIT licensed" so it survives version bumps.
- All 14 unique docs link targets resolve against real permalinks.

## Lander structure (dist/index.html, single file)

- Frame: skip link, nav, hero with dual-path onboarding (For humans /
  For agents cards, each with a copyable terminal block and one CTA),
  wake-work-sleep numbered loop, three memory systems, git-is-the-
  feature, stats band, runtime grid, soul section, synced FAQ,
  footer. One h1, semantic sections throughout.
- Schema: SoftwareApplication refreshed (+license field), new HowTo
  (4-step setup with step URLs), FAQPage kept in sync with the 9
  visible details blocks (count-verified in CI-style probe).
- Rigging: copy buttons on all 5 terminal blocks (clipboard API +
  execCommand fallback, prompt ($) stripped from copied text), theme
  applied pre-paint in head (no flash), prefers-reduced-motion
  honored, :focus-visible styles, aria-labels on icon-only buttons.
- No logo yet: brand mark is an inline "V" tile, easy to swap for a
  real SVG mark later. OG image URL kept pointing at vant-og.png
  (placeholder until design prose exists).

## Verification (lander)

- Structural probe: 13/13 PASS (tag balance, one h1, no em dash, no
  emoji, 3 JSON-LD blocks parse, FAQ schema visible sync 9=9, 24
  links all trusted hosts, 5 copy buttons all resolve).
- All claims command-verified against bin/ + lib/ on 2026-09-23.

## Notes for future passes

- Docs polish half of pass 10 still queued (see round 9 notes).
- `vant memory` dispatcher gap: help advertises it, code does not
  route it. Fix code or help before advertising it anywhere else.
- Swap the V brand tile + vant-og.png when logo and design prose land.

---

# Lander overhaul: three.js memory lattice (2026-09-23)

Scope: full visual overhaul of dist/index.html. Nothing cliche, no
framework. VantFX animation frame is written in-file, three.js wired
via importmap for the hero, all verified facts from pass 10 kept.

## Design concept

The hero is the product: a living **memory lattice**. 150 memory nodes
in three lobes (wake/work/sleep), citation edges between neighbors, a
wireframe brain core, and amber signal pulses that travel from nodes
into the core - lessons landing in the brain. It breathes on a 12s
cycle, follows the cursor with parallax, and is pointer-draggable.
Geometry is not just decoration: NSC9 quasicrystal addressing is a real
Vant system (lib/memory.js geoStore).

## VantFX (in-file frame, no dependencies)

- reveal: IntersectionObserver scroll reveals with fx-d1..d5 stagger
- counters: stat values count up once on visibility (eased cubic)
- copy: clipboard buttons with execCommand fallback
- theme: toggle dispatches vantfx:theme; the lattice re-tints live
- reduced motion: matchMedia gates every animation; lattice renders
  one static frame; CSS honors prefers-reduced-motion

## Lattice implementation notes

- three@0.160.0 via importmap (module CDN unpkg); module script
  syntax-checked with node --check; CDN verified reachable (200)
- WebGL failure or CDN block: host is hidden and the CSS radial veil
  reads as the hero background - page is fully usable without it
- visibilitychange pauses the RAF loop (battery respect); pixel ratio
  capped at 2; low-power GPU hint
- pointer capture drag + idle parallax; both feed eased rotation
- copy: headline is now "Every session starts over. Except yours."
  with the soul line as a pull-quote section; numbered 01-05 section
  indices in the signal amber; all pass-10 verified facts unchanged

## Verification (lander v2)

- Structural probe 17/17 PASS (tags, h1, voice, 3 JSON-LD parse, FAQ
  sync 9=9, 24 links trusted hosts incl. unpkg, 5 copy targets, 5
  counters, both inline scripts parse, module script parses)
- All 14 docs link targets resolve against real permalinks
- Command claims unchanged from pass 10 (vant learn/search verified)

## Notes for future passes

- If the three.js CDN is a concern, vendor three.module.js into dist/
  later (~1.2MB) - importmap makes that a one-line change.
- Swap the V brand tile + vant-og.png when logo/design prose land.
- `vant memory` dispatcher gap: CLOSED pass 17 (16 unregistered CLIs
  wired into bin/vant.js dispatcher).

## Pass 17 - code-side QC: fresh-project smoke found 5 real bugs

Scope: the repo worked in-repo but broke in any other directory.
Smoke-tested the documented first-session flow (start, learn, search)
in scratch dirs. Every fix verified by rerunning that flow cold.

1. **16 advertised commands never routed** - dispatcher map in
   bin/vant.js lacked entries for trust, market, secret, transform,
   context, backup, restore, snapshot, horcrux, citations, embed,
   canvas, memory, stream, replay, agents-split (each bin file real,
   argv-safe, exit-0). Wired all 16. cli.md was already correct; only
   the dispatcher was broken.
2. **ECAP write denial on fresh installs** - boot.init setScopes()
   flipped the sandbox into enforce mode but never linked it to the
   boot sudo task, so can('canWrite') fell through to deny-by-default.
   Fix: boot links defaultSandbox.agentId to the task; sandbox.can()
   returns the UNION of sudo verdict and static capability floor
   (widening-only semantics both directions); setScopes gained
   { merge: true } so boot widens and never narrows host grants; boot
   skips the identity link entirely when the host already configured
   the sandbox (that hijack was swallowing explicit deny flips -
   integration-criticals agents 2 caught it).
3. **vant search dead in fresh projects** - getLTC() required
   start.md, which no seeder created; and _brainModelsRoot was
   package-anchored (../ escapes blocked by containment in any install).
   Fixes: CWD-anchored root; start.md now seeded; getLTC falls back
   to corpus head; getBrainPath self-corrects to private when only the
   private brain exists (no state.json yet).
4. **vant start seeded nothing** - a fresh project got an empty
   models/ tree. bin/start.js now seeds start/identity/goals/lessons
   (idempotent, skips any brain that already has .md files). Also
   fixed: dispatcher spawned subcommands with cwd=package-root, so
   every subcommand read the install dir instead of the user's
   project (now inherits user cwd; comments document why).
5. **bin/search.js lied about modes** - --mode hybrid printed
   results.sparse/.dense (fields that never exist; lib is BM25), and
   basic/rag destructured a `results` key that the empty-corpus early
   return omitted. queryBrain now always returns both keys; CLI
   prints the real shape; --mode hybrid labels output honestly.

Plus: circular-dependency warnings silenced (root-fixed storage.js
lazy MODELS_PATH; brain.js warning channel filters only the cycle
class and reprints everything else), habitat.js RLS _matches()
normalizes sparse userCtx (CLI {} contexts no longer throw into the
pipeline's 'rls check unavailable' path), pipeline RLS check skips
when no user subject is present, gatherState/restoreState spray from
OpenHands c7009da purged from habitat/registry/relay/rules (35+30+16+6
junk pairs; legit export pairs kept; syntax-checked all lib files).

### Test-harness timing trap (concurrent-agents)

'foreign tokenless release refused' used a 1s lock TTL; agent-B's
tokenless acquire retries (50..800ms backoff) outlived the TTL and
the stale takeover made it look like the child broke the lock. The
child refusal itself was always correct. Fixed the test: 30s TTLs on
all held locks so no retry loop can outlive them. Library behavior
confirmed correct under the fixed timing (3x green).

### Verification

- Full test sweep: 109 suites, 0 failures (was 3 suites failing).
- Fresh-project flow: vant start seeds brain, vant learn writes,
  vant search returns corpus hits, no ECAP, no scary warnings.
- Known noise left as-is: '[storage] Sandbox not configured' prints
  once per process (dispatcher + child = 2 lines) by design; the
  gate warns every 60s so misconfig is never silent.
