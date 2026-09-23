# QC Wave — axolotl (2026-09-22, sweep 2)

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
