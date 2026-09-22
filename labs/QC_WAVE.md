# QC Wave — axolotl (2026-09-22, sweep 2)

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
