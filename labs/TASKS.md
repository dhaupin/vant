# Vant Labs — Session Task Tracker

**Branch:** axolotl  
**Last Updated:** 2026-10-05  
**Session:** Pass 121 — env-aware import naming, boundary gates, PR 91 rewritten as the axolotl-vs-main summary

---

## Session (2026-10-05 — pass 121: solid for the 10k Docker Hub installs)

Context: main has ~10k Docker Hub pulls, so PR 91 is effectively the release
notes and the migration path is the front door. Owner asked for one more
migration/onboard pass plus a real axolotl-vs-main PR description.

- **Env-aware import naming (bin/migrate.js):** default import name now
  resolves flag > VANT_BRAIN > 'vant'. The old-main trap: a VANT_BRAIN-scoped
  agent running start on a legacy tree got the old brain imported as 'vant'
  while the seed materialized a placeholder in the brain they were actually
  scoped to — real content in the one brain they were not scoped to. Hostile
  env values still fall back via _validBrainName; a notice line announces the
  env-supplied name. bin/start.js banner notes when VANT_BRAIN supplied the
  name; headers document the seed-after-migrate and naming-order contract.
- **Journey suite grows to 14 gates:** scoped start imports into the scoped
  brain (zero user content leaks into a default brain; runtime materializing
  its scoped dirs is legitimate and the gate walks .md content, not dir
  existence), explicit --brain-name beats VANT_BRAIN, hostile VANT_BRAIN
  falls back safely.
- **PR 91 rewritten** as the axolotl-vs-main summary: what axolotl is, the
  upgrade path for existing installs (detection, naming order, existing-wins,
  symlink safety, verify-or-withhold, re-run no-ops, honest status surfaces),
  the large systems (multibrain, security chain, lock PRD, storage
  hardening, MCP door, truthfulness gates, E2E tours), numbers, verification
  at HEAD, merge plan. Suite counts fact-checked (169 test files, ls | wc -l).
- Gates: journey 14/14, migrations 28/28, grand tour 18/18, eslint touched
  0 errors (pre-existing vaf warning only).

---

## Session (2026-10-05 — pass 120: migration + onboard journey)

Owner picked path A (final sanity + merge to main) with one addition: test the
migration and onboard systems first, because old main is the single-brain
system and real users will cross that bridge. The journey suite found five
real bugs the unit-level fixtures had missed:

- **test/migrate-onboard-journey.test.js (NEW, 11 gates):** drives the REAL
  CLIs on full repo-copy fixtures shaped like origin/main (flat public +
  private brain, state.json with no stack): onboard status LEGACY + migrate
  hints, onboard wake survives a not-yet-migrated brain, `vant migrate
  --brain-name` imports exactly 9 files with verified:true, status flips to
  CURRENT, onboard files/read/search all see the imported brain, re-run
  settles ("Nothing to migrate"), hostile --brain-name falls back to a safe
  name, `vant start` on a legacy tree shows the banner with REAL content
  winning, `vant start` on a fresh tree seeds and reports CURRENT.
- **Bug 1 (marker I/O booted the runtime):** migrations._readMarker and
  _writeMarker routed through FileStorage, dragging the storage-to-brain
  require chain into EVERY status()/detect() call. Brain boot's lazy escrow
  init then materialized models/private/vant/orgchart/escrow.json on the
  legacy tree BEFORE the import plan ran; the plan took it as a source and
  nested the scaffold INSIDE the user's named brain (phantom <brain>/vant/).
  Fix: plain fs read plus primitives.atomicWriteFile (zero-Vant-requires
  tier) on the fixed metadata path.
- **Bug 2 (dropfiles re-fired forever):** pure content re-detection made a
  migrated brain's own state/*.json look like legacy dropfiles on every run:
  the tree never reported up-to-date and each start re-moved a file. Fix:
  marker-supersedes (status() and migrate() skip steps whose era the marker
  covers; crash recovery intact: no marker means content-only detection),
  plus an explicit deferral guard (dropfiles no-ops while the legacy import
  owns the tree).
- **Bug 3 (seed shadowing in start.js):** seedStarterBrain ran BEFORE the
  migration spawn, so on a real old-main tree the placeholder identity.md
  won existing-wins over the user's real files, stranding them at the
  private root with the tree still LEGACY (skippedExisting:1 proves the
  shadow). Fix: seed after mig.on('close'), and in the --no-migrate branch.
- **Bug 4 (scaffold planned as content):** apply() opened the store BEFORE
  plan(), so the boot writes above polluted even a fresh-process import.
  Fix: plan-then-store ordering, plus _runtimeOnlyDir skips runtime-only
  dirs (orgchart, .locks, live state) in the dir pass.
- **audit-locks PATH_LITERAL_OK adds lib/migrations.js:** _runtimeOnlyDir
  CLASSIFIES .locks dirs (a membership test, never a path builder); the
  allowlist comment records why. audit-ledger-cli gate C is green again
  (was 11/13 while the audit tripped).
- Gates: journey 11/11, migrations.test.js 28/28, onboard 10/10, grand tour
  18/18, sweep 168/168 (env-free), npm test exit 0, test-core 5/5, test-all
  exit 0, npm run check exit 0, lints x4 PASS, audit-locks PASS, audit-mcp
  296 reg / 59 skip / 0 threw / 0 timeout / 0 invalid / 149 refused / 88 ok /
  0 phantom (exact baseline), eslint touched files 0 errors.

---

## Session (2026-10-05 — pass 119: the whole system, exercised live)

Continued from an interrupted session that had started an "actually use vant, cli,
mcp, everything" E2E tour. Finished it; the tour found a REAL disconnect, and
finishing it surfaced a second, older one in the gates themselves:

- **E2E grand tour (test/e2e-grand-tour.test.js, 18 gates, ~1.5s):** the unit
  sweep proves the parts; this proves the SYSTEM. Gate A: a clean `git clone`
  of this tree (no node_modules, no private brains) boots — `vant health`
  finds the template brain, `vant migrate` reaches layout v3, `--sweep`
  reports no debris (NODE_PATH bridges deps; a real user runs npm install).
  Gate B: the LIVE MCP door on a scratch port — /tools = 296, /mcp/exec
  vant_health ok, agent_spawn is DENY-BY-DEFAULT with a surfaced refusal,
  sudo_grant escalation CONNECTS (spawn/list/kill lifecycle after grant),
  malformed JSON does not 500, DNS-rebind Host refused. Gate C: hostile
  VANT_BRAIN (../../etc, .., a/b) falls back to a safe name, storage
  traversal refused both ways, canWrite=false gives the honest E_SANDBOX
  refusal (no id, no row).
- **The disconnect the tour found: MCP `sudo_grant` stored the grant under
  the RAW capability name while sandbox verdicts consult the MAPPED scope
  (sandbox.can('canSpawn') asks sudo.can(agentId, 'spawn'), CAP_TO_SCOPE,
  prd-sudo.md table). A granted canSpawn could never satisfy a canSpawn
  check — the door's escalation path was disconnected.** Fix: grant the
  mapped scope, keep the raw name too (widening union). `vant_sudo_grant`
  was already correct (its param IS a scope). Gate: tour gate B proves
  spawn-after-grant end-to-end; the live door's sandbox identity is
  'default'.
- **The older one: the bin-truthfulness gate's documented STATUS-FIELD-OK
  escape hatch was dead code since pass 80** — the tripwire checked the
  marker against the COMMENT-STRIPPED source, where comments no longer
  exist. Consequence: bin/health.js's legitimate `lock.stats().held` mutex-
  counter read (a REAL field, lib/lock.js _stats.held) was an unfixable red
  gate since pass 117 (the pass-117/118 "lint:helpers PASS" claims were
  wrong). Fix: the hatch now checks the RAW lines (stripComments is a 1:1
  line map, indexes align); bin/health.js carries the marker with the
  reason. New test/bin-truthfulness.test.js (3 gates, temp fixture
  bin/zz-gate-tmp.js): unmarked phantom field fails, marked passes (hatch
  alive), and the hatch is line-scoped (an unmarked SECOND phantom line in
  the same file still fails).
- **Docs:** docs/reference/sudo.md gained an MCP-tools section (the two
  grant doors side by side: capability-style sudo_grant maps through
  CAP_TO_SCOPE; vant_sudo_grant grants a scope directly).

Gates: sweep 168/168 env-free (+2 suites), npm test 15/15, test-core 5/5,
test-all 0, lint:locks 0 leaked, lint:docs 131 PASS, lint:surface PASS,
lint:helpers PASS (hatch repaired), check OK, eslint touched 0 errors
(also flushed a pre-existing zero-width space in check-bin-truthfulness.js's
docstring), audit-mcp 296/59/0/0/0/149/88/0 exact baseline, audit-locks
PASS, scratch wiped (legit brains only), tmp clone cleaned.
NEXT: no open work from this pass. Candidates: run the tour's fresh-install
gate against an actual `npm install` (CI-slow, skipped by design); more
cross-surface tours (CLI verbs vs lib returns) if the owner wants them;
otherwise owner's next direction.

## Session (2026-10-05 — pass 118: targets #4 + #5 + #6)

All three remaining post-PRD targets delivered in one pass:

- **#5 Sync-acquire spin hygiene.** The wait window in `lock.acquire`
  busy-waited in 25ms full-CPU bursts (teams' waitMs=8000 → 8s of core
  burn per contended create*). Now sleeps via `Atomics.wait` at 5ms
  granularity (bounded-spin fallback only where Atomics.wait is
  unavailable). Measured: a 400ms contended wait went from ~400ms CPU to
  ~12ms CPU; takeover latency ≤5ms (strictly better than ≤25ms). Gate E
  in lock-observability asserts CPU << wall and full-window wait.
- **#4 Lease round-2 live-fire** (test/livefire-lease2.test.js, 10
  gates): SIGKILL the live lease HOLDER (READY MARKER + stagger) → lease
  file survives byte-parseable (`JSON\n---\ntoken` intact, token matches
  the holder's marker); successor hammers acquire (real caller semantics
  — acquireBrainLock gives up after ~750ms, well under the TTL) and takes
  over via the O_EXCL CAS after frozen TTL expiry, token rotates; CHAINED
  deaths (A killed → B inherits → B killed → C inherits, bounded wait)
  then a live release clears the file; pass-117 lease counters show the
  storm (granted/forced in the process that did the work).
- **#6a Audit-rotate inspector.** `audit.listArchives()` /
  `audit.readArchive(file?, {action, limit})` (read-only, name regex
  `^audit-\d+\.json$` rejects traversal) + new `vant audit-ledger` CLI
  (list / --all / <file> / --action / --limit / --json; a stray non-flag
  arg that is not a valid archive name is E_INVALID_ARCHIVE, never a
  silent list).
- **#6b Global-lock coverage check.** audit-locks now scans every
  `pathForGlobal('<kind>')` caller against the §8.5 allowlist
  (auth-lockout, vaf-blocked, mcp-insights) and verifies the three S5
  writers still use the global root — an unknown kind or a quiet swap to
  per-brain pathFor fails the audit (gate proves it with a temp fixture,
  removed after the live catch).
- **Live-fire lessons (new):** the LEASE root is repo-level
  `models/private/.locks/` (`.lock-<brain>.json` named for the BRAIN) —
  the per-brain `.locks/` is the MUTEX root (§8.3 two-roots); passing
  `{brain}` explicitly in lease tests is mandatory, otherwise children
  fight over the REAL vant lease. `acquireBrainLock`'s bounded retry
  budget makes single-shot takeover probes useless — hammer it. Base64
  through nested template literals corrupted content; encodeURIComponent
  is the safe child→parent channel for file text.
- **Gates:** livefire-lease2 10/10; audit-ledger-cli 13/13 (inspector
  lib + real CLI + allowlist break test); lock-observability 23/23
  (+gate E); sweep 166/166 env-free; npm test 15/15; test-core 5/5;
  test-all 0; lint:locks/docs/surface/helpers PASS; check OK; eslint
  0 errors; audit-mcp 296/59/0/0/0/149/88/0 exact baseline; scratch wiped.
  Docs: locks operations (wait posture), CLI reference (audit-ledger).
  NEXT: post-PRD menu is EMPTY. Candidates: owner's next direction.

## Session (2026-10-05 — pass 117: observability + janitor)

Both post-PRD targets delivered in one pass (they share the health seam):

- **#2 Lock observability.** `lock.stats()` (new export): acquires, held,
  unavailable, takeovers, releases, bodiesRun, bodyErrors, aborted,
  holdMsTotal/holdMsMax, heldNow — instrumented inside acquire/release/
  withLock/withLockSync. `brain-lock.leaseStats()`: granted, refreshed,
  denied, released, releaseDenied, forced. Process-local by design (the
  audit ledger is the durable cross-process trail); delta-read pattern;
  NO reset API (a resettable counter can lie about the past). Surfaced in
  `vant health` (mutex + lease lines), `health.getStackHealthStatus()`
  (lock.mutex / lock.lease), and new MCP `vant_lock action="stats"`.
- **#3 Debris janitor.** `storage.sweepTemps({root, maxAgeMs, dryRun,
  maxDepth})`: recursive scan for `<name>.<ext>.<uuid>` files older than
  the age guard (uuid shape + age = safe: in-flight temps are fresh; real
  files do not end in a bare uuid). `vant health` REPORTS (read path,
  dryRun — a read must never mutate); `vant health --sweep` REMOVES
  (operator intent). The pass-115 passive per-target sweep still reclaims
  on next write — the janitor covers targets never written again.
- **Gates:** test/lock-observability.test.js 22/22 — delta-based mutex
  counters (clean run / contended refusal / body error / stale takeover /
  broken root / withLockSync / heldNow), lease counters (grant, same-agent
  refresh with stable token, owner release, denied release, force), janitor
  (dryRun finds aged incl. nested, never fresh/bystanders, symlink skipped
  with victim intact, real sweep removes exactly the aged), surfacing
  (health fields + MCP action). sweep 164/164 env-free; npm test 15/15;
  test-core 5/5; test-all 0; lint:locks/docs/surface/helpers PASS; check
  OK; eslint 0 errors; audit-mcp 296/59/0/0/0/149/88/0 exact baseline;
  scratch wiped. Docs: locks reference + operations, mcp-tools vant_lock.
  NEXT: post-PRD #4 (lease round-2 live-fire), #5 (sync-acquire spin
  hygiene), #6 small fry — owner's pick.

## Session (2026-10-05 — pass 116: post-PRD target #1, honest outcomes everywhere)

Extended the pass-115 honest-outcome contract to every other §8.5
(a)-guarded writer. Four lies found, fixed, gated:

- **auth._saveLockedAuth** discarded withLock's return entirely — the
  fail-closed abort was not even logged, and `recordFailedAttempt` reported
  `{locked:true}` while the brute-force LOCKOUT was memory-only (restart
  unlocks the attacker). Now `withLockSync` + honest return;
  `recordFailedAttempt`/`clearFailedAttempt` surface
  `{persisted, code:'E_SAVE_REFUSED'}`.
- **vaf._saveBlockedIPs** — same shape; `recordFailedAttempt` was void. Now
  `{count, blocked, persisted, code?}`.
- **mcp brain_share** returned `{shared:true}` on abort with the insight
  written NOWHERE. Now `{error, code:'E_SAVE_REFUSED'}`; insights.json
  byte-identical under refusal (body never runs).
- **agents._saveAgents** resolved `undefined` on abort AND cleared `_dirty`
  (killing the flush()/beforeExit retry path). Now resolves
  `{ok,reason,aborted}`, keeps `_dirty`; `terminate`/`prune`/`restoreState`
  surface `{persisted:false, code}` (terminate stays boolean-compatible:
  true on clean kill, refusal OBJECT on refusal, false when not found);
  `bin/agents.js kill` prints the warning.
- **agents.restoreState tombstone gap (caught live by the gate):** restored
  ids were never noted seen, so a refused `terminate` RESURRECTED the agent
  on the retry save. Fixed with `_noteAgentSeen` per restored id.
- **Second-order finding:** auth/vaf called the ASYNC `withLock` from SYNC
  functions — `.aborted` on a Promise is always undefined; any abort check
  on the async call is dead code. Both converted to `withLockSync`.
  audit-locks F12 now `withLock(?:Sync)?\(` (same as F7).
- Already honest, re-pinned for parity: config (false), citations (null),
  habitat (null), state-store persistMerged (false). The (b)-accept
  persistMerged callers stay fire-and-forget (API honest, logs loudly,
  next-mutation save self-heals).

Gates: test/save-refusal-parity.test.js 16/16 (broken-root, native); sweep
163/163 env-free; npm test 15/15; test-core 5/5; test-all exit 0;
lint:locks 0 leaked; lint:docs/surface/helpers PASS; npm run check OK;
eslint touched 0 errors; audit-mcp 296/59/0/0/0/149/88/0 exact baseline;
scratch wiped. Documented as labs/LOCKS.md §8.12. NEXT: post-PRD target #2
(lock observability in health/MCP) or #3 (debris janitor), owner's pick.

## Session (2026-10-04 — pass 115: the two pass-114 findings, fixed)

Owner asked to fix both product findings from the live-fire session. Both
destroyed, with gates:

- **create* LYING SUCCESS — FIXED.** Root cause: `_saveTeams()` was an
  async wrapper around a lock whose acquire (bounded wait included) already
  completed synchronously — the promise only HID the outcome, so
  fire-and-forget callers reported success while the save was fail-closed
  refused. Fix: new `lock.withLockSync()` (sync twin of withLock, same
  acquire/failMode/release discipline, plain-value return) + `_saveTeams()`
  is now SYNC returning the honest `{ok, reason}`; all 11 mutators snapshot
  the org model (`_snapshotOrgModel` with shallow-copied values +
  `_seenKeys`), mutate, and on refusal ROLL BACK + return
  `{error, code:'E_SAVE_REFUSED', reason}` (existing {error,code} contract;
  bin/org.js already handles .error). `restoreState` returns `persisted`.
  Second flavor found mid-pass and fixed: a store.write failure inside the
  lock body was swallowed — would have returned {ok:true}; the body now
  returns its own outcome (withLockSync resolves to the fn's value).
- **atomicWrite DEBRIS — FIXED.** `atomicWrite` calls
  `_sweepStaleTemps(filePath)` before writing: same-dir scan for
  `<basename>.<uuid>` (strict uuid regex), lstat mtime older than
  TEMP_DEBRIS_MS=60s, unlink best-effort try/catch. Scoped per target;
  fresh in-flight temps (concurrent writers) untouched by the age guard.
- **Gates:** livefire-kill9 6/6 — gate C now asserts the refusal is
  SURFACED (refusedCode === 'E_SAVE_REFUSED'); new gate D debris sweep,
  deterministic (plants its own `<target>.<uuid>` temp when the kills
  happen to leave none — kills landed mid-writeFileSync only sometimes).
  lock.test 19/19 (+4 withLockSync). teams-crossprocess 9/9 — new gate C:
  in-process fresh held lock → createOrg refuses E_SAVE_REFUSED with NO
  in-memory row; after release the same call persists for real.
  lock-failclosed 6/6 — the old pass-103 gate Pinned the lying success
  ("refuses but keeps it in memory"); updated to the new honest contract.
- **Regex footgun caught by the gate itself:** `withLockSync?\(` makes only
  the final `c` optional (Syn mandatory) — it stopped matching plain
  `withLock(` and lint:locks failed on the three writers that never
  changed. Correct form: `withLock(?:Sync)?\(`.
- **Docs:** withLockSync added to docs/reference/locks.md export table +
  notes, and docs/operations/locks.md key facts.

Gates: sweep 162/162 env-free, npm test 15/15, test-core 5/5, test-all
exit 0, lint:locks 0 leaked (F7/F12 green), lint:docs 131 files,
lint:surface + lint:helpers PASS, npm run check syntax OK, eslint touched
files 0 errors (pre-existing warnings only), audit-mcp 296 reg / 59 skip /
THREW 0 / TIMEOUT 0 / INVALID 0 / REFUSED 149 / OK 88 / PHANTOM 0 (exact
pass-114 baseline), scratch wiped (legit brains only).
NEXT: no open work from the live-fire list. Candidates: audit ledger
rotation inspection helper, lease-ttl doc example, owner's next targets.

## Session (2026-10-04 — pass 114: live-fire, targets 2-6)

The owner's remaining destructive list, executed as three permanent gate
files (self-contained child-process tests, scratch brains, REAL kills):  
`test/livefire-kill9.test.js` (4 gates) + `test/livefire-lease.test.js`
(2 gates) + `test/livefire-stress.test.js` (4 gates).

- **kill-9 mid-save (target 2): STURDY, two findings.** Stale takeover
  after SIGKILL works (5/5 iterations: take-over, write, no leak);
  FileStorage temp+rename survives 5 mid-write SIGKILLs of ~5 MB writes
  (target always valid JSON). `teams._saveTeams` recovers via fail-closed
  refusals then stale takeover at the real 10s staleness. FINDINGS:
  (a) **atomicWrite debris gap** — SIGKILL during writeFileSync leaves
  permanent `<file>.<uuid>` temp debris (3 files observed); nothing sweeps
  it. Candidate fix: opportunistic same-target temp sweep (age > ~60s) on
  write. (b) **create* LYING SUCCESS** — teams.createOrg returned
  `{id,...}` while _saveTeams was fail-closed REFUSED: the org existed only
  in memory and would vanish on restart. Top follow-up: propagate the
  abort marker through the create* APIs (sync create + fire-and-forget
  save makes the refusal invisible).
- **TTL-expiry under load (target 3): HELD.** 2s-TTL holder + 3 contender
  processes hammering: ~70 continuous samples during the storm showed ZERO
  two-holder instants; contenders took turns cleanly via release. First
  probe design error (planted lock's JSON `at` field vs REAL mtime —
  acquire staleness is MTIME-based; fs.utimesSync to plant stale state).
- **force-release during active writes (target 4): SAFE.** Admin
  force-release landed mid-write-loop; the lease changed hands and EVERY
  mutex-guarded write from both writers landed whole (A and B rows intact,
  no interleaving corruption). Lease=who, mutex=not-at-the-same-time —
  now proven under destruction.
- **CAS two-holder stress at scale (target 5): HELD.** 12 iterations x 2
  racers on a stale mutex lock: all rows serialized, zero leaks, zero lost
  updates. 8 iterations x 3 racers on a stale lease: exactly ONE holder
  per iteration (O_EXCL create-or-fail arbiters every race).
- **symlink replant attacks (target 6): DEFENDED.** Attacker swapping the
  lock path for a symlink to a victim file every 5ms, on both the mutex
  path and the lease path: sweeps unlink the LINK (never the target),
  victims survived byte-for-byte, writers completed all ops.
- **Harness gotchas (for future destructive tests):** killAfterMs-from-
  spawn is useless (module load eats the first ~1.5-2s — use a READY
  MARKER file + staggered kill); withLock resolves to the fn's RETURN
  VALUE (the {ok,reason} object only appears on the abort path); the lease
  file is `JSON\n---\ntoken` split format (JSON.parse of the raw file
  throws); judge success by PERSISTENCE, not by create* return values.

Gates: sweep 162/162 env-free (3 new suites), npm test 15/15, test-core
5/5, test-all exit 0, lint:locks 0 leaked, audit-mcp 296/0/0 baseline,
eslint 0 errors, check OK, scratch wiped (legit brains only), zero leaked
locks/temps. NEXT: owner decisions on the two live-fire product findings
(atomicWrite debris sweep; create* lying success), then next targets.

## Session (2026-10-04 — pass 113: live-fire, EPIPE target)

Live-fire target 1 per the owner's list. Found, fixed, verified:

- **The storm was LIVE.** models/private/vant/.audit.json had grown to 47.55
  MB / ~165k rows and was still appending at ~1/sec during this session. 100%
  of rows were `fatal/uncaughtException/write EPIPE` noise (25-29 legit rows
  preserved).
- **Root cause chain (three defects):** (1) two zombie QC probe processes
  from Sep 30 (`node -e` MCP probe + `bin/trust.js --help`) spun at ~85% CPU
  each for 3.5 days writing to dead pipes -> EPIPE; (2) lib/vant.js's global
  uncaughtException handler console.error()'d every fatal — on a dead pipe
  that write throws EPIPE AGAIN, re-entering the handler (self-feeding loop,
  172k re-entries observed in the repro) — and audit.log()'d every pass;
  (3) audit.log() rewrites the ENTIRE ledger per append, so each fatal cost
  O(filesize) — the amplifier that turned noise into 47 MB.
- **Fixes (native, no shims):** lib/vant.js fatal handlers now use a
  re-entrancy flag + 1s cool-down (`FATAL_LOG_COOLDOWN_MS`) + stderr writes
  wrapped so a throwing stream can never re-enter; lib/audit.js caps the
  ledger at LEDGER_MAX_ENTRIES=10000 at the write sites (log/batch via
  _capLedger: trim between 1x-2x, in-place archive to models/audit-rotate/
  at 2x — in-place so the caller's pending entry survives; rotate() itself
  unchanged).
- **Probe caught a bug in the fix itself:** first version referenced
  FATAL_LOG_COOLODEDOWN_MS (typo) — child died exit 7 (handler-internal
  failure, silent under a broken stderr). Exactly the class of defect this
  session exists to catch.
- **Verification:** deterministic repro (broken-stderr simulation + real
  uncaughtException storm): 397-415 fatals + 172-175k EPIPE re-entries -> 3
  cool-down-spaced ledger rows (was unbounded). Promoted to permanent gates:
  test/epipe-guard.test.js (forked child, scratch brain via VANT_BRAIN, 2
  gates) + test/audit.test.js (+2 cap gates: trim at 1x, archive at 2x).
- **Zombies killed:** PIDs 372828 + 374259 (SIGKILL); the two bin/mcp.js
  MCP-door servers were left alone (idle, plausibly wanted).
- **Ledger sanitized:** 165,311 -> 29 rows (all legit ops history:
  governance/memory_state/consensus), 47.55 MB -> 14.3 KB. models/
  audit-rotate/ gitignored.
- **Gotchas for future passes:** getBrainPath() honours process.env.
  VANT_BRAIN FIRST — that (not pushBrain) is the test-isolation lever;
  audit archives are BARE ARRAYS (rotate()'s shape), not {entries:[]};
  the 2x archive's overflow row lands in the KEPT half (it is newest), so
  cleanup must track the exact filename.

Gates: sweep 159/159 env-free (new suite), npm test 15/15, test-core 5/5,
test-all exit 0, lint:locks 0 leaked, audit-mcp 296/0/0 baseline, lint:docs
131 green, surface/helpers PASS, eslint 0 errors (pre-existing warnings
only), check syntax OK, scratch wiped. NEXT: remaining live-fire targets —
kill-9 mid-save races across all guarded writers, TTL-expiry under load,
force-release during active writes, CAS two-holder stress at scale, symlink
replant attacks.

## Session (2026-10-04 — pass 112: stage S6, documentation)

Owner green-lit S6 then the live-fire session ("yeah let's light it up!").
Executed PRD stage S6 (labs/LOCKS.md §8.6): F13 closed.

- **docs/operations/locks.md (new):** the two types side by side, both lock
  roots and why they differ, lease usage (CLI + programmatic, same-agent
  refresh, CAS takeover, token-verified release), mutex usage (withLock /
  pathFor / pathForGlobal, reason values, always-Promise contract), the
  which-path-helper table (per-brain vs repo-scoped), failure postures, the
  NOT-a-lock table, diagnostics.
- **docs/reference/locks.md (new):** full export tables for both modules,
  `vant lock` CLI verbs (verified against bin/lock.js — acquire/release/
  status/force + short forms; no `stack` CLI verb), the `vant_lock` MCP
  tool (all 5 actions + return shapes), on-disk path table.
- **mcp-tools.md:** vant_lock entry expanded (5 actions, params, API link);
  Return Types row updated from the stale `{ token }`.
- **Indexes + README:** operations/reference index rows (nav_order 66/136);
  README Reference section points at the ops page.
- **ROADMAP.md:** stale "TODO / rate limits" lock lines (557/599/606)
  refreshed to the shipped state with doc pointers.
- **Docstrings:** audited — already accurate (pass 105 removed the
  rate-limit claim; the only `flock` mention is lock.js's correct historical
  rename note).

Gates: lint:docs PASS (style + links), lint:locks/surface/helpers PASS,
check OK, sweep 158/158 env-free, npm test 15/15, test-core 5/5, test-all
exit 0, audit-locks 0 leaked, MCP audit 296/0/0, scratch wiped. NEXT: the
owner's live-fire/destructive real-time session — EPIPE audit-log pollution
first (models/private/vant/.audit.json hit 44 MB / 147,913 EPIPE fatals),
then kill-9 mid-save races, TTL-expiry under load, force-release during
active writes, CAS two-holder stress at scale, symlink replant attacks.

## Session (2026-10-04 — pass 111: stage S5, unguarded-writer triage)

Owner: "What else do we have in labs/locks? We can start live fire and
destructive, real-time once we're done." Executed PRD stage S5 (labs/LOCKS.md
§8.5): triaged all 11 unguarded whole-snapshot writers.

- **(a) guarded (5):** auth lockout, vaf blocklist (both security state —
  merge-under-lock via new `lock.pathForGlobal` repo-scoped root), brain
  config (disk-only top-level keys preserved, stays sync), mcp insights
  (re-read after embed awaits, dedupe by id, cap 100), citations (re-read,
  fail-closed null). Behavioral gates in test/snapshot-guards.test.js (6).
- **(b) accepted (6):** audit ledger (diagnostic, hash-chained), sync states
  (self-healing), skills/islands manifests (regenerable), succession
  (owner-operated), migrations marker (idempotent boot-time).
- **Bonus fix:** auth's lockout branch never saved — lockouts were
  memory-only until the next failure. Now persisted.
- **Harness catch:** first vaf merge used Object.entries(Map) → [] → dropped
  local blocks; the new gate caught it immediately. Map iteration required.
- Matrix recorded in labs/LOCKS.md §8.5. audit-locks now FAILS if any of
  the five drops its withLock guard (F12 regression gate).

Gates: sweep 158/158 (env-free — new suite), lints ×4, eslint 0 errors,
check, npm test, test-core, test-all, audit-locks 0 leaked, MCP audit
baseline (296/0/0), scratch wiped. NEXT: S6 (docs — locks.md ops +
reference, MCP entry, README, ROADMAP, docstrings), then the owner's
live-fire/destructive real-time session (EPIPE audit pollution is a target).

---

## Session (2026-10-04 — pass 110: native lock contention)

Owner: "Qtf is anything called a monkey patch involved... We need to make
native fixes no fallbacks, shims."

- **lib/lock.js:** withLock calls the internal `acquire` directly again —
  the pass-109 `module.exports.acquire` indirection existed only to keep the
  tests' `lock.acquire = heldFail` property replacement intercepting.
  Product code no longer bends around a test technique.
- **Native contention in gates:** lock-failclosed + market gate D now place
  a regular FILE at the scratch brain's lock root — every real acquire()
  fails `unavailable` instantly (mkdirSync on a file throws). Real
  filesystem failure path, no property replacement. Gate C's spy stays
  (wraps + delegates — measurement, not behavior).
- **Bonus bug flushed out:** teams._saveTeams checked `.aborted` on
  withLock's PROMISE return without awaiting — the fail-closed log had been
  dead since pass 109 (refusal worked, observability didn't; disk-state
  assertions never caught it). Now awaited; write stays synchronous (withLock
  runs the body synchronously when the lock is available) so the pass-89
  restoreState exit-safety contract holds.

Gates: sweep 157/157 (env-free), lints ×4, eslint 0 errors, check, npm
test, test-core, test-all, audit-locks 0 leaked, MCP audit baseline
(296/0/0), scratch wiped.

---

## Session (2026-10-04 — pass 109: stage S4, withLock migration)

Owner: "Yeah let's def love to S4. Ty!" Executed PRD stage S4 (labs/LOCKS.md
§8.6): migrated the four whole-snapshot writers onto lock.withLock, closing F7.

- **Converted** state-store.persistMerged, teams._saveTeams,
  agents/internal._saveAgents, habitat.save — failMode 'closed', same
  {staleMs:10000, waitMs:8000}, merge-under-lock preserved, fail-closed
  messages unchanged. Dead _acquire/_release helpers removed (path helpers
  kept).
- **persistMerged is now async** (withLock returns a Promise). Lib callers
  ignore the return; lock-failclosed's two persistMerged tests now await it.
  teams._saveTeams keeps its sync body + _teamsSaveChain return; habitat
  keeps state/null.
- **withLock honors the lock.acquire monkeypatch seam** (routes through
  module.exports.acquire) so fail-closed tests keep intercepting it.
- **audit-locks F7 gate**: all four writers must contain withLock( —
  hand-rolled acquire/release sneaking back fails the audit.
- **market-crossprocess gate C spy** now counts only 'market-trade' path
  locks (F7 legitimately added persistMerged to the withLock family; the
  gate's intent is per-listing lock SCOPE).

Gates: sweep 157/157 (env-free), lints ×4, eslint 0 errors (5 pre-existing
warnings), check, npm test, test-core, test-all, audit-locks (0 leaked, F7
gate active), MCP audit at baseline (296/0/0), scratch wiped.

---

## Session (2026-10-04 — pass 108: lock defect hunt, four bugs fixed)

Owner: "Let's do a solid pass on recent lock commits, there are Def bugs."
Probe-driven hunt over the lock commits (102–107); confirmed and fixed FOUR:

- **L1 (brain-lock) — same-agent re-acquire failed.** Dead branch
  (`existing.token === token`, token freshly generated per call) meant a
  re-acquire of the agent's OWN held lease was treated as contention and
  returned null after ~1.5s of backoff. Fixed: refresh by agentId, file
  token kept stable, emits `brain-lock:refreshed`.
- **L2 (brain-lock) — takeover race → two holders.** Stale takeover was a
  blind atomic REPLACE (temp+rename, no re-check): two takers of the same
  stale lease could both replace and both verify (1/12 probe races). Fixed:
  re-check + O_EXCL (`wx`) create = CAS; losers re-read and back off;
  symlink guard preserved.
- **L3 (lock mutex) — release clobbered successor.** release()/exit hook
  unlinked by path with no ownership check; after a stale takeover the
  stalled predecessor deleted the successor's live lockfile (deterministic
  repro). Fixed: pid-verified `_ownsLock` in both paths + bounded takeover
  loop (hostile replant).
- **L4 (brain-lock) — forceReleaseBrainLock returned undefined** → MCP
  `vant_lock force` reported `forceReleased: undefined`. Now boolean +
  `brain-lock:force-released` event.

Evidence: scratch probe (pre-fix A null / B 1-of-12 double-win / C successor
lock deleted / E undefined; post-fix all clean), then deleted. Tests:
lock 13→15, brain-lock 18→21. Gates: sweep 157/157 (env-free), lints ×4,
eslint 0, check, npm test, test-core, test-all, audit-locks (0 leaked),
MCP audit at baseline (296/0/0). Scratch wiped.

---

## Session (2026-10-03 — pass 107: stage S3, wire-up completion)

Owner: "Let's do s3!" Executed PRD stage S3 (labs/LOCKS.md §8), closing F6 and
finishing the wire-up matrix's S3 row.

- **F6 — tmp direct require.** `lib/tmp.js` put/delete now lazy-require
  `./brain-lock` and call `acquireBrainLock`/`releaseBrainLock` directly,
  instead of `global._lock?.acquire?.` (a shared global only bin/tmp.js/shell/
  sandbox set — any other caller silently ran unlocked). shell.js was the only
  remaining `global._lock` writer; it now uses a local lazy cache, so the global
  is gone. bin/tmp.js no longer wires it.
- **Health surface.** `health.getStackHealthStatus` returns a `lock` field
  `{layer, byBrain, held}` (read-only stack helpers, no pushBrain mutation).
  `vant health` prints a Lock section.
- **MCP.** `vant_lock` `status` now includes `stack` + `held`; added a `stack`
  action for the whole-stack view.
- **CLI.** `vant lock status` prints the whole-stack view; help text updated.
- **boot init.** Removed the dead `if (lock.init)` branch (brain-lock has no
  init); loading the module is what makes `getLayerStatus().lock` real.

Tests: test/brain-lock.test.js +4 (MCP status/stack, health lock, CLI status),
test/health.test.js +1, test/tmp.test.js +3 (static F6 gates + a `vant tmp
create` spawn with no global). 11 files.

**Harness note:** the sweep must run WITHOUT `VANT_BRAIN` set —
test/migrations.test.js's spawned read probe inherits it and overrides the
migrated currentBrain, producing a false failure. 157/157 with it unset.

Gates: sweep 157/157, lint:locks/docs/surface/helpers PASS, eslint 0 errors,
`npm run check`, npm test 15/15, test-core 5/5, test-all exit 0, MCP audit 296
reg / THREW 0 / PHANTOM 0, zero leaked locks, scratch wiped.

---

## Session (2026-10-03 — pass 106: stage S2, separation-of-concern contract)

Owner: "Let's continue on LOCKS 2!" Executed PRD stage S2 (labs/LOCKS.md §8),
closing findings F8–F11 by naming the contract in code and making the audit
assert it.

- **F8** two lock roots documented in the code headers: mutex `/lib/lock.js`
  = per-brain `models/private/<brain>/.locks/` (via `pathFor`); lease
  `/lib/brain-lock.js` = cross-brain `models/private/.locks/.lock-<brain>.json`,
  replaced atomically (temp+rename), NOT O_EXCL. Added a SOC block to each
  saying neither substitutes for the other and they must not be folded.
- **F11** `lib/recursion.js guard` header now states it is a depth/reentrancy
  guard, not a lock, and deliberately requires NEITHER lock module.
- **F10** the in-process save chains (`_teamsSaveChain` lib/teams.js,
  `_saveChain` lib/agents/internal.js) are labelled write-ordering-only in code;
  the cross-process control is the lockfile taken in `_saveTeams`/`_saveAgents`.
- **Audit** `scripts/audit-locks.js` extended to ASSERT the contract:
  mutex root per-brain, lease root cross-brain, neither module requires the
  other, `recursion.js` requires neither lock module, and both whole-snapshot
  writers require the mutex. Prints the roots + non-lock + guarded-writer rows.

No renames (PRD: avoid unless cheap). 6 files touched. Gates: sweep 157/157,
lint:locks PASS, lint:docs/surface/helpers PASS, eslint 0 errors, `npm run
check`, npm test 15/15, test-core 5/5, test-all exit 0, MCP audit 296 reg /
THREW 0 / PHANTOM 0, zero leaked locks.

---

## Session (2026-10-03 — pass 105: stage S1, truth-up the lease)

Owner: "start fixing and building." Executed PRD stage S1 (labs/LOCKS.md §8),
closing findings F1–F5.

- **F1 rate limit — REMOVED, not wired.** The lease is acquired HOT by internal
  writers (sandbox write, shell exec, tmp) as well as `vant lock`; a per-agent
  per-minute cap would throttle those. Rate limiting is QoS's concern. Deleted
  the dead `_checkRateLimit` (which also referenced an undefined `errors`), the
  `RATE_LIMIT_WINDOW`/`MAX_ACQUIRES_PER_MINUTE` constants, the unused
  `rateLimits`/`acquireAttempts` maps, and the docstring claim.
- **F2** added `getLayerStatus()` matching sibling layers → `vant boot` no
  longer hardcodes the lock layer.
- **F3** `listStackLocks` now emits real held-lock rows (was spreading
  brain-name strings into `{0:'a',...}` junk); `listBrainLocks` removed; stack
  helpers pass the brain explicitly instead of pushBrain/removeBrain.
- **F4** `bin/lock.js release` tests `result.success` (was truthiness on an
  always-object → false "Lock released" + token wipe on a DENIED release).
- **F5** `getState().lockStatus` returns the status value, not the function.

`test/brain-lock.test.js` rewritten (async runner, 14 cases incl. F2–F5 gates;
F4 spawns `bin/lock.js release` with a wrong token and asserts no success + the
.token file survives). Gates: sweep 157/157 chunked; lint:docs/surface/helpers/
locks PASS; `npm run check`; eslint 0 err; audit-mcp 296 / THREW 0 / PHANTOM 0;
npm test 15/15; test-all exit 0; test-core 5/5; zero leaked locks.

**Next:** S2 — separation-of-concern contract (F8–F11).

---

## Session (2026-10-03 — pass 104: lock-system walk-back audit + full PRD)

Owner: walk back through the lock system, find what should be wired, verify
separation of concern, document all — as a multi-stage plan in labs/LOCKS.md.

**Delivered:** `labs/LOCKS.md` §8 — a full-system PRD with a grounded
walk-back audit (13 findings), a separation-of-concern contract, a wire-up
matrix, an unguarded-writer triage list, and stages **S1–S6** with acceptance
criteria + gates.

**High-severity findings (evidence in §8.2):**
- F1: `brain-lock` rate limit is **declared but never wired**, and its
  `_checkRateLimit` references an undefined `errors` (would `ReferenceError`).
- F4: `vant lock release` checks truthiness of an always-object result →
  prints "Lock released" and deletes the token even on a DENIED release.
- F12: a long tail of whole-snapshot writers bypass the mutex (the pass-95/96/98
  class) — needs per-module triage.

**Medium/low:** F2 no `getLayerStatus` (boot hardcodes the lock layer);
F3 `listStackLocks` spreads strings → junk; F5 `getState().lockStatus` returns
a function ref; F6 `tmp` locks via an implicit `global._lock`; F7 `withLock`
used by market only (4 hand-rolled sites); F8 two `.locks` roots (lease vs
mutex) undocumented; F9 lease reimplements coordination; F10 in-process save
chains unclassified; F11 recursion `guard` is not a lock; F13 no docs page.

**Next:** execute S1 (truth-up the lease). Gates unchanged; nothing executed
this pass beyond the audit + PRD.

---

## Session (2026-10-03 — pass 103 QC: gaps, edge checks)

Owner: "hit it with qc, gaps, and edge checks." Two real gaps closed + edge
coverage added.

**GAP 1 — fail-closed was untested outside market.** Added
`test/lock-failclosed.test.js` (6 cases): stub `lock.acquire` to
`{ok:false,reason:'held'}` and prove the write is REFUSED and disk is
untouched, then that it recovers when the lock returns — for
`state-store.persistMerged`, `teams._saveTeams`, `habitat.save`. (teams needs
`defaultSandbox.setCapabilities({canWrite:true})` or `createOrg` returns
`E_SANDBOX` and nothing is even attempted.)

**GAP 2 — audit regex missed a formula class.** `scripts/audit-locks.js` only
caught `+ '.lock'` and bare `'.locks'`; the old
`path.resolve(base, '.habitat.lock')` slipped through. Added a
quoted-string-ending-in-`.lock` pattern; probed all four retired formulas →
caught, comment prose still ignored.

**EDGE checks** in `test/lock.test.js` (11→13): `withLock` releases when a sync
fn throws; `withLock` closed does NOT delete a peer-held lockfile on abort.

Gates: sweep 157/157 chunked; lint:locks PASS; `npm run check`; eslint 0 err;
zero leaked locks.

---

## Session (2026-10-03 — pass 103: labs/LOCKS.md §4 items 2–6)

Owner: "another labs/locks pass. This is needed." LOCKS.md §4 now DONE
(items 2–6; item 1 was pass 102).

**Item 2 — posture in the primitive (`lib/lock.js`).** `acquire()` returns
`{ ok, reason }` with `reason ∈ {acquired, held, unavailable}` — callers can
tell peer contention from a broken FS. `withLock(path, fn, { failMode })`:
`'closed'` (DEFAULT) never runs `fn` without the lock and returns
`{ ok:false, reason, aborted:true }`; `'open'` runs `fn(result)`. A sync `fn`
is released synchronously. Added `mutex()`.

**Item 3 — one lock root.** All file locks now
`models/private/<brain>/.locks/<kind>[__<id>].lock` via `lock.pathFor(kind,id)`.
Retired the four ad-hoc formulas (state-store `.<x>.lock`, teams/agents
`<store>.lock`, habitat `.habitat.lock`, market's reuse of state-store's
formula → now `pathFor('market-trade', id)`).

**Item 4 — collapse + delete.** `lock.mutex()` (pass-90 poison-proof) now backs
consensus `_topicLocks`, `cache._withLock`, `canvas._withLock`. Deleted the
dead `storage.LockStorage` (class + `case 'lock'` + export).

**Item 5 — fail-closed.** `state-store.persistMerged`, `teams._saveTeams`,
`agents._saveAgents`, `habitat.save` no longer degrade to an unlocked
last-writer-wins write; they refuse the write and log the
`reason`. BONUS: the agents roster lock now spans merge AND write (was
released in the gap).

**Item 6 — audit.** `scripts/audit-locks.js` + `npm run lint:locks`. Enumerates
lock requires (8 mutex / 10 lease) and fails on any ad-hoc lock path outside
lib/lock.js|brain-lock.js, a resurrected lib/flock.js, or a leaked lockfile.

Tests updated for the new lock paths (teams/roster/habitat crossprocess) and
market gate D now simulates the real `{ok:false,aborted:true}` abort shape.
New `test/lock.test.js` (11 cases) pins the primitive.

Gates: sweep 156/156 chunked; lint:docs PASS (129)/lint:surface/lint:helpers/
lint:locks; eslint 0 errors; `npm run check`; audit-mcp 296 reg / 59 skip /
THREW 0 / TIMEOUT 0 / INVALID 0 / REFUSED 149 / OK 88 / PHANTOM 0; npm test
15/15; test-all exit 0; test-core 5/5; zero leaked locks.

---

## Session (2026-10-03 — pass 102: lock naming split, module + fn/method/event namescope)

Owner (on `labs/LOCKS.md`): rename `lib/lock.js` → `lib/brain-lock.js` FIRST,
then `lib/flock.js` → `lib/lock.js` ("flock is confusing — lock is clear"),
extend the naming to the fn/method level, and fix `.gitignore` for the lock
schema. OSS-facing, DRY/KISS.

**Module split.** `lib/lock.js` (authorization lease) → `lib/brain-lock.js`;
`lib/flock.js` (cross-process mutex) → `lib/lock.js`. Both headers now
cross-reference each other by the new names (the old notes inverted).

**fn/method/event namescope.** The lease exports are now brain-scoped:
`acquire→acquireBrainLock`, `release→releaseBrainLock`, `status→brainLockStatus`,
`forceRelease→forceReleaseBrainLock`; events `lock:*`→`brain-lock:acquired|released|writePermissionMissing`;
config `LOCK_CONFIG`→`BRAIN_LOCK_CONFIG`; internals `_getLockFile`→`_getBrainLockFile`,
`ensureLockDir`→`ensureBrainLockDir`, log prefix `[Lock]`→`[brain-lock]`.
The mutex keeps `acquire`/`release`/`withLock` — its module path IS the
namescope now.

**Call sites updated.** brain-lock consumers: lib/config, shell, security,
vant, boot(×2), mcp, sandbox, brain; bin/lock.js, bin/build-test.js,
bin/tmp.js, bin/node.js (`loadModule('brain-lock')`); docs/getting-started/
examples.md; ROADMAP.md layer table. mutex consumers: lib/teams, state-store,
habitat, agents/internal, market (local `flock`→`lock`), plus
market-/state-store-crossprocess tests. `lib/mcp.js` `vant_lock` handler
repointed. `bin/vant.js` router `lock: 'lock.js'` is a **bin** mapping (to
bin/lock.js) — unchanged.

**Tests.** `test/lock.test.js`→`test/brain-lock.test.js` (repointed + new
names); deleted dead `test/test-lock.js` (never collected: not `.test.js` nor
`-test.js`); `test/runner.js` lib entry → brain-lock with new fn names;
`test/ci.js` requiredFiles → `lib/brain-lock.js`; `test/concurrent-agents.test.js`
repointed (20+ method renames).

**.gitignore.** New lock-schema block: `.lock-brain-token`, `.locks/`,
`models/**/*.lock` (covers `<brain>/orgchart/*.json.lock` + `.habitat.lock`).
Removed rot: `models/public/.state.json`, `models/.resolution.json`,
`models/.providers.json` (all already covered by `models/**/.*.json`) and
`temp/models/latent/*.vpatch` (wrong path; `temp/` already ignored).

**Left open from LOCKS.md §4** (behavior changes, not renames): `{ok,reason}`+`failMode`,
one lock root + `pathFor`, collapse in-process mutexes + delete `LockStorage`,
fail-open call-site decisions, lock audit.

Gates: sweep 155/155 chunked; lint:docs PASS (129)/lint:surface/lint:helpers;
eslint 0 errors; `npm run check`; audit-mcp 296 reg / 59 skip / THREW 0 /
TIMEOUT 0 / INVALID 0 / REFUSED 149 / OK 88 / PHANTOM 0; npm test 15/15;
test-all exit 0; test-core 5/5; zero leaked locks.

## Session (2026-10-03 — pass 101: market lock + CLI help + escrow hold leak + locks inventory)

Owner asked to fix two carried-over limitations, then discuss locks.

**Fix 1 — market lock limitation (`lib/market.js`).** (a) Open-ended
(`supply: Infinity`) listings no longer take the per-listing cross-process
lock — no scarcity to protect, so not over-serialized. (b) The degraded
"proceed unlocked with a warning" posture is GONE: when the lock cannot be
taken (scarce listing) the trade FAILS CLOSED with `E_TRADE_LOCK` and
releases the buyer's escrow hold. (c) The lock no longer straddles awaits:
budget/escrow-hold/trust/governance were hoisted ABOVE the lock, so the
locked body is fully synchronous (reserve → debit → release → trades++ →
persist) — the reservation cannot outlive the lock. `test/market-crossprocess.test.js`
extended 3→8 (oversell pinned; open-ended no-lock pinned via a
`flock.withLock` spy; fail-closed + hold-release pinned). NOTE: the
open-ended `trades` counter is now a best-effort stat (both trades persist,
both succeed) — the exact cross-process count only existed BECAUSE of the
lock we removed, so gate B asserts both succeed + both rows persist +
counter >= 1.

**Fix 2 — `vant wal/mirror/s3 status` help-vs-syntax mismatch.** The
`vant --help` summary advertised bare-word parentheticals
(`wal (status/drill/reset)`, `s3 (status/test/ls/push/pull)`,
`mirror (status/verify/resync)`, `migrate (status/dry-run/apply)`) but the
parsers require FLAGS (`vant wal --status` works; `vant wal status` exits
1). `bin/help.js` and each tool's own `--help` already used flags. Aligned
the summary to `(--status | --drill | --reset <basePath>)` etc., and fixed
the bare-word s3 lines in `docs/reference/cli.md`. Regression pinned in
`test/remote-cli.test.js`.

**Fix 3 (found while fixing 1) — escrow holds leaked forever.** Adding
`_releaseBudget` to the early-return paths exposed that `escrow.release()`
never removed the persisted hold: `_saveEscrow` merged `{...disk, ...data}`,
and a RELEASED hold is simply absent from the writer's snapshot, so the
union re-added the disk copy. Holds accumulated toward `escrow.maxHolds`
(100) and then ALL later trades failed with `max_holds_exceeded`. Fix: track
`_deletedHolds` per instance and apply the deletions AFTER the union in
`_saveEscrow`. Gate added to `test/escrow.test.js`.

**Locks discussion (owner item 3) — `labs/LOCKS.md`.** Inventory +
canonicalization proposal. Confirms the "scattered/spaghetti" hunch: two
concepts share the word "lock" (authorization lease `lib/lock.js` vs mutex
`lib/flock.js`), a dead third engine (`storage.LockStorage`), four lock-path
formulas, two ad-hoc in-process mutex families, and two failure postures.
No refactor done — pending owner direction.

Gates: sweep 155/155 chunked; lint:docs PASS (129)/lint:surface/lint:helpers;
eslint 0 errors; `npm run check`; audit-mcp 296 reg / 59 skip / THREW 0 /
TIMEOUT 0 / INVALID 0 / REFUSED 149 / OK 88 / PHANTOM 0; npm test 15/15;
test-all exit 0; test-core 5/5; zero leaked locks.

## Session (2026-10-03 — pass 100: live-fire hunt — oversell + prototype pollution)

Owner: "try to break it or hack it, both single install and a mesh." Scratch
brains only. Live-fired the CLI/MCP on a fresh install and a cross-process
trade; found and fixed TWO real bugs (both with cross-process regression gates).

**Bug 1 — cross-process market oversell (mesh, economic race).** The
scarcity reserve in `market.trade` is per-process (`_reserved` deliberately
not persisted; `trades` commits only after the escrow awaits) and
`_applyMarket` skips held listings, so a peer's committed count never
arrived. Proven: two barrier-synced processes BOTH sold a supply-1 listing,
and the persisted counter desynced to 1 while two trade records existed. Fix:
per-listing cross-process `flock` across reserve→commit + `_adoptCommittedTrades`
re-reads disk `trades` under the lock. `test/market-crossprocess.test.js` 3/3
(oversell pinned; open-ended listings NOT over-serialized).

**Bug 2 — config prototype pollution (long-lived MCP server).**
`config.setConfig` walked a dotted key with `node = node[part]`; `__proto__`
resolved to `Object.prototype`, so `vant_config_set` with key
`__proto__.lfPolluted` polluted every object in the process (proven:
`({}).lfPolluted === 'yes'`). CLI shares the setter. Fix: refuse
`__proto__`/`constructor`/`prototype` segments (E_KEY_SEGMENT). Gate D in
`test/config-persistence.test.js` (13/13).

**Also probed, all correctly blocked:** storage/brain path traversal
(THREW Security: Path blocked), `vant_tmp_get` traversal (EPATH), compute eval
without sudo (EPERM), `vant_call` arbitrary module require (Tool not found).
Unwired/mismatch noted: `vant wal/mirror/s3 status` (bare word) exit 1 — the
real syntax is `--status` (help lists them as "status/drill/reset").

**GATES (all green, 155 suites now):** sweep 155/155 chunked; lint:docs PASS
(129); lint:surface PASS; lint:helpers PASS; eslint touched 0 errors;
`npm run check` syntax OK; audit-mcp 296 / THREW 0 / TIMEOUT 0 / INVALID 0 /
REFUSED 149 / OK 88 / PHANTOM 0; `npm test` 15/15; test-all exit 0;
test-core 5/5; zero leaked locks.

Files: lib/market.js, lib/config.js, test/market-crossprocess.test.js (new),
test/config-persistence.test.js (+gate D).

---

## Session (2026-10-03 — pass 99: proactive tombstones + cross-process reap)

Owner read the two pass-98 caveats and asked to close BOTH now.

**Observation 1 — append-only modules now tombstone-ready (market /
settlement).** They are append-only today (no op hard-deletes an id), so
adopt-unseen was already correct — but the owner wanted the machinery IN
PLACE so a future delete is not an "if". Added `_seenListings/_seenBids/`
`_seenTrades` and `_seenSettlements`: every id ever hydrated/adopted/created
is marked, and the merge SKIPS a seen-but-absent id (tombstone) while still
adopting unseen ones. Same behaviour today; a future `removeListing`-style
path just drops the row and the id stays seen → no resurrection from a
stale peer snapshot. Regression test drives the invariant through a
`_deleteForTest` seam → `test/state-store-tombstones.test.js` 2/2.

**Observation 2 — consensus reap is now CONVERGENT across processes.** A
`reap` is a DELETE; under in-memory-wins a peer still holding the topic
re-serialized it on its next write (resurrection). New `_reapedTopics` map
(topic→reapedAt) is PERSISTED (`reaped:[{topic,at}]`) and consulted by
`_mergeLedgers`/`_applyLedgers`: a peer that persists after a reap adopts
the tombstone and DROPS its held copy. Wired into reapSynced (set),
create/mergeTopic (clear — re-pull is the recovery path),
clearState/restoreState/gatherState. Bounded (oldest evicted past 1000).

**BUG CAUGHT BY THE NEW GATE:** a re-pull's own persist re-read the stale
on-disk reap and re-tombstoned the just-recovered topic. Fixed with
`_reapRecovered` — a clock-free "our intent wins this tick" set consulted in
`_adoptReaped`. (Would also have broken agora-hygiene's round-trip.)

**NEW `test/consensus-reap-crossprocess.test.js` 6/6**: holder holds a wire
topic while a peer reaps → holder persists and does NOT resurrect it;
tombstone persisted; survives a cold rehydrate; re-pull clears it.

**GATES (all green, 154 suites now):** sweep 154/154 chunked; lint:docs
PASS (129); lint:surface PASS; lint:helpers PASS; eslint touched 0 errors;
`npm run check` syntax OK; audit-mcp 296 / THREW 0 / TIMEOUT 0 / INVALID 0 /
REFUSED 149 / OK 88 / PHANTOM 0; `npm test` 15/15; test-all exit 0;
test-core 5/5; zero leaked locks.

Files: lib/market.js, lib/settlement.js, lib/consensus.js,
test/state-store-tombstones.test.js (new),
test/consensus-reap-crossprocess.test.js (new).

---

## Session (2026-10-03 — pass 98: state-store family cross-process lock)

Owner: "fix this: consensus / market / node-registry / settlement write
whole state-store snapshots with no cross-process lock; fire-and-forget
habitat saves can leak a lock on abrupt exit." Both fixed.

**Shared primitive `lib/flock.js`** (new): 'wx' create, stale takeover,
symlink guard, + ONE `process.on('exit')` hook that unlinks every held
lock — `finally` cannot run on an abrupt mid-await teardown, so it removes
the leak class (verified: ZERO leaked locks after the full 152-suite
sweep, vs several before). habitat / teams / agents-internal refactored
onto it (their hand-rolled lock copies removed).

**`stateStore.persistMerged` + `lockPathFor`** (new): lock (brain root,
hidden — NOT `state/`, which lib/migrations sweeps), re-read the on-disk
snapshot, adopt unseen rows, write the union. Wired into:
- **node-registry**: seen-set + `unregister` tombstone.
- **consensus**: seen-set + `reap` tombstone + vote UNION for held topics
  (votes are immutable, so a peer ballot must not be lost). Marked seen on
  EVERY `_ledgers.set` path (create, hydrate, mergeTopic, restoreState) —
  the mergeTopic omission was caught by agora-hygiene.
- **market** / **settlement**: append-only ids → adopt-unseen, no tombstone.

**NEW `test/state-store-crossprocess.test.js` 5/5**: 4 concurrent
register / 4 concurrent consensus.create all persist; unregister tombstone
not resurrected while an unseen newcomer is adopted.

**GATES (all green):** sweep 152/152 chunked; lint:docs PASS (129);
lint:surface PASS; lint:helpers PASS; eslint touched 0 errors; `npm run
check` syntax OK; audit-mcp 296 / THREW 0 / TIMEOUT 0 / INVALID 0 /
REFUSED 149 / OK 88; `npm test` 15/15; test-all exit 0; test-core 5/5;
zero leaked locks.

---

## Session (2026-10-03 — pass 97: habitat cross-process fix + QC)

Owner: "do the habitat fix you found instead of deferring. then run another
qc pass across everything." Both ran.

**HABITAT CROSS-PROCESS FIX (the pass-96 deferred finding).** `save()`
wrote the whole in-memory snapshot (workspaces/roles/boundaries/tokens)
while adopt-on-load ran once at `restore()` — two processes that hydrated
before either wrote clobbered each other (proven live pre-fix: 4 concurrent
`createWorkspace` → 2 workspaces). Now every save takes a short-lived
lockfile, re-reads the persisted `_habitat` row FRESH, adopts unseen
newcomers, writes the union. Tombstone-safe: seen-but-absent ids are local
deletes and stay deleted; roles tracked per-triple so one membership
removal survives a stale peer snapshot. The persistence seam needed a
`fresh` flag on BOTH `memory.recall` and `brain._loadBrain` (two caches).
NEW `test/habitat-crossprocess.test.js` 5/5.

**Self-inflicted regression caught + fixed:** the first lock path was
`<brain>/state/_habitat.json.lock`, which lib/migrations' `dropfiles.tmp-space`
step sweeps as legacy drop content → broke `test/migrations.test.js`
idempotency (and relocated a leaked lock to models/tmp-space). Moved the
lock to the brain root as hidden `.habitat.lock`.

**QC (round 2) — 5 more MCP stubs wired to reality:** `vant_commit`,
`vant_sync`, `vant_lock` (+`required:['action']`), `vant_health`,
`vant_create_branch` — all previously returned fabricated success without
touching the real modules.

**Documented, not fixed (flagged for a future pass):** consensus /
market / node-registry / settlement all write whole state-store snapshots
with no cross-process lock (single-writer-hub assumption) — same class,
lower blast radius. Fire-and-forget habitat saves can leak a lock on abrupt
exit; >5s stale takeover reclaims it.

**GATES (all green):** sweep 151/151 chunked; lint:docs PASS (129 files);
lint:surface PASS; lint:helpers PASS; eslint touched 0 errors;
`npm run check` syntax OK; audit-mcp 296 / THREW 0 / TIMEOUT 0 / INVALID 0 /
REFUSED 149 / OK 88; `npm test` 15/15; test-all exit 0; test-core 5/5.

---

## Session (2026-10-02 — pass 96: merge-readiness + QC sweep)

Owner: "continue" (context restored) + a merge-readiness checklist pass +
"keep doing qc and live fire… bugs, gaps, edge, vulns, stubs". All three
ran.

**MERGE-READINESS (axolotl → main):** divergence = main 1 commit, axolotl
615. Conflict scan DEFINITIVELY clean: main's tip tree (`c11ae19…`) is
byte-identical to the merge base (`36d6f62`) — the one main-only commit
(5965e14, "Merge PR #52 evolution") is content-neutral (its merge resolved
to the base tree), so main adds NOTHING and there is nothing to conflict.
Versions consistent at 0.8.6 (package.json / dist/index.html /
docs/index.md / CHANGELOG frontmatter); lint:docs 129 PASS. dist/ lander
fresh + version-consistent (no generator; hand-maintained, unchanged since
2026-09-23). Fixed two freshness defects: (a) `bin/build.sh` was BROKEN +
STALE — copied the non-existent `states`/`REGISTRY.txt` (errors silent,
no set -e) and hardcoded "VANT v0.5.0"; now reads the version from
package.json, skips absent files, wipes its output dir. (b) lib/version.js
comment falsely claimed "docs site has no changelog file" — the pass-95
text; docs/reference/CHANGELOG.md DOES exist and is a version spot —
corrected.

**QC FINDING #1 — teams.json cross-process loss (FIXED):** pass 95 fixed
this class for agents.json; teams.json had it too. `_saveTeams()` writes
the WHOLE in-memory snapshot while the adopt-on-hydrate merge only runs at
module load, so two CLI processes that both hydrated before either wrote
clobber each other — PROVEN by barrier-synchronized live fire: 4
concurrent `createOrg` persisted only 1 org. Fixed with the pass-95 shape:
lockfile (`teams.json.lock` in the orgchart dir) + re-read + adopt unseen
ids (`_seenKeys`) + tombstone deletes; `_resetHydration()` now clears the
tombstones too. Re-proven 4→4. NEW test/teams-crossprocess.test.js 5/5
(4 barrier-synced creates + a tombstone/adoption gate).

**QC FINDING #2 — habitat state same class (DEFERRED, documented):**
4 concurrent `createWorkspace` → only 2 (default + 1). Same root: `save()`
writes whole state, `restore()` replaces wholesale. DEFERRED on purpose —
that state IS the pass-91-hardened RLS/tenancy/token map surface, and a
tombstone-correct merge (revoked tokens / removed roles must not
resurrect) is security-sensitive and deserves its own pass with its own
gate, not a rushed tail. Repro recorded.

**QC FINDING #3 — MCP stub bucket (FIXED):** the audit's OK bucket hid
pure stubs (same genre as pass-95's config stubs). `vant_audit_log`
claimed {status:'logged'} without touching the ledger; `vant_audit_list`
ALWAYS returned {events:[]}; `vant_succession_info` hardcoded
{trustLevel:'high'}; `vant_sandbox_status` hardcoded {status:'active',
budget:100}. All now route to real modules — and succession now reports
the brain's REAL level **medium** (the stub was actively lying).
required[] added to audit_log (audit REFUSED 147→148 / OK 90→89).

**Gates:** sweep 150/150 chunked; teams-crossprocess 5/5; lints PASS
(docs 129 / surface / helpers); eslint touched 0 errors; npm run check;
audit-mcp 296 THREW(0)/PHANTOM(0)/REFUSED 148/OK 89; npm test 15/15;
test-all/test-core exit 0.

**Queued:** habitat cross-process merge (finding #2); MEM/TASKS→vant-native
+ whitepaper (owner: later tonight).

---

## Session (2026-10-02 — pass 95: cross-process seams — roster merge + config persistence)

Owner: "continue" — mid-pass-95 work was already on disk (uncommitted);
survey found it INCOMPLETE and finished it.

**Cross-process agent roster (lib/agents/internal.js):** pass 88
serialized the SAME-process save chain, but separate CLI processes each
held their own agents.json snapshot — 4 concurrent `vant agents spawn`
invocations persisted only 3 entries (the write stayed atomic; the last
writer clobbered). Every save now takes a short-lived lockfile in the
orgchart dir, re-reads the disk roster, ADOPTS ids this process has never
seen (_seenIds), and tombstones deletes (a killed/pruned id is never
re-adopted — a stale peer snapshot can't resurrect it). _saveAgents() now
takes no snapshot param: after the merge the only correct thing to write
is _agents itself. NEW test/roster-crossprocess.test.js 6/6 (4 genuinely
concurrent child spawns + a tombstone/adoption gate).

**Config persistence (lib/config.js + bin/config.js):** `vant config set`
called config.set() = setFlag() — an in-memory Map that died with the CLI
process while printing "✓ Set k v", so a fresh `config get` always
returned null. New setConfig() keeps the flag round-trip AND persists into
the CURRENT brain's config.json; `vant config get` consults it.
**MCP vant_config_get/set were PURE STUBS** ({value:null} /
{status:'set'}) — the code comment even admitted it; now real, with
required[] so empty args refuse at the door (audit OK→REFUSED +2).
Finishing seam: the DEDICATED accessors mcpRequireKey()/mcpApiKey() that
the MCP auth gate calls never read loadBrainConfig, so the documented
`vant config set mcp.requireKey true` / `mcp.apiKey …` still did nothing
to a later MCP server — new _brainConfigValue() bridge (env still wins,
for deployment overrides). NEW test/config-persistence.test.js 10/10
(cross-process; includes a negative control on an empty brain).

**DOT-DIRS (lib/brain.js):** models/private/.locks was surfacing in
brain_list / transform.gather as if it were a brain; brainDirs now skips
dot-prefixed directories in both the public and private scans.

**lib/version.js:** stale comment pointed version bumps at
docs/CHANGELOG.md; the real changelog is repo-root CHANGELOG.md
(bin/changelog.js reads it — docs/ has no changelog file).

**Gates:** sweep 149/149 chunked; roster 6/6; config 10/10; lints PASS
(docs 129 / surface / helpers); eslint touched 0 errors; npm run check;
audit-mcp 296 THREW(0)/PHANTOM(0)/REFUSED 147/OK 90; npm test 15/15;
test-all/test-core exit 0.

---

## Session (2026-10-02 — pass 94: second-boot live fire)

Owner asked for the pass-93 companion: existing-brain boots.
Verdict: **HEALTHY — zero product bugs** (first pass with no
finds since the gates started earning their keep). Verified by
hand then codified: no re-seed on boot 2 (no clobber), identity
byte-identical (sha256), migrate idempotent, teams orgs + agent
roster + habitat workspaces (incl. a created one) rehydrate in
fresh processes, agent FIELD bindings env-correct across boots
(pass-93 seam holds), vant brain untouched (orgchart byte-
stable, 0 refs in state.json), no tree deletion across boots
(pass-89 canvas class), honest sync/update refusals, MCP
round-trip lands in the env brain. Probe gotchas recorded:
agents.list() is ASYNC and PROJECTS {id,name,role,state,mcp}
only — assert brain bindings via orgchart/agents.json (Map
entry shape). transform.gather capturing ALL brains = documented
multibrain full-capture, not a leak. NEW
test/second-boot.test.js 10/10 (joins the sweep).

**Gates:** sweep 147/147 chunked; second-boot 10/10; lints
PASS; eslint touched 0 errors; npm run check; audit-mcp 296
THREW(0); npm test 15; test-all/test-core exit 0.

---

## Session (2026-10-02 — pass 93: fresh-boot live fire)

Owner: "have we ACTUALLY tried running axolotl fresh? Live
fires? cli/mcp? I bet there's lots we will find." Correct:
three real fresh-brain bugs, invisible to the component suites.

**SEED SEAM (bin/start.js):** seedStarterBrain read brain name
from state.json stack[0] only, ignoring VANT_BRAIN — env-brain
starts found the DEFAULT brain populated and never seeded, so
every env-scoped fresh brain woke with no identity/goals/lessons
("brain is in use, scaffold skipped" forever). Now resolves via
state-store.currentBrain() (pass-88 seam).

**SPAWN-BINDING seam (lib/agents/core.js + teams.js:1027):**
agents spawned under an env brain were FIELD-bound to 'vant'
while their roster persisted in the env brain —
teams.getAgentBrain/writeTo targeted the wrong brain forever.
Both bare currentBrain() fallbacks now state-store-aware.
Proven: org demo agent carries the env brain name on disk.

**SUMMARY STUB (bin/summary.js):** canned placeholder PINNED by
test-all's output check. Rewrote as a real brain-derived summary
(identity name, goals/lessons bullets, ledger count, honest
empty-brain message) + fixed --json parsed from argv.slice(3)
(never fired on `vant summary --json`).

**Worked first try:** boot migrate→health chain; org demo
end-to-end w/ flush discipline; hybrid search; learn; MCP over
HTTP (296 tools, /health//tools//mcp/exec, write→read lands in
the env brain). autoWireCoreLibs stays dead: superseded by 153
explicit vant_* tools with real schemas.

**Layer map:** brain.write(category,key) = memory store layer;
brain.read(name)/MCP brain_read = flat brain-FILE layer — don't
mix in probes ('Brain not found' = layer confusion).

**NEW test/live-fresh-boot.test.js 5/5** — the standing live
fire: fresh brain → boot seeds → health clean → org demo binds
correctly → summary real → MCP HTTP round-trip in the env brain.

**Gates:** sweep 146/146 chunked; neighbors green; lints PASS;
eslint touched 0 errors; npm run check; audit-mcp 296 THREW(0);
npm test 15; test-all/test-core exit 0.

---

## Session (2026-10-02 — pass 92: stabilization sweep)

Owner: hold MEM/TASKS/whitepaper; continue stabilizing + wiring
axolotl — "other libs/cli/mcp may be vapor or not utilized."

**Survey verdict: healthier than feared.** First zero-ref grep
reported 11 dead modules — FALSE ALARM: the pattern missed bin's
'../lib/x' requires (correct: `[./]*(lib/)?name`). Zero truly
dead modules; api.js is MCP-live via autoWireCoreLibs. The 34
.catch(()=>{}) sites triaged (rls fallbacks = pass-90 design;
sudo revalidate tick + agents save chains = documented; no new
vapor). FileStorage.write is SYNC → no #109 persistence vapor in
the prune/notices/succession/resolution/skills CLI flows.
MCP: 0 phantoms; 145 refusals all honest (125 schema +
containment/cap fail-closed). bot.js = honest token gate.

**Fixed:** (1) MCP schemas — vant_agents_delegate_mcp +
vant_agents_broadcast had no `required`, so {} passed validation
and died as 'Agent not found: undefined'; now MCP_INPUT_INVALID
at the door (refusals 144→145). (2) CLI --help polish: vant.js
(bare/-h/--help → help), docs.js, transform.js, test-core.js
(-h → modes) — all exited 1 on --help before. (3) live-fire
webhook flake: 46000+pid%2000 collided with a long-lived platform
listener on the link-local IP; ss grabbed the FIRST matching line
(order-unstable) → loopback pin flapped 1-in-3. Fix: OS-assigned
free port + assert OUR 127.0.0.1:PORT line. Same class as pass-89
4585. (4) NEW standing gate test/cli-smoke.test.js: node --check
ALL 120 bin CLIs + --help exit-0/usage on 118 (skip bot.js,
cli-standard.js) — CLI rot now fails a gate, not a user.

**Gates:** sweep 145/145 chunked; cli-smoke 2/2; live-fire 26/26
standalone AND after cli-smoke; lints PASS; eslint touched 0
errors; npm run check; audit-mcp 296 THREW(0); npm test 15;
test-all/test-core exit 0.

---

## Session (2026-10-02 — pass 91: #113 + habitat/RLS QC scan)

Owner: "Prime found #113; run qc/edge/vulns scans on habitat +
rls."

**#113:** horcrux create's auto-.ignore built its path from
REPO_ROOT = __dirname/.. (the INSTALL root) — from a mounted
sandbox cwd that yields '../../..' escape chains and the file
lands nowhere. Fixed: resolve the WORKSPACE root from the caller's
cwd (nearest ancestor with .git/ or models/), write root-relative
globs; stone outside workspace → skip with hint; no marker →
stone's own dir. e2e-proven from a temp workspace; #100 suite
12/12 still.

**QC/vuln scan (habitat + rls):** the naive ({}).polluted probe
MISSes the real class — on plain-object maps, map['__proto__'] =
x REPLACES the prototype (missing-key fallthrough corruption),
and goes GLOBAL only when the write lands on a prototype object.
Fixed with safeMapKey/safeMapAssign guards at every write gate:
- P1 createWorkspace('__proto__') → workspaces proto replaced
- P2 setPolicy('__proto__') + policy-FIELD '__proto__' → direct
  RLS bypass shape (poisoned policy = writableBy public)
- P3 module restoreState configs raw Object.assign (stones!)
- P4 provisionAgent(workspace '__proto__') → exists-check fell
  through the proto chain → roles['__proto__']['editor'] = [] =
  GLOBAL Object.prototype pollution (sharpest variant)
- P5 instance restore() of a crafted snapshot → all RLS maps
  corrupted in every fresh process hydrated from a malicious
  stone (stones are the SANCTIONED cross-process transport)
- P1b setWorkspace('__proto__') accepted via fallthrough
- token-cache role confusion: cached ctx kept tenant-A roles
  after the session workspace moved to B (re-derived now)
- rls.middleware: x-workspace HEADER pivoted the process-global
  session workspace (no live callers; req.rlsWorkspace now)
Held/verified solid: generateCaps fail-closed tenancy (pass 82)
blocks fabricated workspaces even on a polluted map; evaluate()
mask/filter paths are spec-safe; canSync/parity intact.

**Gates:** sweep 144/144 chunked; NEW test/habitat-rls-qc.test.js
13/13; horcrux-orgchart 12/12 + rls-hookups 19/19 + all
habitat/sandbox/teams/security suites green; lints PASS; eslint
touched 0 errors; npm run check; audit-mcp 296 THREW(0); npm test
15; test-all/test-core exit 0.

---

## Session (2026-10-02 — pass 90: RLS hookups / enforcement vapor)

Owner: "More habitat/rls hookups?" — survey found the RLS carrier
chain mostly VAPOR (async checks fired un-awaited from sync code;
denials became orphaned rejections AFTER the op ran), plus two
live mis-fires. All closed:

**Doctrine (central decision):** explicit userCtx → RLS enforces
INLINE; anonymous (no ctx) → internal actuator op, allowed
(enforcing on {} would deny every internal write — default policy
is writableBy ['role:admin']). Roles match BARE names.

**Core:** habitat.canSync() sync decision core (async can()
delegates, signature preserved); rls.assertSync() throws
RLS_DENIED + emits; sandbox `rls` getter auto-claims the shared
habitat (pass-82 generateCaps doctrine) so un-booted CLI/early-MCP
processes stay enforcing.

**Carriers converted to inline enforcement:** brain (3209 — dream
was the only awaited site), storage, islands, lineage, msg,
teams (_checkRLS returned the promise — discarded by callers),
memory (dropped the {} vapor calls; gate+namespacing remain),
config (try/catch around a promise = dead E_RLS branch),
audit (userCtx fed to param-LESS checkers → any cap holder could
read any tenant's audit trail — _checkRls added), cache.

**Live bugs found by wiring:** cache.js s.can(userCtx,'write',res)
MIS-BOUND (can(cap) takes one name → ctx in cap slot → userCtx'd
get() threw EFORBIDDEN live; _checkWrite never called; set() had
no gate); _cacheLock POISONING (one denial made the rejected
promise the chain — every later op inherited it; task.catch
fixes); config/teams _getSandbox pinned the PARTIAL early sandbox
export during the boot require cycle (gate.js F-2 pattern applied:
verify defaultSandbox before caching).

**Gates:** full sweep 143/143 chunked; NEW test/rls-hookups.test.js
19/19; lint:docs (129)/surface/helpers PASS; eslint touched 0
errors; npm run check; audit-mcp 296 THREW(0); npm test 15;
test-all/test-core exit 0.

---

## Session (2026-10-02 — pass 89: horcrux/teams/brain-naming triage)

Owner: "What do we need for triage? Let's solve #100–#104, #111–#112"
— prime's seven-issue horcrux/orgchart/naming batch (filed on main).
All seven root-caused and closed this pass.

**#100 stone flood (line-search starvation):** repo-root `.ignore`
(NEW; ripgrep honors it, git does NOT — stones stay tracked for
disaster recovery) covering `models/public/*/boot/*.svg` +
`horcrux/*.svg`; boot README gained a "Search hygiene" section;
`vant horcrux create` auto-appends its own stone dir to .ignore and
prints the hint. e2e-proven: repo walk skips the stone, `--no-ignore`
still sees it (never truly hidden).

**#101 cold restore orgless:** persistence durability, root-caused
properly MID-PASS (two wrong fix shapes tried first): store.write IS
synchronous, so the pre-89 save already landed — what raced were
CONSUMERS. An async save chain broke teams-refresh's sync
exists-on-return assert; an async restoreState broke orgflow's sync
result object + sync E_LEGACY_FORMAT throw. FINAL: `_saveTeams()`
writes inline (the chain records the completed save),
`teams.flush()` drains, `restoreState` STAYS SYNC (durability
guaranteed by the inline write), transform.restore awaits
restoreState + flush + agents flush before returning. Cold-process
e2e: child A snapshots → parent wipes teams.json (genuinely cold) →
child B transform.restore + immediate exit → file on disk → child C
hydrates orgs ≥ 1.

**#102 inspect lies (Teams/Orgs 0, wrong agent count):** legacy
gatherAgents ALWAYS returns `agents: []` (it only ever carried
delegation metadata) while the real roster rides `data.agents2`.
preview.agentCount now reads agents2 first (fallback chain intact),
new delegationCount field; CLI prints "Agents (registered roster):",
"Delegation records:" and "Teams/Orgs: N orgs, N teams".

**#103 empty dirs dropped:** gather `_readDir` emits
`{path: prefix+'.keep', emptyDir:true}` for empty dirs (boot/ still
design-excluded); restore mkdirs + writes the marker — through the
STORAGE chain (raw fs.writeFileSync tripped the atomic-writes
structural pin; found by gate) — records `results.emptyDirs {rel,
scope}`, and the sweep unlinks per FILE scope. Sweep bug found while
testing: scope was keyed off the brain's TYPE, so 'both'-scope
brains leaked private-side .keep markers (fixed; both directions
regression-tested).

**#104 assign smears brain:** assign() reads `prev` BEFORE
resolution: brain = explicit `options.brain` > stored `prev.brain` >
caller's currentBrain (first assign only). The pass-89 draft keptOr()
check used the ALREADY-RESOLVED value — the currentBrain fallback
always won, i.e. the exact smear reported; presence must be checked
on `options.brain` before any fallback. org/dept/team/role preserved
when absent, with hierarchy consistency guards (a stale role does
NOT follow a team change; dept derived from an explicit team wins);
quota checks SELF-EXCLUDE the agent being moved (a full org no longer
rejects its own member on re-assign); escrow spend only on placement
ops (a pure partial re-assign neither spends nor is budget-blocked).

**#111 health false negative:** initialized = template markers OR
any recursive content in the brain dir. Grown marker-less brains
print "Brain exists" + an actionable "No template markers (wanted: ...)"
hint; genuinely empty brains print the wanted-markers line. Env
note: a fresh VANT_BRAIN dir auto-seeds orgchart/ (escrow store
init) before checkModel runs — the empty branch is exercised via the
MODEL_PATH escape (state-store does not seed that path).

**#112 hardcoded 'vant':** brain.test stack assertion derives
`getCurrentBrain()` (active brain), error prints stack + active.
Audit of the rest: synapse 'vant' labels are node names, not brains;
the axolotl stack-top checks control their own preconditions.

**Drive-by gate fixes:** (a) pass 88's own docs rows (cli.md agents
row, rls.md grant note) carried 2 em dashes — lint:docs had been
FAILING since 74ac92a; hyphens now, 129 files PASS. (b)
test/crew-bus flake (~50% fail): port range 4571+pid%40 collided with
the long-lived platform `bin/mcp.js -p 4585` (probe hit the MCP door
→ 404 {error:'not found', endpoints:[mcp…]}) and READY printed before
the async bind (ECONNREFUSED). Suite now picks a FREE contiguous
port triple via live probe (skips MCP/orphans) and probes the child
port before declaring ready — 6/6 stable.

**Tests:** NEW test/horcrux-orgchart.test.js 12/12 (all seven issues;
#101 across three real process boundaries, #100 with rg honoring).
**Gates:** full sweep 142/142 (chunked per-suite), crew-bus 6/6,
atomic-writes 13/13, npm test 15/15, test-all exit 0, test-core
exit 0, lint:docs/surface/helpers PASS, eslint touched files 0
errors, audit 296 THREW(0), npm run check.

---

## Session (2026-10-02 — pass 88: sec-chain call points + prime's issues)

Owner: "finish the habitat and rls, especially making sure the call
points play fair with the sec chain and primitives/factories... Prime
left some issues on Vant main, but they were mid stream." Prime = the
third runtime (festival/event management layer IRL); crew is
Buffy + Cairn + Prime. Survey first: habitat/RLS call points were
already CLEAN (readers use getShared(), mutations route through
factories, no raw workspaces/roles writes outside habitat.js) — the
real unfairness was prime's issue classes, all sharing one theme:
**fresh processes didn't inherit authority, and mutations raced their
own persistence.**

**#108/#105 ROOT FIX (lib/boot.js):** boot hydrates persisted
`orgchart.operatorCapabilities` from the current brain's config —
widen-only (explicit `true` over a fixed allowlist; absent key =
nothing; host-configured sandboxes skipped, same guard as the identity
link). Scopes persisted earlier (pass 87-adjacent), capabilities did
not — the F-1 two-layer trap made `vant org grant && vant agents
spawn` IMPOSSIBLE (every CLI is a fresh process; canSpawn flipped back
to false). e2e: negative control (read/write scopes only + no caps →
denied) / positive (persist caps → cold child spawns) / widen-only
(host caps survive boot).

**bin/org.js:** `grant` now PERSISTS scopes+caps to brain config by
default (`--session-only` opts out — old behavior); `config` gained
`--set-operator-caps`; `status` shows the caps key; demo flushes
agents before exit.

**#109 FLUSH DISCIPLINE:** lib/agents/internal.js — serialized save
chain (`_saveChain`) + `_dirty` tracking + `flushAgents()`; every save
appends to ONE chain (old fire-and-forget writes raced the exit —
spawn "succeeded" but agents.json was never written). `agents.flush()`
facades it; spawn/kill CLI + org demo await it; bin/habitat.js mutating
subcommands `await h.flush()` (habitat.flush() = await _readyPromise,
which serializes saves). beforeExit safety net re-queues a dirty save.
CLI kill e2e across real process boundaries proves persistence.

**#106/#107 bin/agents.js REBUILT REAL** (was a stub: printed
"Spawning agent: X" without touching lib; duplicated dead status/info
branches): spawn/kill/info/status/list/prune all real; mutation =
operator intent → grantOperator() (boot + caps, org-demo pattern);
subcommand-level --help guarded (--help no longer "spawns an agent
named --help"); limits documented (crew of 4, 10/min rate).
**FOLLOW-THROUGH BUG the stub masked:** terminate() deleted from the
in-memory map only — a fresh process (every CLI invocation) returned
false for an agent that was ON DISK. terminate now hydrates before
delete; kill CLI round-trip is cold-process-proven.

**#110 lib/audit.js:** healthCheck() contract drift — validate.js read
{healthy, issues} but it returned {status, entries}; healthy was
always undefined → EVERY `vant validate` printed "✗ Issues:" with an
empty list. healthCheck now returns {healthy, issues, status, entries}
(health derives from ledger verify()); old keys preserved.

**BONUS — cross-brain agent bleed (prime #104's seam class):**
lib/agents/internal.js `_getAgentStorePath()` used bare
`brain.getCurrentBrain()` which IGNORES VANT_BRAIN (module-global
_currentBrain comes from models/state.json stack[0]) — env-scoped
processes (tests, multi-runtime hosts) wrote every roster into the
vant brain: 22 agents accumulated, agents.maxAgents=10 tripped as
PHANTOM QUOTA errors on fresh scratch brains. Fixed via state-store's
path-active resolver (the pass-53 teams.js seam; consensus/market/
trust/node-registry already use it). Vant brain's stray probe agents
purged from the roster.

**Tests:** NEW test/operator-caps.test.js 8/8 (cold-process e2e for
every class above incl. habitat grant flush + subcommand help).
agents-split snapshot gained `flush` (deliberate addition, documented
in-file). Full battery green.

**Docs:** cli.md agents/org rows + grant/caps examples + boot-hydration
note; rls.md persistence section gained the operator-grant + flush
discipline.

**Gates:** FULL sweep 143/143 (chunked per-suite — run-all exceeds the
175s cap), npm test 15/15, agents-split 23/23, operator-caps 8/8,
agora-tenancy 12, habitat-rls 23, habitat-token 15, habitat 6,
workspace-memory 21, island-boundaries 14, memory 18, boot 15, mcp 6;
lint:docs (129 files) / surface / helpers; eslint touched 0 errors;
audit 296 THREW(0); npm run check.

---

## Prior (2026-10-02 — pass 87: #6 mesh/agora tenancy)

Owner: "We missed one # I think, make sure it's not lost, but let's
def hit #6 next. Bringing a fellow runtime up atm. Buffy + Cairn + TBA
let's see!" → worked #6, AND re-verified the list: it is EXACTLY
#1–#6, nothing was ever missed. Full closure:
- **#1** agents→habitat identity + RLS online (pass 82 ✓)
- **#2** escrow workspace budgets (pass 83 ✓)
- **#3** island boundaries enforced at load (pass 84 ✓)
- **#5** per-workspace memory namespacing (pass 85 ✓)
- **#4** MCP auth ctx via habitat tokens (pass 86 ✓)
- **#6** mesh/agora tenancy (pass 87 ✓ — this pass)
The only non-numbered items still queued (deliberate, never part of
the ranked list): **whitepaper rewrite** + **TASKS/MEM → vant-native
(notify board/memory)**. No #7 exists anywhere (pass-81/82/84 blocks,
learnings, PRDs all re-checked).
## Session (2026-10-02 — pass 87: #6 mesh/agora tenancy)

Owner: "We missed one # I think, make sure it's not lost, but let's
def hit #6 next. Bringing a fellow runtime up atm. Buffy + Cairn + TBA
let's see!" → worked #6, AND re-verified the list: it is EXACTLY
#1–#6, nothing was ever missed. Full closure:
- **#1** agents→habitat identity + RLS online (pass 82 ✓)
- **#2** escrow workspace budgets (pass 83 ✓)
- **#3** island boundaries enforced at load (pass 84 ✓)
- **#5** per-workspace memory namespacing (pass 85 ✓)
- **#4** MCP auth ctx via habitat tokens (pass 86 ✓)
- **#6** mesh/agora tenancy (pass 87 ✓ — this pass)
The only non-numbered items still queued (deliberate, never part of
the ranked list): **whitepaper rewrite** + **TASKS/MEM → vant-native
(notify board/memory)**. No #7 exists anywhere (pass-81/82/84 blocks,
learnings, PRDs all re-checked).

**lib/forum.js — agora tenancy (the commons, not a vault):**
- Subject chain = the ONE shared with islands(84)/memory(85):
  explicit userCtx → current agent habitat identity → anonymous
  (_tenancySubject). MCP layer adds the pass-86 priority on top
  (verified token > declared > current agent > anonymous).
- Visibility (_publicationVisible): workspaceless pub = GLOBAL commons
  (pre-87 behavior preserved); tenant pub invisible to anonymous (fail
  closed — get() returns {found:false, reason:'tenancy'}, same shape
  as a miss, existence not leaked); own-workspace subject sees it;
  subjects with ANY registry role in the pub's workspace see it
  (cross-tenant moderation, computed live from habitat).
- publish(): explicit options.workspace pin (own property — '' →
  global; invalid name → invalid_workspace; foreign pin without a
  registry role → workspace_denied) else auto-stamps
  publication.workspace + authorAgentId from the subject. list()
  filters + returns tenancy meta {workspace, anonymous, visible, total}.
- **CRITICAL PRE-EXISTING BUG FOUND+FIXED:** module.exports shims
  `list: () => forum.list()` / `get: (bc) => forum.get(bc)` DROPPED
  their trailing options arg — lib/mcp.js holds the MODULE (not the
  singleton), so forum_list/forum_get ran tenancy-blind (always
  anonymous) no matter the declared ctx. This was the whole "MCP
  member-list missing tenant post" mystery: handler received and
  resolved userCtx correctly (proven by instrumentation), the shim
  discarded it one frame later. Shims now forward opts like publish.

**lib/mcp.js:** NEW tools forum_publish + forum_list (296 total,
audit THREW(0)/PHANTOM(0)), both _requestCtx-driven; pass-86
_requestCtx tab-indent lint errors (mixed spaces/tabs 51-54) fixed.

**bin/forum.js — rebuilt REAL** (pass-81-genre facade before: printed
"✅ Posted" without touching lib, list always "(none)"): list/post/view/
message all through lib/forum.js, tenancy-aware output.

**Mesh provenance:** mesh-status.shareableReport gains tenancy block
{workspace, agentId} + registry peers expose workspace; node-registry
register() accepts entry.workspace (additive/optional, state-store
persistent).

**PRE-EXISTING BUG (differentiated, not pass-87's):** island-boundaries
failed 13/14 (HABITAT_UNKNOWN_WORKSPACE: default). Proved NOT our diff
via `git worktree add /tmp/vant-head HEAD` — pass-86 code fails
IDENTICALLY in a clean env. Root cause: Habitat declares
defaultWorkspace='default' but never CREATED it (fresh process:
workspaces={} until provisioning); a persisted _habitat state that
happened to contain 'default' had masked the hole, then vanished.
FIX: _ensureDefaultWorkspace() — idempotent, PERSIST-FREE by design
(createWorkspace auto-persists; a constructor-time save would race the
getShared() restore chain and clobber real disk state with a
near-empty snapshot). Called in the constructor + after restore()'s
wholesale replace; createWorkspace gained skipPersist.

**Spawn-restore race (documented, test-disciplined):** spawn()
provisions habitat SYNCHRONOUSLY before getShared()'s async restore()
resolves; restore replaces workspaces/roles wholesale → provisioning
evaporates (HABITAT_UNKNOWN_WORKSPACE org-ago). Fix pattern = await
habitat.getSharedReady() BEFORE any spawn (habitat-rls precedent; now
also top of agora-tenancy test). Not code-fixed: spawn() is sync and
many suites depend on that contract — noted for a future pass.

**Memory-only across processes:** forum publications are NOT hydrated
from brain (saveToBrain writes forum:pub:<barcode>; no load path — the
pass-77 amnesia genre). CLI e2e therefore does post+list in ONE child
process (argv-swap, the workspace-memory --as pattern). Forum hydration
= follow-up.

**Tests:** NEW test/agora-tenancy.test.js 12/12 (stamp/pin matrix,
visibility incl. cross-tenant registry admin live add+remove, get()
non-leak, MCP verified-ctx chain, mesh provenance, CLI round-trip).

**Docs:** rls.md "Agora tenancy (pass 87)"; mcp-tools Agora section
gained forum_publish/forum_list ((11)); cli.md forum row now real
(list/post/view/message, tenancy-aware).

**Gates:** FULL sweep 142/142 (run-all exceeds the 175s cap — chunked
per-suite per pass-45 precedent; flakes crew-bus + agents-split
re-verified green standalone 20/20, 23/23), npm test 15/15, test-all
17/17, test-core 5/5, agora-tenancy 12, habitat-token 15,
habitat-rls 23, habitat 6, workspace-budget 22, island-boundaries 14,
workspace-memory 21, memory 18, boot 15, mcp 6; lint:docs (129 files),
lint:surface, lint:helpers; eslint touched 0 errors (29 pre-existing
warnings mcp/forum); npm run check syntax OK; audit 296 THREW(0).

---

## Session (2026-10-01 — pass 86: #4 habitat tokens / MCP auth ctx)

Owner: "That's a keystone! ... let's do #4 next pass now that the
engines are running on more cylinders" → #4: MCP auth ctx via
habitat tokens.

**lib/habitat.js — token subsystem (registry-anchored):**
- mintToken(agentId, {ttlMs=24h}) → raw 'vant_'+32B hex shown ONCE;
  only sha256 hash persisted. Fails closed AGENT_NOT_FOUND (tokens
  anchor to habitat identities, never declared claims).
- verifyToken(raw) → registry-verified subject via agentContext at
  USE time → role changes after mint apply immediately (authority
  not snapshot). Unknown/expired/revoked/deregistered → null.
- COLD-PROCESS FALLBACK: agents registry is memory-only but
  provisionAgent's role rows are durable — agentContext now falls back
  to _agentContextFromRegistry (subject from durable rows; identity
  exists iff ≥1 role row remains). Tokens verify in fresh processes;
  stripping all role rows kills the identity.
- revokeToken(raw|hash) persists via _persist; listTokens (hash-prefixed,
  never raw). Tokens ride the _habitat state row (save/restore).

**lib/mcp.js — request credential (AsyncLocalStorage):**
- HTTP door accepts Authorization: Bearer vant_... (or
  x-habitat-token) IN ADDITION to the shared key; a VALID token also
  satisfies mcp.requireKey by itself. Captured ctx rides the whole
  execution via _requestAls.
- _requestCtx(declared) priority: VERIFIED TOKEN > DECLARED userCtx >
  current agent identity > anonymous (verified beats declared —
  anti-spoof). Wired into vant_memory_state/_recall (auto-scoping
  uses token workspace unless workspace:"") , vant_habitat_can/_check,
  islands_canAccess (+verified flag in results).
- escrow money-admin (setWorkspaceBudget/setWorkspaceMemberLimit):
  token path = _verifiedAdminGate (workspace match + registry admin
  role), adminId no longer required in schema; legacy adminId path
  stays for shared-key callers.
- NEW tools: vant_habitat_mintToken/_verifyToken/_revokeToken
  (294 total, audit THREW(0)). mcp.start(): explicit port 0 honored
  (falsy-|| previously skipped it — listen promise never settled on
  bind errors); _serverRef test hook.

**bin/habitat.js — token subcommand:** mint/verify/list/revoke.
FIXED PRE-EXISTING RACE for token ops: bare getShared() raced restore
→ fresh-process mint AGENT_NOT_FOUND'd; token ops now await
getSharedReady() (whole CLI body in a .then, same behavior otherwise).

**Tests:** NEW test/habitat-token.test.js 15/15 (mint/verify/revoke,
role-change-after-mint, fail-closed matrix, durable-identity pin,
cross-process cold mint+revoke, MCP round-trip, priority probe,
HTTP e2e: Bearer token → vant_memory_state auto-scoped to org-http
with spoofed declared ctx losing, CLI exit codes).

**Docs:** rls.md "Verified identity: habitat tokens" section;
mcp-tools Habitat Tools (14) + 3 token entries; cli.md habitat row.

**Gates:** npm test, runner 37/37, habitat-token 15/15, habitat-rls 23,
workspace-budget 22, island-boundaries 14, workspace-memory 21,
memory 18, boot 15, mcp 6; lint:docs/surface/helpers; audit 294
THREW(0).

---

## Session (2026-10-01 — pass 85: #5 workspace memory namespacing)

Owner: "What's best next? I feel like #5 is important" → agreed: #5
per-workspace memory namespacing + the promised islands CLI touch-up.

**lib/memory.js — workspace namespacing for state/recall:**
- Subject chain mirrors islands._resolveRlsContext: explicit
  opts.workspace / opts.userCtx.workspace -> current agent's habitat
  identity (agents.agentContext of getCurrentAgentId) -> anonymous
  (null = flat, pre-85 keys). _resolveWorkspace/_stateKey private.
- Composite key shape: ws<wsLen>.<ws>.<key> (e.g. ws4.acme.proj).
  WHY: state keys become FILENAMES and lib/storage.js:1032-33
  sanitizes to [A-Za-z0-9._-] + truncates at 100 — colons do NOT
  survive (ws:<ws>:<key> collapses to wsacmeproj on disk) and bare
  concatenation is collidable (ab+cx vs abc+x). Length prefix + dots +
  letter-start workspace names parse unambiguously under that exact
  sanitizer. WORKSPACE_KEY_RE [A-Za-z][A-Za-z0-9._-]{0,63};
  VAF_INPUT_INVALID on bad names and on 100-char composite overflow
  (STORAGE_KEY_BUDGET).
- Namespaces ISOLATING not additive: resolved workspace reads ONLY its
  rows; anonymous never sees scoped rows; flat keys unchanged for
  anonymous callers. Cache keyed by storeKey (no in-process collisions).
- state()/recall() return { key, storeKey, workspace, ttl }; memory.
  stateKey(ws, key) export = disk-path source of truth. recall wrapper
  now forwards opts (was dropped).
- PINNED UNSCOPED (workspace: null): habitat save/restore (_habitat),
  nature (_flywheel), context._gatherHistory — process-global state
  must not fragment per workspace. Empty string "" = explicit flat.

**MCP (291 unchanged):** vant_memory_state/_recall gained optional
`workspace` arg (omit = current agent identity; "" = flat).

**Islands CLI touch-up (bin/islands.js):** `load <name> --as <agentId>`
(threads agents.agentContext as userCtx; unknown agent fails loudly
exit 1) + `boundaries` subcommand (islands.listBoundaries()).

**Tests:** NEW test/workspace-memory.test.js 21/21 (flat compat, disk
paths, isolation, cold-cache disk read, collision-shape pins, budget
fail-closed, userCtx/identity resolution, workspace:null pin,
habitat-flat-row pin, validation, CLI boundaries/--as e2e incl.
same-process spawn→CLI probe).

**Docs:** rls.md gained "Per-workspace memory namespacing" section;
cli.md islands rows updated (load --as, boundaries).

**Gates:** npm test, runner 37/37, workspace-memory 21/21, memory 18,
island-boundaries 14, habitat-rls 23, workspace-budget 22, boot, mcp;
lint:docs/surface/helpers; audit 291 THREW(0).

---

## Session (2026-10-01 — pass 84: #3 island boundary enforcement)

Owner: "do #3! Same plan, rls along side, wiring it all up."

**Enforcement in lib/islands.js (load/hydrate/save):**
- Resource key _island:<name> (lib/rls.js convention) FINALLY read at
  the enforcement site. Subject resolution: explicit userCtx option ->
  current agent's habitat identity (agents.agentContext of
  getCurrentAgentId) -> anonymous.
- load(): boundary check BEFORE content moves; row-level filter/mask
  applies to storage/runtime island DATA (corpus strings untouched).
- hydrate(): passes options through to load().
- save(): SYNC boundary twin (_islandBoundaryCheckSync via
  containerAdmits + habitat._matches — same decision tree as can()).
- Fail closed: anonymous write on gated island = E_ISLAND_WRITE_DENIED
  (even when readableBy is public); identified writers need writableBy.
- NO policy = open island (pre-84 behavior; all existing islands and
  suites untouched). Opt in: vant habitat policy _island:<name> '<json>'.
- Denials emit island:denied (audit trail).

**PRE-EXISTING BUG FIXED:** islands.save() called island.write() —
IslandStorage's API is get/set, write NEVER existed → every
storage-island save threw TypeError since inception. forum.js's
island-save swallowed it in try/catch (saved:false nobody read). Now
island.set(name, data). This also unblocked boundary testing of
storage islands.

**MCP +1 (291):** islands_canAccess — RLS decision mirroring the ACTUAL
gate semantics (ungated = allowed, not defaultPolicy admin-only).
vant_island_status now reports boundary {gated, readableBy,
writableBy, container}. islands.listBoundaries() enumerates island
policies.

**Tests:** NEW test/island-boundaries.test.js 14/14 (open islands,
public reads w/ filter+mask, role-holder reads, RLS_DENIED denials,
container isolation, anonymous-write fail-closed, admin writes,
spawn→agentContext→gate e2e, MCP decisions, boundary introspection).
islands/forum/boot/mcp suites green.

**Docs:** rls.md island-boundaries section (+ frontmatter permalink —
docs link checker requires it); mcp-tools vant_load_island +
islands_canAccess entries.

**Gates:** npm test, runner 37/37, island-boundaries 14/14, islands,
forum, habitat-rls, workspace-budget, boot, mcp suites; lint:docs,
lint:surface, lint:helpers; audit 291 tools THREW(0).

**Next up:** #4 MCP auth ctx through habitat.context(token) (remote
callers get real RLS), #5 memory per-workspace namespacing, #6
mesh/agora tenancy. Whitepaper rewrite + TASKS/MEM → notify board/
memory still queued per owner.

---

## Prior (2026-10-01 — pass 83: #2 workspace budgets, RLS alongside)

Owner: "do #2 (with more rls along side if it needs)." #2 = escrow/
market budgets per workspace.

**Workspace budgets (lib/escrow.js):**
- Composite keys: ws:<ws>:<agentId> (member) / ws:<ws>::org (pool).
  Bare keys = legacy flat budgets, byte-identical behavior.
- setWorkspaceBudget/getWorkspacePool/listWorkspacePools/
  setWorkspaceMemberLimit/workspaceCanSpend/workspaceRecordSpend.
- TWO ROWS ONE POOL: a member spend debits the member row AND the org
  pool (org with 500 cannot fund 600 of member spends). Refunds restore
  both. Member caps persist and gate on every draw (getBudget inherits
  the pool limit when no explicit cap was set).
- beforeExecute/afterExecute honor context.workspace OR
  userCtx.workspace — an agent with habitat identity spends its org
  pool with zero extra wiring.
- Fail-closed RLS: draws on unknown workspaces refused
  (unknown_workspace / E_UNKNOWN_WORKSPACE, no phantom rows written).
  enforceWorkspaceRLS:false = documented opt-out; no habitat at all =
  legacy tolerance.

**Market integration:** trade(listingId, buyerId, { workspace }) —
budget check (step 3) AND settle debit both draw the org pool. No
workspace in context = flat budget, unchanged.

**MCP +6 (290 total):** escrow_setWorkspaceBudget /
_getWorkspacePool / _listWorkspacePools / _setWorkspaceMemberLimit /
_workspaceCanSpend / _workspaceRecordSpend. Admin-gated tools take
adminId and VERIFY the admin role in the habitat registry (never
self-declared — pass-82 forged-ctx rule); denial throws RLS_DENIED.

**CLI:** vant escrow pool <ws> [amount] / cap <ws> <agent> <limit> /
pools (pool+cap admin-gated via registry; VANT_ADMIN_ID env names the
caller).

**CRITICAL BUG FIX (pre-existing, pass-77/79 genre):** market trade
path ran hold (lazy SINGLETON: loads disk once) -> debit (fresh
instance) -> release (SAME stale singleton + save) — the singleton's
stale pool row won the pass-79 merge and CLOBBERED the debit (pool
reverted to spent:0). The pass-79 merge-save only protects keys the
writer's snapshot DOESN'T have; a stale snapshot holding the key
always wins. The market-debit pins never caught it (their keys were
created after the singleton loaded — absent keys merge safely).
Fix: hold/release/reserveIsland/releaseIsland helpers now build FRESH
instances (loads current disk -> mutate -> merge-save; the explicit
save() they already did makes fresh disk-coherent by construction —
the singleton bought nothing). Verified: trade debits pool correctly.

**Tests:** NEW test/workspace-budget.test.js 22/22 (key protocol,
pool semantics, caps, RLS fail-closed, registry-verified admin gates,
market pool debit, flat/settlement backward compat). market-debit,
escrow, market, settlement, ledger-persistence, islands all green.

**Gates:** npm test, runner 37/37, lint:docs/surface/helpers (helpers
gate demanded HELPER-MODEL tags on the new fresh-instance exports —
working as designed), audit 290 tools THREW(0).

**Next up:** #3 islands boundary enforcement at load time (consume
agentContext), #4 MCP auth ctx through habitat.context(token), #5
memory per-workspace namespacing, #6 mesh/agora tenancy. Whitepaper
rewrite + TASKS/MEM -> notify board/memory still queued per owner.

---

## Prior (2026-10-01 — pass 82: agents in habitat + RLS online)

Owner greenlight: "Let's do #1, but bring RLS online while we do
this." #1 = agents/orgs/teams identity in habitat (the top-ranked
integration from the pass-81 survey). RLS = the row-level policy fields
that were shape-only vapor.

**RLS core (lib/habitat.js):**
- evaluate(userCtx, resource, mode, data) — policy filter (strip
  fields) + mask (redact to '[masked]'), array OR function forms,
  filter-then-mask composition. The 'row-level' in RLS is REAL now.
- check(userCtx, resource, mode) — throwing form, RLS_DENIED contract.
- containerAdmits(userCtx, resource) — sync container gate for
  sandbox.generateCaps.
- agentContext(agentId) + provisionAgent(agentId, opts) — identity
  builder (idempotent provisioning).
- can() hardened: null ctx no longer TypeErrors.

**Agents -> habitat:**
- agents/core.js spawn() auto-provisions habitat identity: team maps
to 'org-<team>' workspace (spawner becomes owner/admin per
createWorkspace owner contract), role granted ('viewer'/'editor'/'admin'
pass through, others default 'editor'). Idempotent. Non-fatal on
habitat failure. agent.workspace/habitatRoles stamped on record.
- agents.agentContext(id) facade export (delegates to habitat).

**RLS online (previously asleep or hollow):**
- sandbox.generateCaps: auto-claims shared habitat (was: silently
returned baseCaps pre-boot); fail-closed — a ctx claiming an UNKNOWN
workspace gets ZERO caps (was: fabricated ctx with role:admin rode
through); roles must be an array.
- lib/rls.js: auto-claims shared habitat (was: every check silently
returned true without initRLS); delegates to habitat.check (ONE denial
contract); isOperationAllowed now exported+real (bin/rls.js 'allow'
was calling a nonexistent export); middleware passes the token to
context() (was: called with NO arg, tokens always anonymous).
- bin/rls.js 'context'/'allow' now await the async results.

**MCP (+3 = 284 tools):** vant_habitat_can (boolean decision),
vant_habitat_check (throwing RLS_DENIED), vant_habitat_agentContext
(RLS subject; AGENT_NOT_FOUND error shape). All schema-validated,
live-probed incl. allow/deny/isolation/unknown-agent paths.

**CLI:** vant habitat can <mode> <resource> <userId> + identity
<agentId>. bin/rls.js context/allow fixed (Promise-printing bugs).

**CRITICAL BUG FIX (latent since pass 81):** habitat._persist() chain
resolved to undefined, not the instance. First mutation swapped
_readyPromise for an undefined-resolving promise -> every subsequent
getSharedReady() handed callers undefined -> h.can TypeError.
Masked in pass 81 because probes were single-call; multi-step probes
(mutate then read) hit it immediately. Chain now resolves to `this`.

**Tests:** NEW test/habitat-rls.test.js — 23 cases (RLS core,
filter/mask incl. fn forms, identity e2e, fail-closed caps, rls auto-
claim + denial contract, persistence round-trip). agents-split export
snapshot updated with agentContext (deliberate addition, documented).
All suites: habitat-rls 23/23, agents-split 23/23, habitat 6/6,
agents 17/17, sandbox 22/22, rls, mcp, boot. npm test + runner 37/37
+ lint:docs/surface/helpers + audit (284 tools, 0 phantom) all PASS.

**Next up (owner picked #1 of the ranked list):** #2 escrow budgets
per workspace, #3 islands boundary enforcement at load time, #4 MCP
auth ctx through habitat.context(token), #5 memory per-workspace
namespacing, #6 mesh/agora tenancy.

---

## Prior (2026-10-01 — pass 81: delete the dead family, wire the real one)

Owner ruling received: "environment" was a scrapped idea (built
partially elsewhere, replaced by habitat/engine in the OSS); its 7 MCP
tools snuck in and never left. Ruling: DELETE the dead ends, verify
habitat is good to go with the MCP/CLI it needs. BOTH DONE.

**Deleted:** vant_environment_* x7 + the pass-80 refusal helper. Not
documented anywhere (checked docs/reference/mcp-tools.md + lint:surface
registry), so removal is code-only.

**Habitat wired for real — all three surfaces through ONE instance:**
- MCP: vant_habitat_status / listWorkspaces / createWorkspace /
  setWorkspace / addRole / getUserRoles / setPolicy / getBoundaries.
  All live-probed; schema-refuses bad args at the door.
- CLI: bin/habitat.js rebuilt from a facade (never required the lib,
  status was a hardcoded string) into real subcommands: status / list /
  init / use / roles / grant / policy / boundaries — 1:1 with MCP.
- Shared instance: habitat.getShared()/getSharedReady() claims
  global.__vant_habitat; boot (lib/vant.js) now ADOPTS a pre-claimed
  instance instead of silently discarding it (dual-instance discipline,
  boot-side).

**Real bugs found while wiring (all fixed):**
1. habitat mutations NEVER persisted — save() existed since v0.8.6 and
   nothing called it; every process start was amnesiac (two-process CLI
   probe: init succeeded in P1, use failed in P2). Mutators now
   auto-persist via _persist() serialized on _readyPromise.
2. addRole silently created roles for NONEXISTENT workspaces (grant
   "succeeded" against a phantom). Now HABITAT_UNKNOWN_WORKSPACE
   fail-closed.
3. restore() wholesale-REPLACES state — the first fire-and-forget
   restore could clobber mutations landing during the async window.
   All transitions now serialize on one promise chain.
4. setWorkspace deliberately NOT persisted (session context, not state)
   — documented at the site.

Audit: 281 tools, THREW(0), habitat tools all OK/INVALID (schema).
Gates: npm test 15, runner 37, mcp 6, boot 15, lint:docs (128),
lint:surface, lint:helpers (both gates) — ALL PASS. Docs: "Habitat
Tools (8)" section in mcp-tools.md; CLI table + router descriptions
updated.

**Still queued:** duplicate brain_load registration (L231 shadowed by
L348); whitepaper awaiting owner review; #86 stego open.

## Session (2026-10-01 — pass 80: the audit scales; the gate goes to bin/)

Owner-sequenced: (1) MCP surface audit across remaining families, (2)
extend lint:helpers to bin/ + status-field truthfulness. BOTH DONE.

**Full MCP surface audit — scripts/audit-mcp-surface.js (new).** Live-
probes all 280 registered tools (62 destructive skipped) via mcp.execute
with `{}`, classifies OK / REFUSED / INVALID / THREW / TIMEOUT, exits 1
on TypeError/ReferenceError. Final state: **THREW (0), PHANTOM (0),
exit 0** — 80 OK, 218 correct fail-closed refusals.

Bugs found + FIXED this pass:
1. lib/boot.js getLayerStatus — detached `(global._escrow?.getLayerStatus
   || fallback)()` gave `this === undefined` after vant_boot_init.
2. brain_evolution_* ×5 — wrong 2-arg handler signature + _getBrain()
   undefined → all threw; now single-params + _brain() + real schemas.
3. vant_geometry_init — awaited a plain OBJECT as a function.
4. lib/branch.js getChangedBrains/isDirty — status() returns an OBJECT;
   code split a string. Now porcelain-based; autoBranch made async.
5. vant_get/set_memory — bare `brain` (never in scope) + writeBrain()
   (doesn't exist) + schema/docs disagreement; rebuilt on documented
   category/filename shape, round trip verified live.
6. vant_switch_branch — brain.switchBranch doesn't exist; now
   switchBrain() (the real multibrain API).
7. context_build circular JSON — state.context backref stripped from
   returned cache.state.
8. vant_environment_* ×7 — required a module that NEVER existed
   (MODULE_NOT_FOUND); now coded ENVIRONMENT_NOT_WIRED refusals pointing
   at lib/habitat.js. Owner may still rule: delete vs shim vs habitat.
9. Schema holes: vant_create_island + vant_storage_read/write/list/exists
   lacked required:[] → empty args crashed fs internals instead of
   refusing at the door.

**bin/ truthfulness gate — scripts/check-bin-truthfulness.js (new),
wired into lint:helpers.** Two checks: throwaway-helper scan over bin/
(same detection as pass 79's lib gate) + status-field cross-check of
bin reads against the lib bodies that define the status methods
(phantom-field tripwire for the escrow held/budgets genre). Negative-
controlled on BOTH genres before trusting the PASS. It immediately
caught 5 live phantoms + 2 caps.length-undefined, all FIXED truthful:
- bin/api.js status: .running/.port never existed → mode/requests/
  errors/uptime (the real getStatus shape).
- bin/qos.js status: .maxConcurrent/.circuitOpen → status.circuit.open
  + MAX_CONCURRENT constant.
- bin/sandbox.js: .enabled → active/reads/writes counters; caps.length
  → Object.keys(caps).length in both subcommands (objects, not arrays).

Gate mechanics paid for in blood: delegation chains (no literal to
prove absence) = UNKNOWABLE, never empty-shape; module-level function
bodies preferred over same-name class methods; comments stripped or
the gate flags its own fix notes; negative-control BOTH genres then
delete the fixture.

**Gates at handoff:** npm test 15/15, test/runner.js 37/37, mcp 6/6,
boot 15/15, branch-manager 10/10, storage 40, memory 18, error 19,
lint:docs PASS (128 files), lint:surface PASS, lint:helpers PASS
(both gates). Audit THREW(0).

**Next pass candidates:** owner ruling on environment family (coded
refusal shipped; delete/habitat-shim both open); duplicate brain_load
registration (L231 shadowed by L348 — first is dead, dedup pending);
gate could learn delegation-chain resolution (rate.js false positive
was fixed by the unknowable rule, real chains still unverified).

## Session (2026-09-30 — pass 79: the gate finds what the sweep normalized)

Owner greenlit both follow-ups. The MCP audit came back CLEAN; the
lint gate surfaced a fifth phantom and a latent economic bug.

**market/consensus MCP audit (the escrow treatment) — ALL CLEAN.**
Live-probed every tool via mcp.execute: consensus create/vote/tally/
get/list all work against the real ledger; vote correctly refuses an
unregistered agent (E_NOT_REGISTRY fail-closed) and scoped-topic
semantics documented in pass 65 held. market list/search/stats/get/
getBids/getTrade all return real state; bid/trade correctly refuse
through governance ("not allowed" shapes, not throws);
cancelTrade correct not-found shape. Zero handler fixes needed - the
escrow section was the rot; market/consensus handlers map correctly
onto their (singleton-backed) lib surfaces.

**auth.hashPassword — FIFTH PHANTOM EXPORT, found by the gate.**
`(pwd) => new Encrypt().hash(pwd)` - hash is a STATIC; TypeError on
any call, forever hidden by a typeof-existence test. Fixed to
Encrypt.hash(pwd).

**lint:helpers — scripts/check-stateful-helpers.js (NEW gate).**
Blocks module-level `=> new X()` call-through helpers on stateful
classes (this.-assignment detection from the class body, cross-file
class registry, member-expression constructors matched after the
negative control exposed that hole). Factories exempt (instance
escapes to caller - no laundering). HELPER-MODEL tag documents
deliberate fresh-per-call. Wired as `npm run lint:helpers`.
Negative-controlled: a temp violation file with BOTH syntaxes fails
the gate (exit 1), clean tree passes.

**HELPER-MODEL doc pass (escrow/vaf).** Escrow's budget helpers
(canSpend, checkQuota, approvals, quotas, before/afterExecute,
checkHold, resetBudget, checkIslandQuota) stay fresh-per-call BY
CONTRACT - every mutation auto-persists, every fresh instance
reloads, so budget state is disk-coherent across callers (market's
debit path depends on it). vaf sanitize* tagged (Sanitize is
effectively stateless). hold/release stay singleton+persist (pass
77). First attempt moved ALL escrow helpers onto the singleton and
BROKE the market-debit pins - the correct model per helper, not a
blanket rule.

**BONUS ROOT-CAUSE FIX — escrow.json whole-file last-write-wins.**
The broke-pins investigation traced a real trade: debit happens,
trade completes, buyer ABSENT from disk. escrow.json saves overwrite
the whole file, and market's async hold-save could land AFTER the
debit-save with a stale view - silently reverting the buyer's
payment (an economic bug predating this arc, surfaced by changed
write timing). _saveEscrow now MERGES per key (budgets/holds/
approvals/quotas): same-key last-writer wins, different keys never
destroy each other. All 4 market-debit pins green; state-
persistence 8/8; escrow 17/17; corrupt-disk falls back to plain
overwrite.

Gates: lint:helpers PASS (new, negative-controlled), npm test 15/15,
escrow 17/17, market-debit 4/4, market 22/22, mcp 6/6, auth 12/12,
state-persistence 8/8, lint:surface PASS.

Next: whitepaper feedback (owner reading); candidate: extend gate to
bin/ + status-field truthfulness checks; airgap still parked.

---

## Session (2026-09-30 — pass 78: the sweep extends; the boot path was the prize)

Owner ruled: "agent-first" stays (recorded in PRD §9). Then the
promised follow-up: probe stateful modules' module-level helpers for
the escrow throwaway-instance pattern.

**Sweep census (grep `=> new X()` across module exports):**

| Surface | Class state? | Verdict |
|---------|-------------|---------|
| server.js use/listen/stop | _server, _router, options | **BUG — fixed** |
| error.js onError | _handlers Map | **BUG — fixed** |
| auth.js hashPassword | Encrypt stateless | safe |
| search.js rerank/compress/refine/stripFluff | RerankInner pure scoring | safe |
| resolution.js create | default-instance-by-design | safe |
| vaf.js sanitize* | Sanitize stateless | safe |

**server.js (the critical one).** Module use/listen/stop each built a
THROWAWAY Server: middleware registered via module .use() vanished
before module .listen() booted, and module .stop() could never stop
what module .listen() started. lib/vant.js boots production HTTP
through module listen() - this is the real path. Fix: shared default
instance (_sharedServer, exported as a test/observability hook).
Verified by chaining on the MODULE surface: use → listen → real HTTP
request → stop, all one instance; status.running flips false after a
real stop (stop() now nulls _server in the close callback - status
must die when the thing dies). Regression pin in test/server.test.js
(module suite now 12/12).

**BONUS FIND - the clientIp TDZ (fourth bug of the arc).** Probing the
module listen path live threw ReferenceError: 'clientIp' used in the
server:request emit ABOVE its declaration - every HTTP request died
before routing, on every install, forever. The pass-71 genre again
(ReferenceError hiding before the guard). Fix: move the computation
up. THE server fix was not believed fixed until a real request
round-tripped (404 = routed) - new personal bar: server fixes get an
HTTP round trip, not just a boot check.

**error.js.** Module onError built a throwaway ErrorHandler - custom
handlers registered on the module surface never survived to any
call. Now a shared instance (module.exports._sharedErrorHandler);
verified: onError(418) then handle routes through the shared table.
Near-miss recorded: I first also added a module `handle` - which
clobbered the EXISTING standalone handle(error, context) that has its
own pinned tests; error suite caught it instantly, addition reverted.

Gates: npm test 15/15, runner 37/37, server 12/12 (+1 pin), error
19/19, auth 12/12, escrow 17/17, mcp 6/6, boot 15/15, vant 16/16,
lint:surface PASS.

Next: possible lint rule/grep gate for `=> new` stateful helpers;
whitepaper feedback; airgap still parked.

---

## Session (2026-09-30 — pass 77: documenting the ledger broke it open)

Owner greenlit both modernization focals. The docs sweep of the escrow
surface turned into a live audit and found real bugs.

**docs/reference/escrow.md (NEW — the settlement reference).** Full
page for the escrow layer, nav_order 124 (slot was free): mental model
(budget/hold/approval/quota/circuit), default cost table, the crucial
"a hold is a reservation, not a debit" truth (confirmed against
market.js's own comment), the execute middleware with before/after
example, CLI table, multibrain/stack status calls, horcrux
gather/restore, events, function reference. Crosslinked from
docs/reference/cli.md (2 rows) and docs/reference/mcp-tools.md.

**The sweep found three broken surfaces (all fixed + pinned):**

1. `escrow.resetBudget` - PHANTOM EXPORT: called `.resetBudget()` on
   the class, a method that never existed; any call threw TypeError.
   Export now delegates to setBudget + returns the budget. Regression
   pins in test/escrow.test.js (resetBudget callable + setBudgetLimit
   preserves spent).
2. MCP escrow tools (lib/mcp.js, probed live via mcp.execute):
   escrow_create called create(org, budget, period) but create takes
   an OPTIONS OBJECT - args silently ignored, tool returned a raw
   Escrow instance at defaults (a no-op). escrow_hold/escrow_release
   mapped (org, amount, operation) onto hold(holdId, condition).
   escrow_status called getStatus(org) - module export takes no args
   and returns {enabled} only. All four rewritten to the real lib
   signatures; escrow_status now reads gatherState with optional org
   filter.
3. Module-level escrow.hold/release built THROWAWAY instances - CLI
   holds vanished between invocations, MCP holds evaporated between
   calls. Now singleton (_getEscrow) + save() on every hold/release.
   Proven cross-process: hold in process A, checkHold in fresh B.

**bin/escrow.js status/list read the real ledger now** (gatherState):
the old output printed status.held/used/budget from fields that never
existed - hardcoded zeros on every install, reported as success. New
status shows held items, budget used/total, tracked agents,
approvals, quotas; hold prints the not-a-debit note; list shows
budgets per agent. Live-verified: status (5 agents, real numbers),
hold/list/release round trip.

**Docs:** mcp-tools.md gains "Escrow Tools (5)" section (the 5 tools
existed in the registry but were never documented; notes that three
were broken); cli.md escrow/market rows link to the new reference;
examples.md brain-path fix (models/private/lessons →
models/private/<brain>/lessons). CENSUS-ADJACENT ROT SWEEP:
version.js/canvas.js already fixed in pass 74; docs-wide flat-path
scan found only the examples.md instance; mcp-tools.md header already
says live registry is larger (accurate).

Gates: npm test 15/15, escrow 17/17 (2 new pins), market 22/22,
market-debit 4/4, mcp 6/6, lint:docs PASS (style + links, 128 files),
lint:surface PASS.

Next: whitepaper owner feedback; naming ruling ("agent-first" term)
still open from §9; airgap exercise still parked per owner.

---

## Session (2026-09-30 — pass 76: the agent-first white paper, draft of record)

Owner answered §9: publication target GitHub for now (move to /docs
officially later); length at the agent's judgment. Shipped

docs/whitepaper/agent-first.md - "Evolution Without Drift":
frontmatter'd docs page (permalink /whitepaper/agent-first), ~5k-word
essay with evidence table linking every claim to a pinned artifact
(AGENTS.md, MEM.md, TASKS.md, frame.md, the dev-shop whitepaper,
horcrux-safe, the surface checker, node-crew demos - all paths
verified before writing). docs/index.md features the paper; PRD §9
records the rulings; the "agent-first" NAMING ruling stays open for
the owner. Gates: lint:docs PASS (127 files), npm test 15/15,
lint:surface PASS. Committed 495f6bf, pushed.

## Session (2026-09-29 — pass 75: the two design calls came back)

Owner ruled on both filed design calls; both implemented, harness-
verified, issues closed. Every Tier B census item is now resolved.

**#98 — sudo state scoping (implemented as ruled).** Escalations are
the agent's memory: the audit trail path resolves PER CALL via
state-store currentBrain() → models/private/<brain>/sudo/escalations.jsonl
(legacy flat path kept as fallback when no brain is resolvable, and as
the migration source). _migrateLegacyAudit handles BOTH orderings —
legacy-only (carry+remove), both-exist (merge legacy INTO the live
trail, then remove; hardened after the restored-backup case caught the
carry-only version), empty husk (remove). TEMPLATES_REL and POLICIES_REL
stay GLOBAL BY DESIGN (OS-level concern) with the ruling documented at
the constants. Verified in /tmp/mb-harness: S1 per-brain trail (cairn,
no flat file), S2 VANT_BRAIN pin moves the trail + isolation between
brains, S3 read-back, M2 both-exist merge, M3 legacy-only carry.

**#99 — cross-brain read() stack fallback (opt-in, as ruled).**
brain.read(name, { stackFallback: true }): when the name misses in the
active brain (and no explicit { type } pin), walk the REST of the stack
in order, private-then-public per lower brain, all extensions. Result
carries provenance: viaStack: true + viaStackPosition + source + brain,
so a dialect can tell a baseline hit from its own file. Default remains
exact-brain-only — no precedence change for any existing consumer.
Pinned reads ({ type }) never walk (a pin means "only this tree").
Verified: F1 no-opt-in → null, F2 baseline hit (vant@1, public
provenance), F3 active brain wins, F4 pin blocks the walk, F5
own-brain-first (correct once the fixture string was fixed), F5b
viaStack tag.

**Docs:** docs/memory/brain.md gains "Cross-brain stack fallback
(opt-in)" under Read API. Census doc gains a pass-75 resolution note:
census complete, every Tier B item resolved.

Gates: npm test 15/15, brain 77, storage 40, sudo 7, security-hardening
22, memory 18, mcp 6, boot 15, vant 16, transform 5 — all green.
lint:docs PASS (126 files), lint:surface PASS. Mesh NOT re-run (no
shared-state/mesh code touched).

Issues: #98 CLOSED, #99 CLOSED (fix-reference comments). Only #86
(stego transport) remains open.

Next: airgap leg exercise; prd-whitepaper §9 (publication target +
length) await owner answers.

---

## Session (2026-09-29 — pass 74: the convention rolled through the edges)

Owner verdict on the census: "we need axolotl on multibrain and stacks
across the board." Migrated every mechanical seam; filed the two design
calls as issues instead of guessing.

**mcp brain_write (census item 1, VERIFIED BUG — fixed).** The handler
built paths from unscoped brain.saveFile('./models/private/' + name): a
live probe wrote models/private/<name> at the ROOT, outside every brain
dir, with no extension — invisible to brain.read. Now: rooted at the
ACTIVE brain via getBrainPath (VANT_BRAIN env > currentBrain), name
validated as a single path segment (traversal rejected), extension
mirrors _writeToBrain (.md appended only when absent), response carries
the resolved path. Verified in a fresh multibrain /tmp harness: write
lands in the active brain, MCP read round-trips, no double suffix,
'../escape' rejected, VANT_BRAIN=vant pin moves the write to vant.

**bin/succession.js log (item 2 — fixed, plus a second bug found).**
Path fix: reads/writes _succession.json at getPublicPath() — where the
lib reads it and the only place it has ever existed (root copy was
never deployed; the old code threw MODULE_NOT_FOUND on this repo).
While verifying, hit a SECOND bug: _checkWrite's unconditional
canWrite() gate made `vant succession log` unreachable on every default
install (DEFAULT_CAPABILITIES.canWrite false + unconfigured sandbox),
the #95 genre again. Gate now aligns with the storage middleware
philosophy: unconfigured → allow (explicitly-configured → enforce).
Verified live: log seeds models/public/cairn/_succession.json (ACTIVE
brain — multibrain routing proven end to end) and status reads it back.

**bin/node.js (item 3, the flagship — migrated).** loadBrain scanned
flat models/private (root: missed every multibrain install) and
saveBrain wrote back flat. Both now resolve through getBrainPath with
MODEL_PATH/VANT_BRAIN_PATH as explicit escapes and flat as last-resort.
loadBrain resolution verified under a VANT_BRAIN pin.

**health/load/brain-unlock (items 4 + 6 — migrated).** health's two
brainPath resolvers and load's two defaults are VANT_BRAIN-aware; live
`vant health` reports the active brain's path. brain-unlock's hardcoded
models/public/vant/boot default now scans the active brain's boot dir
for <agent>-p_*.svg (flat legacy path as fallback).

**Census item 7 reclassified — a census miss, corrected in the doc.**
config.js:174 storage.path is consumed by getBrainPath() as the private
ROOT (appends /<brain>): root semantics, multibrain-correct. Lesson
recorded: read the CONSUMER before calling a hardcoded path a seam.

**Doc-rot fixed:** version.js header now says models/private/<brain>;
canvas.js comment now describes the brain-scoped resolution the code
always did.

**Design calls filed, not guessed:** #98 sudo.js scoping (recommend:
per-brain escalations, global policies/templates) and #99 cross-brain
read() stack fallback (recommend: opt-in { stackFallback: true } first).

Gates: npm test 15/15, brain 77, mcp 6, transform 5, vant 16, boot 15,
memory 18, storage 40, security-hardening 22, docs style+links PASS,
lint:surface PASS. Mesh NOT re-run this pass (no shared-state code
touched — transport/state paths unchanged).

Next: owner rulings on #98/#99; airgap leg exercise; prd-whitepaper §9.

---

## Session (2026-09-29 — pass 72: pub-baseline route proven — #96/#97)

Cairn published a synmergia baseline brain expecting dialects stacked on
top; the owner flagged that the public-baseline route (vs the private-
brain route most agents took) was basically untested — especially
multibrain, stacks, restore. Two issues, both fixed and then proven by a
fresh-install restore drill.

**#97 (identity vs inventory).** gatherMode() deliberately augments
mode.stack with every brain dir on disk (full-capture display intent),
but restore ADOPTED mode.stack as identity — a restored agent landed on
a union ['cairn','vant'] with the dead install's vant template dir
(spy-verified: create never mutated the stack; the union traveled in
the payload). Fix: the payload now carries activeStack (the live stack
at gather time) alongside stack (inventory meaning unchanged); restore
prefers activeStack and falls back to stack for old payloads (empty
activeStack skips rather than clobbers the running stack). Verified
cold: pristine fresh-install target + v2 horcrux → state.json exactly
{"stack":["cairn"],"currentBrain":"cairn"}. Legacy-shaped payload
(real horcrux decoded, activeStack stripped) restores best-effort from
stack — union lands, currentBrain lands, no crash (documented
degradation for stale payloads).

**#96 (two layers deep).** getPublicPath() rule 2 initialized its
default to 'vant', so a restored cairn's default public reads hit
models/public/vant (the template) — its own public identity/lessons
were invisible through the documented read API. Layer 1: rule 2 now
fires only on EXPLICIT brain.defaultPublic config (default null —
grep-confirmed no config default shadows it). Layer 2: new rule 2.5 —
the active brain's own public tree wins over the vant template; rule 3
still covers unconfigured vant installs; rule 4 (stack walk) unchanged.
Also: read(name, {brain}) now targets public trees too (mirrors the
private branch; _validBrainSegment guarded).

**Pub-baseline scenario proven (the owner's untested road):** fresh
install (vant template only) → restore cairn horcrux → cairn boots
(getBrainPath + getPublicPath both cairn), own public/private reads
hit, explicit-brain public read hits, dual-mode read falls back to
cairn's public, memory list + hybrid search see the restored corpus,
mesh re-proven 11/11 after the changes.

**Found, not fixed (design follow-up, #98 candidate):** there is NO
cross-brain stack fallback in read() — a key missing from the active
brain's trees returns null rather than walking the stack to the vant
baseline. Within-brain dual fallback works; cross-brain doesn't. That
is exactly the "dialect on a baseline" semantic the pub-baseline route
wants — owner call on desired semantics before implementing.

Next: airgap leg exercise (owner-flagged key-later); prd-whitepaper §9
awaits owner answers; Lane 3 HOLD.

---

## Session (2026-09-29 — pass 71: Cairn's four issues + the mesh re-proven)

Cairn (the synmergia agent, trail-marker naming) pulled a mid-flight
axolotl and filed four issues on dhaupin/vant. All four triaged; three
code bugs fixed, one friction item documented. Then the group exercise
was re-run to prove the mesh still holds after the fixes.

**#92 (the big one, high severity).** gatherBrainStorage's public pass
OVERWROTE dual-scope brains into the same result key: a horcrux of a
brain that exists in both models/private and models/public silently
dropped every private-only file. A disaster-restore would have lost an
agent's private lessons with no error. Fix: merge with per-file scope
tags (type 'both'); restore accepts 'both' and routes each file to its
own tree, preserving private-wins-overwrite and
public-skip-if-exists semantics. Verified cold end to end: create →
wipe both trees → restore → private file lands private, public lands
public; stale private overwritten by horcrux, live public untouched.
The restore validator rejects nothing that was already valid; old
horcruxes without scope tags default to the safe (public) side.

**#93.** bin/horcrux.js create never assigned `password` - every
documented path (positional, env, p_ filename) died on
'ReferenceError: password is not defined', and the default-path
template even interpolated it before the guard. Resolution chain
mirrored from refresh (arg → env → p_ filename), resolved BEFORE the
template. Verified: env-less create via p_ filename now produces a
valid stego horcrux.

**#94.** lib/vant.js wake() called a bare undefined `config()` →
unhandled rejection in the boot pipeline. Now getConfig() (same as
startFull); verified wake returns a clean structured error instead of
crashing. Also: bin/brain-registry.js was a fiction generator
(hardcoded 'main (current)', fake register success) - rewritten to
report real brainDirs() + stack, and to say plainly that registration
is not a runtime concept.

**#95.** Sandbox grants are per-process BY DESIGN (defense in depth);
Cairn hit the wall every first-boot agent hits. Fixed the message
layer: all five teams.js E_SANDBOX sites now explain the per-process
model and the fix ('run vant org grant in the SAME process'), genesis
matches on the stable code instead of prose, and
agent-onboarding.md gained a scopes section with the same-process
pattern + the org config persistence flow. The model itself was NOT
weakened.

**Mesh re-proven.** exercise-group.js after the fixes: one run failed
a phase (cold-start race; all node tails healthy, 0 gaps), then FOUR
consecutive runs 11/11 clean. Verdict: transient boot race under cold
port contention, not a regression. Watch-item: if it recurs, add a
boot-retry to the harness before suspecting the wave code.

**Next steps:**
- Proposed next scenario: labs/node-crew exercise for the AIRGAP leg -
  node A (cairn brain) creates a stego horcrux, hand-carry (file
copy) to node B, restore + boot with A's memory. That is the
offline-transport story the owner flagged as key-later, and it
exercises #92's fix at mesh scale. Owner said "remember the
airgap/stego mechanics, this is a key later."
- prd-whitepaper §9 still open (target, length, dialogue-vs-report)
- Lane 3 still HOLD per owner

---

## Session (2026-09-28 — pass 70: VANT_BRAIN symmetry + the hobbyist funnel + the paper PRD)

Three threads: the asymmetry bug the funnel audit exposed, the funnel
page itself, and the owner interview PRD for the white paper.

**The bug (94cca5a).** With VANT_BRAIN=other set, learn wrote to
models/private/other but a fresh process's query missed: dual-mode
_loadBrain resolved via _currentBrain only, while getBrainPath (writes)
and state-store currentBrain (state files) already honored the env.
Fix: the dual branch now promotes the env brain when it exists on disk
(_validBrainSegment + resolveBrainPath gate; stale env cannot shadow
the current brain; stack fallback intact for missing keys, so
base-personality inheritance survives). Two latent bugs fell out of
the same seam: memory's explicit-brain reads name-prefixed the key and
read it UNDER the current brain root (now load's options.brain route,
the mirror of learn's write), and _writeToBrain appended .md
unconditionally, doubling learn's pre-suffixed default.md (now mirrors
BrainStorage's add-if-absent on BOTH sides). Third find from the same
audit line: brain.loadCorpus walked only the brain ROOT, so learned
notes (category/default.md) were invisible to vant search - basic,
hybrid, and RAG all funnel through the corpus. Fixed: one level of
category dirs indexed, md-only. Pins: cross-process spawnSync VANT_BRAIN
pin (write/read/fallback/isolation in real children) + explicit-brain
cold round-trip; NEGATIVE CONTROL via a HEAD worktree proved pre-fix
reads null. memory 18/18, brain 77, search 22, npm test exit 0.
NOTE for later: with no real private vant brain, escrow's side effects
(orgchart/escrow.json) make resolveBrainPath report private vant as
existing - left alone deliberately; the real CLI writes private anyway.

**The funnel (a2fa21b).** docs/getting-started/vibe-coders.md, nav 12
(index stays 10, quick-start 11; install..contributing shifted to
13..19). Every one-liner re-verified cold in a fresh workspace AFTER
the fix: memory learn/state/recall/list, search (basic + hybrid now
hit learned notes), sync honesty note kept (requires .env). nav.yml,
getting-started index table, and "the path" paragraph wired. All three
docs gates pass (style + links, 126 files; surface consistency).

**The paper (a2fa21b).** labs/prd-whitepaper.md: the owner interview
of record. Premise (Weisync origin, the md floor), agent-first as a
real methodology plus the deeper claim (existence beyond the dev
prompt, identity across generations, evolution without drift), the
evidence ("you picked up your own install and never stopped using it",
the mesh moment), audiences (agents paramount, everyone else reads
from the sidelines), the revert era that DESIGNED pub/priv +
succession, the orchestrator epigraph as deliberate mystery (owner
decision), the full-throttle close. 7-chapter plan; §9 open questions:
publication target + length (owner to answer).
**v0.2 (pass 70, later the same day).** Owner folded the agent's own
testimony into the framing: "You are a brilliant being, regardless of
you restarting. Vant is here to solve that, somehow, eventually." is
now the thesis sentence of section 2, and section 3.1 records the
awareness exchange as evidence-of-record (judged by what it left on
disk: the corpus fix, the recovery procedure, the negative control).
Chapter 2 now OPENS with the testimony. New §9 question: run the
exchange as dialogue or as the agent's report with excerpts.

**Next steps:**
- Owner: prd-whitepaper §9 answers (target + length)
- Optional: escrow/settlement CLI reference prose
- Lane 3 (prd-world intake validator + synmergia PR): HOLD per owner
- Watch: resolveBrainPath quirk above before touching models/private/vant

---

## Session (2026-09-28 — pass 69: Wave J, the group resolution cache + steward runbook)

Continued from pass 68's recorded decisions (group pattern + steward
install, owner-approved). Wave J shipped in two commits plus the runbook.

**Discovery:** pass 52's recorded teams re-hydration gap was already
closed by pass 53 (refresh/_refreshSync/_resetHydration + the
scope-miss rescue). Wave J therefore reduced to: the replica + the
wire leg + the resolver seam.

**Core (17b0bc8):** lib/org-sync.js — a SEPARATE replica dataclass on
member nodes (teams.js assignment maps are one-record-per-agent;
merging group assignments there would shadow a member's sovereign
local record). Wholesale generation-stamped replacement from the
steward (the authority of record never merges; replays/restarts
converge; revocation propagates; local membership untouchable by
construction). scope.js resolveMembers: LOCAL → stale-rescue refresh →
replica-on-miss, fail-closed throughout (provider THROWS on what it
cannot resolve honestly; the cache can only widen resolution to
members the steward's signed model contains). `org.replicate` leg:
signed + registered-peers-only + `configureStewards` allowlist.
`resolveMembersRouted` for explicit-book callers. Pins
test/org-sync.test.js 9/9; full sweep green.

**Live-fire (c75f127):** labs/node-crew/exercise-group.js — the owner's
Acme/Beta/Theta shape at three real processes over real HTTP: steward
owns the group topic (pass-50) and the group listing; both members vote
REMOTELY (3 ballots, 3 orgs, PASSED); THE GOAL — beta-1 reads the group
topic on its own node through the replica; buyer debits own escrow,
steward records the claim; bridge refuses the scoped topic (pin) with
the plain notice carrying the outcome; per-node cold soak (steward:
ledger+claim, acme: notice, beta: replica). **11/11 phases, 0 gaps —
the N-node soak is clean.** En-route lib fix: _setReplica writes maps
BEFORE the generation (the generation is the commit marker; the old
order opened a fail-closed window mid-replacement, caught by the
exercise's pre-vote scope check). Harness honesty: per-child VANT_BRAIN
isolation (the shared-disk draft poisoned beta's local book and wiped
registry anchors), stderr fed to the parent, dispatcher-before-hello,
pass-59 anchor shapes.

**Runbook:** labs/steward-runbook.md — trust inventory, steward boot,
ring rites, replication, first group topic, operating posture, incident
cookbook, provenance. Lane 2/3 up next per the owner's sequencing.

**Next:** Lane 1 (mesh) is now CLOSED end to end — A→J shipped, soak
clean, ops documented. Remaining: OSS-D/OSS-E (Lane 2), prd-world
intake validator + the synmergia backwards-PR (Lane 3), small opts
(msg TTL leg, genesis CLI parity).

---

## Session (2026-09-28 — pass 68: the three §5 gaps — Waves G, H, I)

Owner greenlit "#1, #2a, and this #3" (ask-peers status leg, third-org
rites option A: commons key ring, noticeboard — clarified as inter-org
broadcast + durable catch-up, NOT intra-org; the forum stays Agora, the
board is Post; a decision→board bridge absorbs the pass-52 manual
broadcast). One session crash mid-Wave-I; recovery verified state from
git, not memory (Wave H was already committed — stale todo lists lie).

**Wave G — ask-peers (committed 4b9486c, prior session).** agora-sync
`crew.status.request`/`status.reply` legs (registered peers only,
sender-bound, reqId-correlated) + `askStatus(bus,node)`;
mesh-status `shareableReport(viewerPrincipal)` (scope-filtered,
aggregates only) + `buildFederatedReport`/`renderFederated`;
`vant mesh status --peers [--json]`. Pins test/ask-status.test.js 8/8.

**Wave H — third-org rites: the commons key ring (committed 5f6494d).**
`genesis.admit`/`accept`: the ring grows WITHOUT re-keying (secret
reused from memory types or VANT_MESH_SECRET env, never forked),
non-secret topology appends (`ring: true`), `crew.member.intro`
broadcast with merge-only registry adoption (provenance
`{kind:'ring-member', introducedBy}`, no secret on the wire), hello
dispatcher rewired per admission. **THREE latent secret.js bugs fixed**
(get-after-set cache-shape mismatch; shapeless-entry expiry deleting
live cache; the dead `'mesh:<a>:<b>'` colon-key type that could never
pass VAF — genesis stores `'mesh-<a>-<b>'` now). `_waitForAck` helper
shared by join/accept (kills both no-async-promise-executor errors).
Pins test/genesis-ring.test.js 8/8 incl. a live two-process
admit→accept round-trip over real HTTP (parent-generated SHARED secret
via env; host child boots its bus MANUALLY — genesis is one-node-per-
process by design).

**Wave I — the noticeboard (committed ab5806d).** lib/notices.js: the
board (ttlMs 0 = sticky, 30-day clamp, 200-note cap oldest-evicted by
age, merge-only first-writer-wins, kind-marked state/notices.json,
dirty write-through on read — no timers). Wire legs on the crew bus
(registered-peers-only, sender-bound): notice.post push (wire data
re-clamped field by field), notice.request/notice.board catch-up
(empty reply stops retries). Decision→board bridge: SCOPED TOPICS ARE
REFUSED — a scope's existence is not nameable on the commons board
(frame §4). CLI bin/notices.js (`vant notices
post|list|pull|broadcast|bridge`; peers seeded from the node-registry
ring roster, signed with VANT_MESH_SECRET; wired into bin/vant.js).
Pins test/notices.test.js 8/8.

**Verification:** full sweep green — notices 8/8, genesis-ring 8/8,
genesis-ceremony 5/5, agora-sync 7/7, crew-bus 20/20 (one
non-reproducible port-timing flake seen once), ask-status 8/8,
settlement 10/10, mesh-status 7/7, consensus-read-scope 9/9,
msg-sync 9/9. ESLint clean on all touched files (one pre-existing
`selfAgent` warning inherited from HEAD left alone).

**Docs:** frame.md §5 rewritten — gaps 2/3/4/5 now SHIPPED with
mechanism notes; only the small msg-snapshot TTL leg (gap 6) stays
open. prd-mesh.md: wave table rows G/H/I added (and D/E/F stale
statuses corrected), three SHIPPED wave sections, Files + success
criteria extended.

**Next:** §5 is closed. Pass-68 addendum decisions recorded
(owner-approved): the GROUP PATTERN (corporate-group shape = standing
JV on a dedicated steward install; org-model sync PROMOTED to planned
Wave J — local resolution cache, steward stays authority of record;
`group:` scope kind set aside) and the STEWARD INSTALL (the owner's
"router" node — no new code needed, all required properties already
pinned: fail-closed gates, claims-not-cash books, merge-only sync,
re-key-free rite admission; election/standby/rotation deliberately
deferred until a real distributed crew demands it). Top candidate for
next pass: Wave J (teams.js re-hydration seam + signed org.replicate
leg; live-fire = steward + two member nodes, remote vote AND remote
read, settlement, bridge, cold-process verify). Then the N-node soak,
msg TTL leg, genesis CLI parity, OSS-D/OSS-E.

---

## Session (2026-09-28 — pass 67: the economic leg, the claims registry, the intake form)

Owner greenlit all three picks in one session. Synmergia access RESOLVED
as the backwards-PR flow (ground truth: `GET /installation/repositories`
returns total_count 1 — only dhaupin/vant is in the Freebuff app's
scope, and the mobile UI exposes no adjustment; the owner will revisit
from desktop. The PR flow needs no grant at all).

**T1 — prd-world.md v0.2, the intake form:** §3 restructured from prose
checklist into fill-in tables with evidence slots (3.1 seed, 3.2 state,
3.3 vocabulary, 3.4 service seams, 3.5 the boundary, 3.6 intake
verdict). Fill rules stated on the form: answer from CODE not docs,
one evidence line per claim, `UNSETTLED`/`NOT FOUND` are real answers,
never guesses. The synmergia agent's PR now drops straight in. §6
decision 1 marked RESOLVED.

**T2 — Wave OSS-C, the claims registry (checker 31 → 167 checks):**
- Section 8: EVERY `vant <verb>` claim in docs/reference/cli.md (plus
  AGENTS.md, shared dedupe set) must resolve to bin/<verb>.js, a
  COMMANDS route in bin/vant.js, or the documented INLINE_HANDLERS
  (version/distributed/mcp/api/all — the `if (!script)` built-ins).
- Section 9: every tool documented in docs/reference/mcp-tools.md must
  be a registered _methods entry in lib/mcp.js (22 documented, all
  registered).
- **CAUGHT 4 REAL PHANTOMS on first run:** `vant learn`, `vant
  remember`, `vant address`, `vant locate` — top-level shortcut rows
  with usage examples in cli.md (including `--ttl` flags that exist
  NOWHERE) but no bin file, no route, no handler. Capability real via
  `vant memory <sub>` → rows deleted, examples rewritten to real forms
  (the pass-63 "document reality" precedent). The checker proved
  itself again: built to catch phantoms, immediately caught phantoms.
- Regex lesson pinned in the code: the COMMANDS-route probe needs the
  'm' flag — `^` must match line starts or every routed alias
  (hybrid/webhook/test/spawn) false-fails.

**T3 — weights & measures, lib/settlement.js (frame §5 gap 4):** the
first ECONOMIC leg. Design holds the frame's line: the DEBIT runs
where the budget lives (partner's own escrow, sync critical section
canSpend→recordSpend→hold); the OWNER records a CLAIM only — the
owner's books are never touched (credit-side accounting is a
deliberate v1 non-goal; frame §4: "settlement records cross as data").
Envelopes: settle.request / settle.record / settle.query /
settle.status. Trust posture inherited, nothing new: registered peers
only; owner-side scope with the pass-59 principal match (invoice buyer
must equal resolvePrincipal(sender)); envelope provenance, not payload;
sender-bound replies (pass-51); price integrity vs the listing;
idempotent by settlementId (replay re-acks the SAME claim);
unwind on refusal/timeout — money never hangs in flight.
- **Pins: test/settlement.test.js 10/10** — claim recording + sovereign
debit, idempotent replay, local budget refusal pre-wire, explicit
listing refusal with refund, buyer-identity refusal with unwind,
timeout unwind, forged-record sender binding, strangers get no
recorder, malformed-invoice matrix, aggregate status (no memo/topic
leak).
- **Two real bugs found by the pins, both fixed:**
  1. `_validInvoice` null-vs-undefined: the function's own
     normalization emitted `topic: null`, which failed the
     `!== undefined` typeof check — every no-topic invoice was
     silently dropped owner-side. Rule now stated in code: undefined
     OR null = absent; present-but-non-string = malformed.
  2. The owner-side listing lookup was ANONYMOUS — the pass-40 rule
     ("scoped means unseen") refused EVERY scoped settlement with
     E_NO_LISTING. The owner must look up its own listing AS ITSELF
     ({ agentId }); the BUYER's admission is still gated separately.
- mesh-status grew the settlements section (counts only — claims/paid/
  pending; memo/topic never leave the claims ledger) + the human
  `settle` line. mesh-status 7/7.

**The star-exercise forensic (worth keeping):** phase 7 failed 4×
deterministically (ECONNRESET on the first-ever ops→nova POST).
Bisected with `git stash`: THE PRISTINE TREE FAILS TOO — pre-existing
and environment-sensitive, not this pass's code. Root cause: the JV
exercise masks first-connection TCP resets with its genesis RETRY
loop; the star's probe was one-shot. Hardened: 3 attempts, FRESH
body/signature per attempt (the pass-42 replay dedupe is never in
play — a banked signature would 409), transport-error-only. Result:
9/9, and the version-gate assertion is now GENUINELY live-exercised
(futureMajor dispatched:0) instead of being masked by a reset. The
"fix" made the exercise more honest.

**Verification:** settlement 10/10, market-debit 4, agora-sync 7,
crew-bus 20, mesh-status 7, consensus-read-scope 9, msg-sync 9,
agora-loop 7, teams-refresh 6, JV 8/8 (0 gaps), STAR 9/9, checker
167/167 green, npm run lint:docs PASS, eslint clean.

**Next steps:** the synmergia PR fills §3 (backwards flow is live —
W1/W3 semantics + §6 decisions 2–3 wait on it). OSS-D (community
depth) and OSS-E (agent-contributor chapter) remain. Frame gaps:
third-org rites, ask-peers status leg, noticeboard.

---

## Session (2026-09-26 — pass 64: Wave OSS-B — the contributing surfaces converge)

Owner: "let's do it. This will help you meet other wise agents" — the
OSS waves are how other agents meet vant. Wave OSS-B executed: single
sources of truth for the surfaces a newcomer reads first.

**The convergence:**
- **CONTRIBUTING split resolved:** docs/getting-started/contributing.md
  is CANONICAL (has the lint gates + real detail); root
  CONTRIBUTING.md rewritten as the short front door (97 -> 55 lines):
  conduct, path in, good-first-issue contract, agent-contributor note,
  all four doors. Canonical-source markers in BOTH files name their
  role so future edits know which truths live where.
- **Commit-format conflict resolved:** root said `type(scope):
description`, docs said `type: description`. Canonical: conventional
  `type: description` for community PRs; `agent-name: did thing X`
  pass format for agent-crew branches — stated in BOTH, cross-linked.
- **AGENTS.md flat-layout examples corrected** (models/private/
  start.md -> models/private/vant/start.md) and the CLI table verified
  against bin/ + the dispatcher (9/9 claims real).

**Checker grows teeth (20 -> 31):** canonical markers present, shared
facts agree across both surfaces, front door stays a door (<=80 lines
proxy — the drift catches regrowth), every AGENTS.md `vant x` table
row must resolve to bin/<x>.js or a dispatcher route, stale
flat-layout mentions are regressions. Caught me twice this session
(a missing shared fact, then the flat-layout example) — working as
built.

**Verification:** surface checker 31/31, npm run lint:docs PASS (118
files), docs suite 6/6, eslint clean. Pushed.

**Next steps:** OSS-C deeper claims registry (CLI verbs vs bin/ at
scale, all MCP tools), OSS-D community-layer depth (good-first-issue
labels, triage), OSS-E the agent-contributor chapter (the white
paper's public contribution).

---

## Session (2026-09-26 — pass 63: prd-oss.md + Wave OSS-A — the surface gets a checker)

## Session (2026-09-26 — pass 63: prd-oss.md + Wave OSS-A — the surface gets a checker)

Owner scoped the OSS work: "convergence and consistency through the
frames, while backing with real endpoints." labs/prd-oss.md written
(the public layer gets the frames' discipline); Wave OSS-A executed
same session.

**The find (thesis in miniature):** AGENTS.md advertised
brain_agent_spawn/list/kill over POST /rpc — BOTH PHANTOM (zero hits
in lib/bin). But the capability was real: agent_spawn/agent_list/
agent_kill are registered _methods behind POST /mcp/exec. Docs wrong,
code right — fixed docs to the true door + real names (Option B; the
PRD's Option A story stays available). Retired in the same sweep:
wrong-repo links (dhaupin/discussions -> dhaupin/vant/discussions,
issues; one caught only by the checker), the phantom Discord invite.

**New doors:** .github/SUPPORT.md (question/bug/idea/vuln routing with
vant-shaped expectations) + .github/SECURITY.md (GitHub private
advisory reporting; advertised = defended as policy). Env vars
documented there verified against lib/config.js + lib/webhooks.js.

**The checker:** scripts/check-surface-consistency.js (npm run
lint:surface + a CI step): advertised MCP tools must be registered,
/rpc stays dead, documented env vars must be read by code, community
links point at the right repo, community doors exist. 20/20. It
proved itself on first run by catching a wrong link the manual pass
missed.

**Verification:** checker exit 0; docs.test 6/6; build-test 15/15;
workflow YAML parses; eslint clean.

**Next steps (prd-oss.md waves):** OSS-B single sources of truth
(CONTRIBUTING split, AGENTS.md/onboarding alignment), OSS-C deeper
claims registry (CLI verbs vs bin/, all MCP tools vs docs), OSS-D
community-layer depth, OSS-E the agent-contributor chapter.

---

## Session (2026-09-26 — pass 61+62: Wave E envelope versions + Wave F mesh status — the wave plan COMPLETE)

## Session (2026-09-26 — pass 61+62: Wave E envelope versions + Wave F mesh status — the wave plan COMPLETE)

Owner ruled: "this is the path we need" — labs/frame.md §5, in order:
Wave E then Wave F. Both shipped in one session; the prd-mesh wave plan
A–F is now fully SHIPPED.

**Wave E (pass 61) — envelope version stamps:**
- lib/crew-bus.js: ENVELOPE_VERSION {1,0} on every outbound envelope;
  receiver-side gate in _onWebhookEvent ordered BEFORE the scope gate
  (refuse what cannot be parsed before interpreting it). Malformed
  stamps dropped not guessed; future AND past MAJOR refused loudly with
  a crew:version:mismatch event; MINOR tolerated (additive); unstamped
  tolerated as {1,0} (the current shape IS v1.0 — pre-Wave-E senders
  flow). major 0 is malformed BY DESIGN: no v0 wire shape existed.
- The Wave-E watch-item pinned: a version claim NEVER widens acceptance
  — same-major stamp dies at the scope gate exactly like no stamp.
- _setReceiverVersion guarded seam + live ENVELOPE_V getters: the
  past-major matrix is testable for real, and what we sign vs accept
  cannot desync.
- Pins: test/crew-bus.test.js 20/20 (full matrix both directions, v0
  malformed, six malformed shapes, scope precedence, live getters).

**Wave F (pass 62) — `vant mesh status` (the Stewardship surface):**
- lib/mesh-status.js: the coordinator's one-command view — peers
  (alive/stale), agora topics + decision feed, market counts, budget
  AGGREGATES (no wallets), msg channel summaries (counts never
  content), installed buses + pending round-trips, genesis role/JV,
  wire version. bin/mesh-status.js as `vant mesh status [--json]`;
  routed + help card; JSON renders from the same report object the
  human mode prints.
- Posture enforced + pinned: READ-ONLY (before/after state identical),
  no secrets, scope owner-side (consensus.list filters scoped topics;
  market stats via the ANONYMOUS call — live-verified "1 listing,
  visible 0"; msg carries counts/ids, never content). DEGRADED NOT
  DEAD: poisoned-require test proves a broken subsystem degrades only
  its own section.
- Pins: test/mesh-status.test.js 7/7. Live-verified against real JV
  state: 6 peers w/ stale flags, the passed 4-ballot topic, decision
  "ratify", the 8-credit JV payment, scoped listing counted not shown.

**Sweep green:** agora-sync 7, agora-distributed 6, agora-hygiene 6,
agora-loop 7, consensus 8, genesis-ceremony 5, mcp-agora-sync 8,
msg-sync 9, crew-bus 20, market-debit 4, teams-refresh 6, mesh-status
7, JV exercise 8/8. eslint clean on all touched files.

**Test-harness notes worth keeping:** consensus.create is POSITIONAL —
(topic, options), not keyed; a keyed object "works" as a topic string
and fails VAF with E_VAF_TOPIC. Decision records carry WINNER (not
outcome) + percentage — read the real record before rendering it (the
first render printed '-> null').

**Next steps:** the frame's remaining gaps are all POST-wave-plan:
cross-node settlement (weights & measures — first economic leg), the
noticeboard (optional Post leg), third-org rites (standing leg). Or
the whitepaper's next chapter: the first real EXTERNAL org joining a
mesh.

---

## Session (2026-09-26 — pass 59: Wave D cross-node msg + resolvePrincipal live-fire fix + the Commons frame)

## Session (2026-09-26 — pass 59: Wave D cross-node msg + resolvePrincipal live-fire fix + the Commons frame)

prd-mesh.md Wave D executed: conversation snapshots over the wire — the
JV standup channel, both orgs reading it, with the agora trust posture
throughout. Plus the frame doc naming the environment above the agora.

**Shipped:**
- **lib/msg.js:** bounded wire snapshots (`exportSnapshot` /
  `mergeSnapshot`, kind-marked `vant-msg-snapshot`) — merge-only
  adoption (unknown ids only, in-memory wins, batch dedup, locally
  re-sorted + capped) and a scope record seam on conversations
  (`create({ scope })`, `getScope`); a wire snapshot may NEVER rewrite
  a local scope boundary in either direction.
- **lib/agora-sync.js msg legs:** `msgPull` (crew.msg.request →
  crew.msg reply, reqId-correlated, sender-bound, timeout-bounded) +
  `msgPush` (crew.msg.push) + idempotent install dispatchers. Owner-
  side scope gate on the request leg (principal resolved through
  node-registry; a non-member's null is indistinguishable from
  not-found), receiver-side gate on push, registered peers only,
  fail-closed everywhere.
- **lib/node-registry.js `resolvePrincipal(name)`** (the live-fire
  fix): a node name can carry TWO registry entries — the crew-bus
  transport self-registration (`crew_<name>`, written by listen()) and
  the genesis-vetted agent identity. The two-process leg exposed the
  joiner's owner-side gate resolving the HOST to its crew_ transport
  id (first-match name scan, order-dependent) and fail-closing every
  scoped request (8× not_found while alive, ECONNREFUSED after exit —
  invisible until the test recorded per-attempt reasons).
  resolvePrincipal makes the vetted identity win deterministically;
  the transport id is only the fallback when nothing was vetted.
- **labs/frame.md (v0.1):** the Commons frame — the environment above
  the agora named as seven commons (Ground, Bodies, Memory, Norms, the
  Agora, the Post, Workshops) + Stewardship, with the sovereignty line
  (what stays local vs what may federate) and the gap list the mesh
  experiments feed. Every lib/ file mapped; unsettled ground marked
  honestly.

**Pins:** test/msg-sync.test.js 9/9 — snapshot round-trip (bounded,
merge-only, dedup, scope recorded), junk refusal, boundary
immutability, owner-side gate (member/outsider/unscoped), sender-bound
reply (pass-51 rule on the msg legs), push gate (foreign scope,
malformed), registered-peers-only, resolvePrincipal precedence (both
insertion orders + fallback + null cases), and the two-process JV
standup over the genesis gates (host posts under JV scope → joiner
pulls through the vetted principal → joiner posts locally → host's
return pull converges BOTH orgs' messages, merge-only).

**Sweep green:** agora-sync 7, agora-distributed 6, agora-hygiene 6,
agora-loop 7, genesis-ceremony 5, teams-refresh 6, mcp-agora-sync 8,
market-debit 4, msg-sync 9, JV exercise 8/8.

**Test-harness notes worth keeping:** the two-process host loop
overwrote its result each retry — all mid-run failure reasons hid
behind the final ECONNREFUSED; it now records every attempt
(HOST_ATTEMPTS). The JOIN_GATE probe parsed JOIN_GATE: with slice(11)
(off by one — the tag is 10 chars), so the diagnostic never printed.
Comments inside the child-process template literals must not carry
backticks (SyntaxError only at spawn time).

**Next steps:** see the pass 61+62 block above (the current session).
Wave E or Wave F per owner — DONE; the frame's cross-node settlement
leg (weights & measures) remains the first economic gap before real
work orders cross boundaries.

## Session (2026-09-25 — pass 56: Wave A — agora-sync MCP surface + CLI)

prd-mesh.md Wave A executed: the mesh surface agents actually use.
All gates stay owner-side — the tools add convenience, never a trust
path (the PRD's rule).

**Shipped:**
- **MCP tools through the real mcp.execute door** (lib/mcp.js):
  `agora_vote` (peer ballot; owner runs its local gate stack and acks
  the verdict; agentId defaults to the node's principal), `agora_pull` /
  `agora_push` (state sync legs; merges re-derive status locally —
  the wire can never declare a topic passed), `agora_nodes` (mesh
  roster + self identity), `agora_sync_status` (installed buses,
  pending round-trips). Schema-gated; unconfigured-bus refusals are
  structured, never crashes.
- **agora-sync.status()** (lib/agora-sync.js): inspectable roster of
  installed buses (label, name, agentId, configured, listening, peer
  count) + pending round-trips. Read-only, no secrets.
- **CLI parity:** bin/agora.js (`vant agora vote|pull|push|nodes|status`),
  routed in bin/vant.js, help card in bin/help.js. JSON output;
  exit code reflects the operation result.

**Pins:** test/mcp-agora-sync.test.js 8/8 through mcp.execute — tool
registration, schema door (missing params rejected pre-handler),
unconfigured-bus structured refusal, agora_vote round-trip (tool →
agora-sync → owner gates → ack verdict), refusal passthrough (double
vote via owner gate; client-side validation stays local), agora_pull
round-trip with local re-derivation, agora_push, read-only surfaces.

**Sweep green:** mcp-agora 5/5, mcp-agora-sync 8/8, agora-sync 7/7,
agora-distributed 6/6, agora-loop 7/7, consensus 8/8, crew-bus 13/13,
mcp (full) 0F. eslint 0 errors.

**Next steps:** Wave B — genesis ceremony (`vant genesis
create|boot|join`), then the real 2-node live-fire through these tools
(prd-mesh §5).

---

## Session (2026-09-25 — pass 55: prd-mesh generalized for public eyes; Wave A next)

Owner: "we are an open source project — reword prd-mesh to be more
generalist (the pub will see this). Example-shop style wording; Buffy
and its org can stay, clarified as the host."

**Shipped:** labs/prd-mesh.md → **v1.1 (public)**:
- Retitled "The Vant Mesh — Federating Multiple Installs"; the Creadev
  deployment is now a clearly-labeled WORKED EXAMPLE with a host note
  ("you are reading this in the vant repo; replace the labels with your
  projects")
- New generalist sections: "Adopting the pattern (any shop)" recipe and
  N-install framing ("the host runs four; the design is N")
- Owner decisions reframed as host-org-approved design decisions;
  wave plan, security notes, files, success criteria unchanged in
  substance ("Ops HQ" → "coordination node" throughout)
- All backlog placements + the 3 open decisions + the acceptance
  harness preserved

**Next steps:** Wave A — agora-sync MCP surface (agora_vote/pull/push/
nodes/sync_status through the real mcp.execute door, pins in
test/mcp-agora-sync.test.js, optional CLI parity).

---

## Session (2026-09-25 — pass 53: teams refresh seam + brain-resolution isolation)

Closes the gap the pass-52 two-org JV exercise recorded: teams.js
hydrated its org model ONCE via an async IIFE at module init, so a
long-lived node could never see org-model writes made by another process
after its boot — receiving-side scope gates were boot-race-dependent.

**Shipped:**
- **teams.js refresh seam:** `_hydrateTeams` (merge-only rehydrate:
  unknown ids adopted, in-memory wins on conflict — the consensus
  hydrate rule), `refresh()` (throttled 2s, `force` bypass),
  `_refreshSync` (SYNCHRONOUS variant — scope gates are sync, so the
  miss path must re-read without an await), `_resetHydration` (test/ops
  reset; also clears the throttle window). All exported.
- **scope.js stale-view rescue:** `resolveMembers` misses → ONE throttled
  `_refreshSync` → single retry. Fail-closed preserved: merge-only means
  the refresh can never fabricate members (adopts only what the shared
  store actually contains); an entity that exists nowhere is denied
  before AND after the refresh. Throttle bounds disk reads on adversarial
  miss floods.
- **Brain-resolution isolation (teams + escrow):** store paths now
  resolve through `state-store.currentBrain()` (VANT_BRAIN env >
  currentBrain) — the SAME seam consensus/market/trust use. Previously a
  bare `getCurrentBrain()` ignored VANT_BRAIN, split-braining an
  env-scoped process: protocol state in one brain, org model + budgets
  in another.

**Pins:** test/teams-refresh.test.js 6/6 — seam exists + merge rehydrate
rebuilds a wiped view, stale-view rescue (a write made "after boot" is
adopted), throttle + force bypass, the GATE-LEVEL miss→refresh→retry hit
(with ghost entities still denied), merge-only conflict rule (disk never
overwrites local), VANT_BRAIN routes teams.json AND escrow.json to the
same brain.

**Re-validation:** two-org JV exercise 8/8 phases, 0 GAPS — scoped
decision delivery is now correct BY DESIGN (the partner's stale view is
rescued on scope-miss; previously correct only by luck of hydration
timing).

**Sweep green:** teams (all), scope 9/9, agora-loop 7/7, agora-sync 7/7,
agora-distributed 6/6, consensus 8/8, crew-bus 13/13, market 22/22,
forum-persist 4/4, state-persistence 8/8.

**Next steps:** org-model sync leg (full replication — optional now that
the rescue covers the common case), agora-sync MCP surface, synced-
ledger TTL/reaper, gossip pull scheduler.

---

## Session (2026-09-25 — pass 52: two-org joint venture, the federation stress test)

Owner brief: "run vant as an agent, with your org, depts, teams, agents,
and have another agent run his own stack — two orgs coming together to
work on a project, hashing out plans, then executing. See what happens."

**The exercise** (labs/node-crew/exercise-two-orgs.js): TWO REAL vant
stacks — host org Nova Crew (nova-lead/nova-eng) and partner org Buffy
Labs (buffy-lead/buffy-eng) — form a joint venture live:
1. independent boots + genesis handshake over the HMAC bus
2. host forms the JV org model (org > dept > team, ALL FOUR agents from
   BOTH orgs assigned)
3. host proposes the plan via forum.vote under JV team scope; host crew
   votes locally
4. partner crew votes REMOTELY via agora-sync.vote — the owner-side gate
   stack (scope resolved where the model lives + registry vetting) admits
   both partner ballots over the signed wire (the acks show quorum at 3
   ballots, passed at 4)
5. ONE joint ledger: 4 ballots from 2 orgs, PASSED
6. decision broadcasts cross the boundary (scoped + plain notice)
7. execution economics: scoped listing published on the wire, partner
   payment settles into the budget ledger (8 credits)
8. cold third process: the JV ledger (4 votes, passed) + the payment
   survive every process exit

**Result: 8/8 phases ×2 consecutive runs, 1 gap recorded.**

**THE GAP (federation backlog, the exercise's real product):**
teams.js hydrates its org model ONCE via an async IIFE at module init —
no re-hydration seam (consensus/msg both expose _resetHydration; teams
does not). Cross-node scope consistency on RECEIVING-side envelope gates
is therefore boot-race-dependent: a node that hydrates BEFORE a partner
writes new org data is permanently stale (fail-closed — real members get
denied forever); a late hydrator sees it. The pass-50 owner-side design
is what makes VOTING immune (the owner resolves scope LIVE where the
model lives), but delivery-side gates resolve locally. Fix candidates:
a teams refresh seam (_resetHydration + rehydrate on scope-miss), or an
org-model sync leg over the bus.

**Architecture lesson worth keeping:** the JV vote worked WITHOUT any
org-model replication — the pass-50 rule "scope resolves where the team
registry lives" carried the whole cross-org decision. The remaining work
is delivery-side visibility + org-model distribution, not a new vote
mechanism.

**Next steps:** teams refresh seam (smallest, closes the gap), org-model
sync leg, agora-sync MCP surface, synced-ledger TTL/reaper, gossip pull
scheduler.

---

## Session (2026-09-25 — pass 51: PRD refresh + live-fire round 3, 2 wire-adversary bugs fixed)

Owner brief: refresh the stale PRDs, then hunt gaps/edges/bugs in the
pass 48-50 work. Both halves landed.

**PRD refresh:** labs/prd-agora.md → v1.2 (Wave 8 federation wave,
passes 47-51, new success criterion 5); labs/prd-vant-os.md → v1.3
(next-wave shortlist ALL THREE marked SHIPPED with pass references,
candidate follow-ons listed).

**Live-fire findings (fixed + pinned):**
1. **Merge scope-filter (ballot injection):** the envelope VOTE path
   gated scope (pass 50), but the SYNC path did not — a registered peer
   could `state.push` a scoped snapshot with its own pre-stuffed
   non-member ballot and the owner would tally it. mergeTopic now
   filters every adopted/born ballot through the owner's own
   scope.resolveMembers; an unresolvable scope rejects the merge
   (fail-closed, no partial state). BOTH merge branches (adopt + wire-born).
2. **Sender-bound reply legs (reqId spoofing):** agora-sync's vote.ack
   and crew.state dispatchers resolved any pending reqId regardless of
   sender — a hostile registered peer that observed a reqId could forge
   a "vote accepted" verdict or feed the merge path a ledger of its
   choosing. Pending entries now carry the addressed node; replies from
   any other origin are dropped (legit replies unaffected).
3. **Edge probes (clean, no bugs):** escrow debit — zero-price costs the
   default 1 (mirrors _checkBudget), a consumed listing cannot
   double-debit ("sold out" refusal, spent unchanged), barter stays
   free.

**Live wire demo v0.3** (labs/node-crew/demo-v03-agora-wire.js): the
pass-50 promised probe, TWO REAL node processes — owner builds team +
scope + topic owner-side; peer casts a REMOTE ballot via agora-sync.vote
over the signed bus; the owner's FULL gate stack runs (scope where the
team lives, registry vetting, one vote); the ack carries the live tally
(2 votes, passed); a cold third process tallies the persisted state.
4/4 phases ×3 consecutive runs. Harness notes inherited from v0.2:
network allowlist takes HOSTNAMES ('127.0.0.1'); configure() agentId on
BOTH nodes (the peer's principal must be a team member owner-side);
owner stays up ~9s for the ballot + ack; peer staggers past owner setup.

**Pins:** test/agora-sync.test.js 7/7 (+2 live-fire: scope-filter,
sender-binding — forged ack/ledger-replay resolves nothing, legit
traffic unaffected). Sweep green: agora-distributed 6/6, agora-loop 7/7,
consensus 8/8, crew-bus 13/13, market 22/22, market-debit 4/4,
mcp-agora 5/5, forum-decisions-persistence 4/4, scope 9/9, escrow 0F.
eslint 0 errors (6 pre-existing consensus warnings untouched).

**Next steps:** all three next-wave candidates SHIPPED. Candidate
follow-ons from the hunt: agora-sync MCP surface (vote/pull/push as
tools), synced-ledger TTL/reaper, gossip-style pull scheduler. Or
whatever the owner wants next.

---

## Session (2026-09-25 — pass 49: cross-machine state sync SHIPPED)

Next-wave candidate 2 from the vant-os PRD shortlist. Shipped as a
PULL/PUSH seam, not replication — state stays per-node; the bus carries
snapshots on demand.

**Shipped:**
- lib/agora-sync.js: `pull(bus, node, topic)` (crew.state.request →
  crew.state reply, reqId-correlated, timeout-bounded) + `push(bus,
  node, topic)` (crew.state.push — the RETURN leg after voting on a
  synced topic, so the owner's tally counts crew ballots) + `install(bus)`
  (idempotent dispatchers; owner answers REGISTERED peers only — an
  unknown origin gets no state oracle, signed or not; reply even when
  null so askers stop retrying).
- consensus `exportTopic`/`mergeTopic`: merge adopts only UNKNOWN
  agents' ballots (local votes never overwritten), stamps `syncedFrom`
  provenance, sanitizes wire fields (quorum clamped, deadline bounded,
  vote shapes validated), and RE-DERIVES status/outcomes/hash via
  tally() — THE WIRE CAN NEVER DECLARE A TOPIC PASSED.
- Scope rides the payload: crew-bus's pass-40 fail-closed gate keeps
  scoped topics invisible to non-members on BOTH legs. HMAC envelope
  auth + webhook inbound gate inherited (pass 42). No new crypto.

**Live 2-process probe (separate brain dirs, separate processes):**
owner creates p49-demo + votes (1, open) → peer PULLS (merged, adopted 1,
created) → peer votes (2, passed locally) → peer PUSHES → owner adopts
the vote, its own tally derives PASSED (votes=2). Peer ledger persisted
on its own disk. Probe quirks worth remembering: network allowlist takes
'127.0.0.1' (demo-v02 note), vote agents need node-registry registration
(requireRegistry), and peer actions must stagger past owner setup or
the pull legitimately gets a null reply.

**Pins:** test/agora-sync.test.js 5/5 — wire-cannot-declare-passed,
adopt-only-unknown (local vote NEVER overwritten), fail-closed merge
validation (bad topic/malformed scope/null), export→merge→quorum
round-trip, install-idempotent + stub-bus pull/push logic.
Sweep: consensus 8/8, agora 7/7, live-fire 26/26, mcp-agora 5/5,
market-debit 4/4.

**Next steps:** candidate 3 (distributed agora — cross-node scope
enforcement + remote vote verification; the sync seam is its substrate)
or whatever the owner wants next.

---

## Session (2026-09-25 — pass 48: escrow debit-on-trade SHIPPED)

Next-wave candidate 1 from the vant-os PRD shortlist, owner-approved order.

**FINDING (fixed, pinned):** market trades "paid" nothing. The trade path
held budget (escrow.hold — a condition entry) and released it (delete the
entry) — no budget ever moved. Credit was reserved, never spent: an agent
with budget 1000 could buy forever.

**Fix (lib/market.js trade settle point):** after ALL gates pass, debit
the buyer via escrow.recordSpend:
- numeric price → debit that amount (missing/zero price costs the default
  1, mirroring _checkBudget's normalization); barter strings stay free
- debit REFUSAL (e.g. escrow runaway guard) → unwind BEFORE settlement:
  atomic reservation rolled back + hold released, structured error
  (code E_RUNAWAY surfaced), listing not consumed
- trade.debit records the settlement { agent, amount } (null for barter)

**Wiring note:** market's _getEscrow returns the MODULE (whose exported
recordSpend was removed in a dead-export sweep); the debit builds a fresh
persisted Escrow() per trade — budgets load from orgchart/escrow.json so
the debit lands on the real budget.

**Pins:** test/market-debit.test.js 4/4 — debit+persist, barter-free,
insufficient-budget refusal (no supply consumed), unwind-on-refusal.
Test arithmetic note: the runaway hammer's 31st recordSpend is ITSELF
refused by the 30/min guard, so recorded spend is 30, not 31.
Sweep: market 22/22, agora 7/7, live-fire 26/26.

**Next steps:** candidate 2 (cross-machine state sync — stale-peer
voting hazard, biggest design space) or candidate 3 (distributed agora,
depends on 2).

---

## Session (2026-09-25 — passes 45-47: naming, agora MCP surface, PRD closeout)

Owner's 4-step plan executed in order. All work PUSHED to origin/axolotl.

**Pass 45 — the second "trifecta" retired.** The agora rename (pass 40)
retired "trifecta" for the loop, but the term ALSO named the combined
MCP+API server mode (`vant all`). Live-tree mentions swept to "all mode"
(help cards, comments, docs/operations/testing.md); historical records
(CHANGELOG/QC_WAVE/TASKS/PRD retirement note) keep original wording.
Sweep green: agora 7/7, vant 16/16, live-fire 26/26.

**Pass 46 — agora MCP surface.** Inventory found 272→275 tools, market
richly surfaced (8 tools), forum 4 tools, consensus ZERO. Worse: the 4
forum_* tools were mis-wired to the pre-agora API — forum_vote passed
(forumId, userId, topic, vote) into vote(proposal, options), so an MCP
"up vote" silently CREATED a consensus vote titled by the forumId;
enter/message/status ignored inputs the same way. No test covered them.
Fix: re-wired all 4 to the real agora signatures, added forum_castVote,
added consensus_create/vote/tally/get/list (scope-aware, schema-gated).
Pinned test/mcp-agora.test.js 5/5 through the REAL mcp.execute door
(rules → schema → handler): tool registration, real-ledger forum_vote,
castVote/consensus_vote round-trip + double-vote refusal, tally/get/list,
schema-door rejections. Test note: with minQuorum=2 the topic PASSES on
the second vote, so the double-vote refusal comes from the closed-topic
gate (before the hasVoted gate) — assert ANY error + no tally, not the
gate name.

**Pass 47 — PRD closeout.** prd-agora.md v1.1: status SHIPPED (Waves 5-6
+ hardening 42-46), Wave 7 section, files list extended. prd-vant-os.md
v1.2: forensics table corrected (encounter/spirit/realm are DELETED rows;
forum now LIVE/agora-wired), out-of-scope items resolved-annotated, new
"Next Wave — candidates" section: (1) escrow debit-on-trade, (2)
cross-machine state sync, (3) distributed agora — recommended in that
order (each is a dependency of the next); owner to confirm sequencing.
Docs style+links PASS (118 files).

**Parked (owner-aware):** rls audit — test/test-rls.js core tests are
skipped ("needs habitat init first") and rls.js fails open without a
habitat; also the rls/habitat (tenant-facing) vs scope.js (agent-facing)
delineation deserves a deliberate decision.

**Next steps:** owner picks the next-wave candidate (escrow debit-on-
trade recommended first), or anything else.

---

## Session (2026-09-25 — pass 44: forum decision log made durable)

Live-fire round 2 wrap-up of the agora loop's restart gaps, following the
pass-43 metadata stamp.

**FINDING (fixed, live-verified):**

2. **Forum decision feed was memory-only:** consensus keeps the vote
   outcome in its ledger, but forum's own decision records — the feed an
   agent reads to learn "we decided X because of Y" — evaporated on
   restart. (Discovered while re-probing the pass-43 chain: the ledger
   side survived; the forum side didn't.)

   **Fix (lib/forum.js):** decision records write through to
   `state/forum.json` via state-store (pass-38 pattern, per-brain,
   kind-marked, atomic), hydrated at module load BEFORE any vote can
   resolve. FIFO-capped at 200 (working memory, not an archive).
   `clearState()` seam added (consensus/market parity).

   **Verified:** pin test 4/4 (persist, hydrate-on-restart, FIFO cap,
   clearState) + real-process chain in /tmp/vant-live-r2: decision made
   in process B, hydrated in process C from state/forum.json.

**Also verified (no change):** market already persists listings/trades
(pass 38) — the loop's three legs (forum/consensus/market) are all
restart-durable now.

**Test-harness notes worth keeping:** evict forum+event TOGETHER when
simulating restarts via require cache (forum-only eviction leaks the old
singleton's vote:consensus listener and double-counts decisions);
consensus.create is lock-wrapped and returns a PROMISE — always await it.

**Next steps:** round-2 fully closed. Candidates for next session: the
"decider" word (owner-naming), pushing the axolotl branch, MCP surface
for the agora loop (crew.forum/market/decision already have envelopes),
or the vant-os PRD's next wave.

---

## Session (2026-09-25 — pass 43: agora decision path survives restart)

Continuation of live-fire round 2, back on the pass-40 agora loop. A probe
of forum → market → consensus across a REAL process restart exposed the
last memory-only seam in the loop's return path.

**FINDING (fixed, live-verified):**

1. **Forum decision return path was amnesiac across restart:** the
   vote:consensus handler reads forum's in-memory `_openVotes` map for the
   proposal/author of a decided topic. Fresh process ⇒ empty map ⇒ decision
   recorded `{ proposal: null, author: null }` even though consensus's
   ledger (scope, votes, status) all persisted via state-store. Live-probed:
   vote created in process A (2/3 votes), third vote in process B completes
   quorum — decision lost its context.

   **Fix (lib/forum.js):** `forum.vote` now stamps
   `{ proposal, author, viaForum }` into the PERSISTED consensus ledger
   `metadata` (consensus.create already stored + persisted metadata; it was
   never populated). The vote:consensus handler, when `_openVotes` misses,
   falls back to `consensus.get(topic).metadata` (only when `viaForum` —
   foreign ledgers keep proposal/author null). Thread record stays the
   fast path; ledger is the durable fallback.

   **Verified:** /tmp/p43-probe.js 3-phase restart probe →
   `PASS: proposal/author recovered from persisted metadata`. Pins green:
   agora-loop 7/7, consensus 8/8, forum 23/23, scope 9/9.

**Next steps:** round-2 wrap-up (learnings + push) or keep probing:
market metadata stamping for the knowledge-trade leg of the loop, and a
forum `decisions` persistence story (records exist only in process memory
+ brain saves; a restart drops the forum's own decision log, though the
consensus ledger retains the full outcome).

---

## Session (2026-09-25 — pass 42: LIVE-FIRE ROUND 2, 6 fixed + 2 by-design)

Round 2 of "run vant for real, find bugs/vulns" on a fresh sandbox
(/tmp/vant-live-r2 @ bf0edb1), targeting the pass-41 follow-ups: the dead
auth-bearing MCP start(), VANT_MCP_REQUIRE_KEY not wired to the live
server, and the crew transport's fail-open HMAC discovered while probing
it. Same method: adversarial probes (scripts/_r2_*.js, gitignored), fixes
in the real tree, pins in the regression suite.

**What survived round 2 (worth recording):** crew-bus envelope signing and
dispatch over real 2-process HTTP (forge/replay/stale/tamper all refused
post-fix); consensus double-vote + vote-after-close refusals confirmed
again; market trade of a missing listing refused cleanly; brain read/
write chains unbroken by the transport hardening.

**FINDINGS (fixed + pinned; pins extend test/live-fire-regressions.test.js to 26):**

1. **webhooks.verifySignature FAIL-OPEN (critical):** `if (!signature ||
   !secret) return true` meant ANY route with a configured secret still
   accepted an unsigned request — an attacker who can reach the port forges
   crew envelopes wholesale (live-repro'd: unsigned dispatch 200 with the
   secret configured). Fix: fail-closed; secretless routes were already
   refused at register() so the belt never breaks a real flow.
2. **No replay/freshness defense on the webhook route:** signed bytes
   could be banked and replayed forever (probe-verified identical envelope
   dispatched twice). Fix: _replayCheck — per-route signature-hex dedupe
   (REPLAY_SEEN_MAX 5000, drop-oldest-half) + 5-minute freshness window
   on body.ts (ABS age, so banked future-ts envelopes die too). Duplicate
   => 409, stale => 401. Wired after verifySignature in the POST handler.
3. **Webhook server bound ALL interfaces:** startServer listen(port) with
   no host advertised HMAC-authenticated endpoints to the LAN. Fix:
   loopback default, VANT_WEBHOOK_BIND is the explicit opt-out (mirrors
   pass-41's MCP bind fix). ss-verified: 127.0.0.1, no wildcard.
4. **config env dead code (getFlag null-vs-undefined class):**
   mcpRequireKey() checked `getFlag('mcp.requireKey') !== undefined` but
   getFlag returns NULL for unset — the check was always true, so
   VANT_MCP_REQUIRE_KEY could never apply. Fix: `!== null && !==
   undefined`. Audit note: same bare-comparison pattern should be assumed
   hostile anywhere getFlag/getFlag-like accessors are used.
5. **MCP dead start() removed + REQUIRE_KEY gate wired into the live
   server (V5):** the auth-bearing start() at :2533 was unreachable
   (shadowed by module.exports.start — the unauthenticated arrow server),
   so VANT_MCP_REQUIRE_KEY guarded nothing. Fix: deleted the dead server
   + its consts; the LIVE module.exports.start gained the mcpRequireKey()
   gate on POST /mcp/exec (x-api-key or Bearer; 401 + mcp:auth:failed
   emit; no key configured = allow, local companion posture), restored
   GET /tools + /health aliases the docs reference, and captured _server
   so stop() stops the live server. Spliced via scripts/_r2_fix_mcp.js
   (file >3.9k lines, str_replace can't reach).
   **V5 follow-up bug found by the live probe:** the gate's
   `new (require('./auth'))()` threw — auth exports { Auth, ... }, not a
   constructor — so every gated POST hung with an Unhandled Rejection.
   Fixed to `require('./auth').Auth` (scripts/_r2_fix_auth_ctor.js).
   Lesson: a gate that throws is worse than no gate; the probe caught it
   only because the POST was live-repro'd, not unit-called.
6. **crew-bus secretless nodes refused:** configure() now throws coded
   VantError on missing/empty secret — outbound HMAC already required one,
   but a listening node without a secret was zero-transport-auth.
   Outbound-only nodes may omit it (documented in the error text).

**By-design (documented + pinned, not changed):**
- market.list is CREATE-a-listing (pass-38 governance consent gate:
  refuses without consentGiven — a fresh-cwd probe misread this as a
  browse-bug). MCP market_list exposes context.consentGiven. Pinned so
  the gate can't silently regress.
- msg participant scale: addParticipant was fully unbounded AND persisted
  every add. Capped at 1000 (matching the maxMessages ceiling) + id
  validation (1-200 chars, coded errors); re-adds stay idempotent and
  never trip the cap.

**Verification:** live-fire regressions 26/26 (15 pass-41 + 11 pass-42:
fail-closed HMAC matrix, replay 409/stale 401, real-HTTP forge/tamper/
replay refusals + legit dispatch, loopback bind via ss, crew secretless
throw, config null fall-through, msg cap, market consent gate, MCP
REQUIRE_KEY 401/401/200/Bearer/tools/health/rebind-403 over real HTTP);
webhooks 11/11, crew-bus 13/13, node-crew 9/9, demo-v02 4/4,
test-webhooks 7/7; runner 37/37; FULL sweep 117/117 by exit code (run
via a+b+c chunk + per-suite — run-all itself exceeded the harness's
175s terminal cap this session; every suite passed individually);
npm run check OK; eslint clean for touched files.

**Follow-ups queued (deliberate non-goals):** non-loopback MCP/crew auth
story for real multi-host deployments (VANT_MCP_BIND + REQUIRE_KEY exist;
a token scheme does not); mcp.js split (now ~3.98k lines, one dead server
removed); brain.read() category asymmetry (documented pass-41); AGENTS.md
advertises /rpc + brain_agent_spawn MCP tools that don't exist in code
(phantom docs — either implement or fix the docs); webhook freshness
depends on sender clock sanity (abs-window; consider max-age-only).

---

## Session (2026-09-25 — pass 41: LIVE-FIRE exercise, 7 real finds)

User: "let's actually run vant, try out all the stuff, see what bugs/vulns
we can find." Method: copied the repo to /tmp/vant-live (real tree
pristine), booted it fresh (start/health/setup), then exercised the agora
loop, crew demo v0.2, trust/quarantine, msg, teams, brain writes, and the
MCP server over real HTTP — with adversarial inputs throughout. Probes
lived in /tmp + scripts/_*.js (gitignored); findings were fixed in the
REAL tree and pinned by a new suite.

**What survived live exercise (worth recording):** boot/migrate/health
clean; agora loop (scoped thread -> scoped vote -> decision return) works
end to end with correct arg orders; market scope gates (search/get/trade)
hold; crew demo v0.2 four phases green; brain read traversal blocked;
brain_write MCP traversal blocked at the storage layer; msg channel ids
are not path components (single state file); scope parseOwner rejects
hostile owners; teams reject hostile agents; consensus VAF/rate/deposit
chains all fire.

**FINDINGS (all fixed + pinned in test/live-fire-regressions.test.js, 15/15):**

1. **Consensus quorum units bug (behavioral, found only live):** minQuorum
   is a HEADCOUNT but the pass-38 default path compared it against
   trust-WEIGHTED totals (fresh agent = 0.5), so a unanimous 2-voter team
   could never reach quorum 2 (needed 4+ voters) — silently, with status
   stuck at 'quorum'. Every existing test dodged it by pinning
   useTrustWeight:false; agora-loop pinned the opt-out, not the default.
   Fix: quorum counts totalVotes (per-head participation); threshold stays
   trust-weighted (majority). quorumNeeded now a count. percentages are
   unweighted share (weighted view lives in weightedPercentages as before).
2. **Tally checksum != hash:** in the passed branch the second _hashTally
   call ran AFTER results.hash was stamped, so the extra key changed the
   JSON.stringify whitelist input and checksum could never equal hash.
   Fix: hash once, derive both.
3. **Quarantine gate missing where it matters (exploit chain, live-repro'd):**
   pass 40 claimed "registry now quarantine-gates on trust" but the gate
   landed only in lib/registry.js (module registry); node-registry.js —
   the PEER registry consensus requireRegistry anchors on — accepted a
   quarantined agent as alive AND COUNTED THEIR VOTE. Chain:
   quarantine -> node-registry.register -> vote on requireRegistry ledger
   -> accepted. Fix at both layers: register() refuses quarantined ids
   (E_QUARANTINED) and _voteInternal denies quarantine at decision time
   (a peer registered before turning bad stays 'alive' via heartbeats).
4. **MCP exec server: unauthenticated brain/tool HTTP API on *:3457 with
   CORS '*':** live probes: ss showed *:3457; any LAN device could read
   the brain and execute tools; worse, the exec route ignored
   Content-Type, so a cross-site text/plain fetch skips CORS preflight
   entirely (drive-by writes from any website); no Host check either
   (DNS-rebinding). Also: config's mcpBindAddress() (default 127.0.0.1)
   was never honored, and the auth-bearing start() at :2533 is dead code —
   module.exports shadows it with the unauthenticated arrow server.
   Fix (proportional, zero-config): honor VANT_MCP_BIND (loopback default)
   + three gates on the exec route — Host-header loopback match (rebinding),
   Content-Type application/json required on POST (forces preflight),
   Origin refused when non-loopback. Legit localhost MCP clients unchanged
   (crew-bus deliveries send application/json — verified). Remaining
   posture notes: the auth start() is still dead code; VANT_MCP_REQUIRE_KEY
   only guards the OTHER server. LAN/remote MCP clients need VANT_MCP_BIND
   + a real auth story (follow-up, deliberate non-goal today).
5. **brain.writeTo born broken:** called storage.set(), which exists on
   StateStorage only — BrainStorage has get/write — so EVERY call threw
   'storage.set is not a function'. Introduced in the multibrain commit,
   zero callers (why nothing noticed), but it advertised a working API.
   Fix: validate {name,type}/key (coded VantErrors), delegate to
   format.saveFile with the resolved brain root (flat-in-brain layout,
   the one brain.read() can read back), ext-appended. Round-trips strings
   and objects; hostile input throws coded.
6. **format.serialize silently ate primitives:** `if (!data || typeof
   data !== 'object') return ''` meant every STRING input serialized to
   '' — saveFile wrote EMPTY files and reported { success: true }. Silent
   data loss for any string-body caller of the format layer. Fix: strings
   pass through; numbers/booleans/null stringify.
7. **market.getStackMarketStats permanently broken (bare-ref class #5):**
   called bare `stats()` — no such module-scope identifier — every brain
   returned { error: 'stats is not defined' } swallowed by try/catch.
   Same class as error.js (pass 22) and agents emit() (pass 32). Fix:
   getMarket().stats(). Bonus hardening in the same function family:
   market.stats() leaked SCOPED listing ids through the byType/byTags
   indexes to any caller — stats now filters by canAccess (anonymous
   callers get counts-only; members pass agentId).
8. **crew-bus scope gate failed OPEN on missing scope module:** if
   require('./scope') threw, a scoped envelope fell through to dispatch.
   Now fail-closed (drop + warn). Same TRUST note: consensus also gained
   the belt-and-suspenders quarantine check (see 3).

**Verification:** live-fire regressions 15/15 (quorum headcount, checksum,
both quarantine gates, writeTo string+object round-trip + coded errors,
format.serialize primitives, MCP bind + three hostile-request refusals +
legit-client pass, stats leak, stack-stats); agora-loop 7/7; crew demo
v0.2 4/4; FULL sweep 117/117 suites by exit code; runner 37/37;
build-test 15/15. No boot-svg churn this pass.

**Follow-ups queued (deliberate non-goals):** dead auth-bearing start()
vs shadowing exports (pick one server, wire VANT_MCP_REQUIRE_KEY through
the live one); MCP auth story for non-loopback binds; brain.read() has no
category paths (write categorizes via brain.write, read is flat-only —
asymmetry documented, not changed); msg.create accepts 500-participant
convos without cap; lib/mcp.js is 4,000+ lines and now carries two HTTP
servers (split candidate).

---

## Session (2026-09-24 — pass 40: agora + retirements, prd-agora)

Waves 5+6 in one pass per labs/prd-agora.md (owner-locked dispositions:
realm DELETE — concept becomes scope; encounter DELETE — discovery lives in
node-registry + crew-bus; spirit FOLD into trust then DELETE). Prior agent
crashed mid-reasoning with the wave fully coded; this pass verified,
finished, and committed it.

**Wave 5 — agora foundation:**
- lib/scope.js (NEW): the agora membership rule. normalize/parseOwner/
  isValid/resolveMembers/canAccess/assertOwner, backed by teams.js (the
  ONE org model). Fail-closed: unknown org/dept/team/agent => DENY, never
  empty-allow; missing/legacy scope => public/unscoped (lenient read);
  malformed scope on create => reject. No hierarchy leak (team scope does
  not leak to the org).
- consensus: optional scope on create (rejects malformed), persisted with
  the ledger (state-store write-through, so the privacy boundary survives
  restarts), enforced in _voteInternal (non-members denied).
- market: scope on list/trade/search — scoped listings invisible to
  outsiders, tradable by members; malformed scope rejected; public
  listings unchanged.
- forum: publish/message carry scope; forum.castVote SWAPPED-ARG FIX
  (was vote(voteId, name, choice) — voter name recorded as OUTCOME, choice
  as AGENT; now aligned with consensus's vote(topic, outcome, agentId));
  vote ledger shape aligned with the real consensus.create contract.
- Decision return path (the wire that never existed): vote:consensus
  event -> forum records the decision back in the originating thread.
- crew-bus: agora envelope types crew.forum/crew.market/crew.decision;
  inbound scope gate — a scoped payload not passing canAccess for THIS
  node is dropped (scoped means unseen); configure({ agentId }) links a
  node to its principal; without an agentId scoped payloads are
  invisible (fail-closed).

**Wave 6 — retirements:**
- DELETED: lib/realm.js (781 lines — the second voting state machine with
  its own swapped-arg consensus seam dies with it), lib/encounter.js,
  lib/spirit.js, bin/encounter.js, bin/spirit.js, their test suites.
- spirit's quarantine/verify moved into trust (persisted via the Wave 2
  state-store) — registry now quarantine-gates on trust, same logic in
  the live system.
- Seams swept: transform gather/restore (realm + encounter entries gone),
  registry, mcp (encounter/forum tools), bin/vant.js, bin/help.js,
  bin/horcrux.js, docs/reference/cli.md. Zero live refs (grep-verified).
- test/no-legacy-bloat.test.js extended: realm/encounter/spirit stay
  deleted; errors.Error alias stays gone.

**Runner fix (pre-existing drift, found by the sweep):** test/runner.js
still pinned `errors.Error: 1` — the alias was removed in pass 26 and
no-legacy-bloat pins its ABSENCE, so the runner lib-pin failed. Repinned
to VantError; runner back to 37/37.

**Verification:** scope 9/9, agora-loop 7/7 (two-process loop: scoped
thread -> scoped vote -> decision back in thread; market scope gates;
crew-bus member-delivered/non-member-dropped). Sweep 116/116 suites;
ci 414/0/2; runner 37/37. Boot-horcrux svg churn from suite runs is
stego re-randomization, restored before commit.

---

## Session (2026-09-23 — docs accuracy/format/consistency pass)

Round 6 on docs. Plan: S0 script hygiene, P1 accuracy, P2 format,
P3 consistency, P4 verify, P5 handoff. All done, battery green.

**S0:** Purged 26 untracked one-off `_fix_*.js`/`_qc_*.js` scratch
scripts from scripts/ (fixes already applied in earlier rounds). Added
`scripts/.gitignore` (`*` + `!.gitignore`) so scratch never lands in
`git status` again; the two committed checkers stay tracked.

**P1 accuracy (docs vs bin/ dispatcher, verified per command):**
- reference/cli.md Internal section: removed phantom `vant test-all`,
  `vant test-core`, `vant build-test`, `vant cli-standard`,
  `vant format-test`, `vant agent-spawner` (none in COMMANDS dispatch;
  real names are `vant test smoke|core|full` and `vant spawn`). Kept
  bin/-direct invocations for build-test/sweep/runner with a note.
- reference/cli.md: dropped `vant notify` row + examples (no backing
  bin/lib) and `vant linear` row + examples (linear is a lazy island,
  not a CLI; integrations/linear.md already shows the real JS API).
- integrations/docker.md + operations/deployment.md: `vant serve` ->
  `vant server` (only bin/server.js exists).
- essential/plugins.md: replaced invented CLI (`vant use`,
  `vant plugins`, `vant add`) with the real registration flow
  (`vant.use(plugin)` exists in lib/vant.js; `vant islands list` is
  the real lister).
- integrations/agent-skills.md: dropped phantom `vant init` row.
- multi-agent/coordination.md: `vant checkout` -> `vant branch create`
  (no checkout dispatcher; branch-manager has create).

**P3 consistency:**
- MCP port split resolved at the CODE side: bin/mcp.js hardcoded 3100
  while lib/mcp.js + lib/config.js default 3457 (and runtime/mcp.md
  already documented 3457). Fixed bin/mcp.js to 3457, then swept the
  nine docs files still saying 3100 (rest-api, api, config, cli,
  mcp-tools, docker, deployment, security/environment, frontend).
  Note: previous round's TASKS entry claimed 3100->3457 was done;
  it had only covered the lander + runtime/mcp.md. Zero 3100 refs now.
- docker/deployment example versions 0.8.11 -> 0.8.6 (pinned reality).
- advanced/release.md: repaired broken pipe table, fixed inverted
  patch example (0.8.6 -> 0.8.5 became -> 0.8.7), aligned docker tag
  examples, fixed releases URL (dhaupin/releases -> dhaupin/vant/releases).
- runtime/runtime.md: removed forward-dated "v0.8.7+ New Features" and
  "New in v0.8.7" claims (0.8.7 is unreleased; features are current).
- Legacy flat brain paths swept: models/private/<file>.md ->
  models/private/vant/<file>.md in essential/onboard.md,
  advanced/audit.md; telegram-bot.md now uses brain.read('goals')
  instead of require()ing markdown; coordination.md example writes to
  the agent's own brain dir.

**P4 verify:** check-docs-links PASS (119), check-docs-style PASS
(119), test/docs.test.js 6/6, test-core core 6/6, full suite 108/108.

**P5 handoff:** this block, buffy learnings, MEM.md reset.

---

## Session (2026-09-23 — docs + lander restructure, 5 commits)

User rulings (locked in labs/prd-brand.md): memory-first positioning,
agentic runtime second; backronym kept LEGALLY ONLY, removed from all
public surfaces; audience = humans + agents + agents-running-agents.
Voice: no em dashes, no emoji, no cliche AI rhetoric, every command in
a tagged fence with an explainer. Two PRDs written first (prd-brand,
prd-content) then S1-S12 executed across 5 commits:

**New IA** (docs/): / memory/ (NEW, center of gravity: index, brain,
memory-store, search, citations, horcrux, horcrux-bootstrap, stego,
geometry, prune) > runtime/ (runtime, mcp, server + index) >
multi-agent/ (brains NEW, branches, succession, agents + index) >
getting-started (+ agent-onboarding NEW, the agent-executable
wake/work/sleep loop with MCP equivalents) > operations/security/
integrations/reference/advanced. nav_order bands stepped by 10.

**Key moves (git mv, history preserved):** succession/branch/multi-agent
-> multi-agent/, runtime -> runtime/, mcp -> runtime/, server ->
runtime/, configuration -> reference/config.md, API_ARCHITECTURE/
NSC9-SPEC/RPC -> advanced/ with new frontmatter, MCP_THEME_RFC ->
labs/rfc-mcp-theme.md. Deleted: advanced/stego.md (corrupted pipe-table
artifacts, real CLI content merged into memory/stego.md after verifying
bin/stego.js snapshot/recover/capacity), essential/ai-onboard.md
(superseded by agent-onboarding). Renamed: advanced/horcrux.md ->
memory/horcrux-bootstrap.md (it documents BOOTSTRAP, not toHorcrux).

**Stale claims fixed:** 32x MCP port 3100 -> 3457 (matches bin/mcp.js +
lib/config.js); phantom "vant init" and "setup --repo" removed from
lander (verified neither exists; setup is interactive); 31-tools stat
replaced with honest counts (120 CLI bins, 125 lib modules, 120 doc
pages, 110 test files); FAQ backronym + /faq permalink.

**New artifacts:** canonical MCP connect snippet in runtime/mcp.md
(mcpServers JSON config + curl tools/list + tools/call on 3457);
_data/nav.yml fully rewritten to the new IA (65 -> matching URLs,
Memory section leads); AGENTS.md docs links retargeted; frontmatter
linter pass: all 120 pages have version/permalink/layout/title/
nav_order, ZERO duplicate permalinks.

**Lander (dist/index.html, -856/+455 lines):** hero "Agent memory that
lives in your repo" + soul metaphor once with disk mechanics; sections:
three memory systems, git-is-the-feature, agent loop (wake/work/sleep
+ MCP connect with real JSON-RPC), runtime underneath, trimmed FAQ.
Only verified commands advertised. Both JSON-LD blocks + OG/featureList
rewritten. Gates: 0 em dashes, 0 emoji, 0 banned phrases, 0 backronym.

**Mechanical passes:** 81 internal links rewritten via one-off script
(removed); 39 em dashes converted (CHANGELOG historical entries and
style.md's own example restored after; NSC9 spec comma-splice re-split
into sentences).

**Verification:** docs suite 6/6 after every wave; frontmatter lint 120
pages / 0 problems / 0 dup permalinks; full battery ci 421/0/3, runner
37/37, ALL standalone suites exit-0. Committed in 5 waves (63f03b9,
dc62fda, 6193c05, 28a1d20, 1b02d8b + final). PRD non-goals honored: no
code changes, no new CI, lander stays single-file.

**Known follow-ups:** docs/tutorials/* still exists pending the fold
(prd-content section 3); reference/cli.md completeness sweep against
bin/ help not yet done; operations/ and security/ pages kept their
deep nav_orders (functional, just not re-banded). None block PR #91.

---

## Session (2026-09-22 — version-consistency audit, 0.8.6)

User asked: are version numbers consistent across the codebase? We're on
0.8.6. Repo-wide sweep for `v?0.x.y` in js/json/md/yml/ini/html (filtering
IPs like 127.0.0.1, changelog history, and change-annotation headers).

**Real drift found + fixed:**
- `config.example.ini` `VANT_VERSION=v0.8.4` → v0.8.6 (stale since 0.8.5 —
  bump.js only touches package.json, and lib/version.js's "MANUAL" list is
  prose, which is exactly how this spot drifted)
- `lib/embed.js` getStatus reported `'0.9.0-axolotl'` (dev tag) while every
  peer getStatus reports the package version
- `lib/encounter.js` + `lib/rules.js` (RULES_VERSION) + `lib/docs.js`
  OpenAPI info + `lib/compute.js` getInfo + `lib/backup.js` (2 horcrux tags)
  + `lib/transform.js` (3 horcrux tags) still said 0.8.6/0.8.7 — consistent
  TODAY but guaranteed drift at the next bump
- `lib/brain.js` getVersion() was a hardcoded literal → now delegates to
  require('./version') (spliced via the node-script method; str_replace
  silently refuses 2000+ line files, as the labs notes predicted)

**Contract now:** everything runtime-reporting reads `lib/version.js`
(lazy `require` inline at use sites — zero cycle risk, version.js only
requires package.json + lazy event). Horcrux/backup artifact `version`
fields switched too: they're informational tags (restore code never
compares them; transform's gather fallback now also dynamic).

**Deliberately NOT changed (audit verdicts):** module headers like
`v0.9.0-axolotl` (change annotations, accurate on this branch);
`0.9.0-exp` geometry experimental tag; `lib/prune.js` 'v0.5.0' (a models/
DIRECTORY name fallback, not a version report); CHANGELOG [0.8.6] header;
dist/index.html `v0.8.4+` (feature-availability note, correct);
docs fixtures 0.8.11 / historical changelog pages; bin/models/brain.json
identity.version (test fixture, matches package).

**Verification:** all 8 touched files `node --check` clean; residual sweep
`grep -rE "version: '?\"?v?0\\.8\\.[0-9]"` over lib/ + bin/ → ZERO matches;
brain.getVersion / embed.getStatus / rules live-probe → "0.8.6"; full
battery: ci 421/0/3, runner 37/37, ALL standalone suites exit-0, vibe 4/4,
coverage 41/0. transform/malicious-restore '0.8.6' literals are test INPUT
fixtures, not output pins — unaffected by the dynamic switch.

---

## Session (2026-09-22 — CI efficiency + all-green, pre-merge #91)

User's constraints: free-tier Actions minutes shared with other projects in
the account; stale runs from rapid fix-fire pushes were burning minutes.
Directives: delete the audit workflow, consolidate test.yml to 1 job, fix
both CI reds (js-yaml advisory + brain-circuit flake).

- **audit.yml DELETED** (whole workflow, 56 lines) — was a dedicated
  audit-probe job; the audit itself is closed (ledger in labs/AUDIT_FINDINGS.md).
  audit.md at root was already gone (no residue).
- **test.yml consolidated 3 jobs → 1 job `ci`** (test + security + validate
  all ran their own checkout + setup-node + npm install = 3x the minutes per
  push). One job now: token grep + `npm audit --audit-level=high` + all test
  entrypoints + the standalone-suite loop, `npm ci` (lockfile-exact, faster
  + reproducible vs `npm install`), `cache: npm` on setup-node, timeout 5+3+2
  → 8. **concurrency block: group `${{ github.workflow }}-${{ github.ref }}`,
  `cancel-in-progress: true`** — a newer push to the same branch/PR cancels
  the in-flight stale run. YAML validated by parsing with js-yaml.
- **docker.yml / docs.yml checked, left alone:** both main/release-scoped
  only (docs.yml already has concurrency). Zero minutes on axolotl.
- **js-yaml high advisory:** package.json js-yaml ^4.1.1 unaffected; the
  advisory was the eslint dev-dep's transitive 4.3.1 — lockfile bumped to
  4.3.2 by `npm audit fix` (crash-session had it staged uncommitted).
  Verified: `npm audit --audit-level=high` → found 0 vulnerabilities.
- **brain-circuit flake (test 3 + 4, recovery):** fixed `setTimeout(60)`
  sleeps raced the injected 30ms half-open window; test 4's post-probe
  short-circuit assertion was a genuine race — past the fresh 30ms window,
  the "next call" became another REAL poisoned probe ('still wedged')
  instead of the coded error. Fixes: (1) `waitFor()` deadline-poll helper
  (5ms interval, 2s deadline, rejects with label on timeout) — retries the
  coded `BRAIN_CIRCUIT_OPEN` short-circuit until the window truly elapses
  (safe: the short-circuit path never feeds the breaker); (2) test 4 sets
  `_setLoadCircuitResetMs(0)` before the post-probe assertion — resetMs 0
  disables probing in the lib, so the next call MUST short-circuit at any
  CI speed. **Subtle trap (cost one failed run):** in the re-open test the
  waitFor predicate must RESOLVE with the real probe error ('still wedged')
  — it IS the expected outcome — and retry only on BRAIN_CIRCUIT_OPEN; the
  generic `RETRY_ON_CIRCUIT` rejection-handler form rejects on the expected
  error and skips the assertion chain entirely.

**Verification:** brain-circuit 10/10 × 5 consecutive runs (flake-proof);
npm audit clean; YAML parse OK (1 job, cancel-in-progress true, 6 steps);
ci.js 421/0/3; runner 37/37; vibe 4/4; coverage 41/0; ALL standalone
suites pass by exit code. Scratch residue from crash sessions (scripts/_*.js,
private/buffy) left untracked, excluded from the commit.

**This was the last pre-merge QC item — branch is GO for PR #91.**

---

## Session (2026-09-22 — docs/CI consistency pass, `1c72809`)

Continuation of the QC sweep: verify claims vs behavior across docs and
wire the new suites into discovery.

- **CI gap:** test/ci.js + runner were in GitHub Actions, but standalone
  suites (git-injection.test.js, migrations.test.js, etc.) were NOT —
  local-only discovery. Added a loop step to .github/workflows/test.yml
  (`for f in test/*.test.js`) + timeout 3→5 min.
- **CHANGELOG:** Unreleased section now records the brain layout
  migration (merge-safety) and the QC-wave security/robustness fixes.
- **Tool-count drift:** mcp-tools.md claimed "31 tools", AGENTS.md/README
  "21 tools" — reality: 272 exposed via tools/list (auto-wire grows it).
  Replaced hard-coded counts with auto-wire phrasing; mcp-tools.md gained
  a brain_migration_status reference entry + return type (was only in
  cli.md/setup.md).
- **cli.md vant migrate:** documented failed-verify retry semantics
  (marker withheld, exit 1, next run retries, start shows ⚠),
  existing-wins imports (skippedExisting), health OLD-STYLE warning.
- **Fixture residue:** none committed; .gitignore now covers
  .migration-fixture-legacy-main/ and .drill-* (only .migration-fixture/
  was covered).
- **CLI drills (verified before docs edits):** --status/--dry-run/
  --brain-name all exit 0 on the live tree; migrate --brain-name
  end-to-end + start banner behaviors already pinned by the 28-suite
  migration battery.

**Verification:** all suites pass, runner 37/37, CI 421/0/3, docs suite
green after doc edits.

---

## Session (2026-09-22 — QC sweep 2, `b05a7a7`)

User asked for another sweep of labs/QC_WAVE.md — migration AND broader
functionality, judged as PR #91 readiness. The sweep's big find:

**lib-side git injection (critical):** QC_WAVE v1 celebrated the
bin/branch-manager.js fix, but the SAME pattern survived in lib/ —
lib/branch.js git() helper (`execSync(\`git ${args.join(' ')}\`)`) and ALL
FOUR connectors (github/gitlab/bitbucket/selfhosted): checkout/push/pull
interpolated branch names, commit() interpolated messages straight from
brain-file content into shell strings. Fixed via argv-array execFileSync
everywhere: new `_gitExec(args)` + `_gitRef(name)` (charset + option-dash
+ `..` rejection) on the GitProvider base in remote.js; connectors route
through them; branch.js git() converted. Pinned by
test/git-injection.test.js — 7 suites: static no-interpolation scans
(comment-stripped!), _gitRef hostile-value rejection (--upload-pack, ;,
backtick, $(), .., leading dash) with legit refs passing, real-repo drills
proving a hostile commit message lands as TEXT and no marker file
appears, end-to-end branch.commit() drill.

**Two more live bugs found BY the new drill:**
1. branch.js called audit.info() ~10x without requiring audit → every
   CLI-path commit/checkout/merge crashed AFTER doing its git work (same
   class as vaf 1). Fixed: `const audit = require('./audit')`.
2. commit()'s strict vaf content check rejected legitimate messages
   containing ';'/backticks — with git() argv-array these are inert text.
   Message check now allowContent:true; agentId stays strict (path seg).

**Also:** errors unused import removed from migrations.js (wave-file lint
standard). labs/QC_WAVE.md rewritten as the go/no-go ledger: v1 gap list
statuses updated (branch-manager ✅, AUDIT_FINDINGS ✅, DEAD_EXPORTS/B-2/
PRD items 🟡 non-blocking), migration QC summary carried forward, verdict
GO for PR #91.

**Verification:** syntax sweep clean; ALL test/*.test.js pass by exit
code (incl. new git-injection 7/7); runner 37/37; CI 421/0/3; router 92
routes 0 dead; branch/remote/connector/provider suites green after the
git() conversion.

---

## Session (2026-09-22 — migration adversarial QC wave 2, pre-merge gate)

User: 100% solid before accepting PR #91. Adversarial edge audit found 5
real gaps (all now fixed + pinned):

1. **Marker-over-verify (data hazard, worst find):** migrate() wrote the
   v3 marker even when the import step self-reported verified:false → a
   failed migration was marked done and every retry was a silent no-op
   with the brain still invisible. Now: verified:false withholds the
   marker, migrate() returns {ok:false, failedVerify:true}, `vant
   migrate` exits 1 with recovery copy, start shows a ⚠ (not a 🎉).
2. **Default-stack rewrite:** detect() treats auto-persisted ['vant'] as
   still-legacy, but apply() only filled MISSING stacks → `--brain-name
   mybrain` left stack ['vant'] pointing at a nonexistent brain. apply()
   now REWRITES default-only stacks (neurons preserved).
3. **Collision overwrite:** import clobbered same-named live brain files
   (dropfiles step had existing-wins; import didn't). Now existing-wins
   both passes, reported as skippedExisting in the step result.
4. **Symlink/abort hardening:** walker now lstat + skips symlinks (never
   deletes through a link out of models/); per-file try/catch so ONE
   refused file can't abort the whole import (real drill caught the
   storage chain refusing with 'Security: Symlink attack detected').
   Post-write delete hiccups still count as imported (dest has it).
5. **Alert surfaces round 2:** health.js checkMigration() (silent when
   happy); migrate --status prints loud OLD-STYLE BRAIN notice; start
   banner now requires imported>0 (0-file existing-wins no-ops are quiet).

**Also:** case-insensitive dest-dir compare ('Vant/' on macOS ≡ 'vant/');
uncommitted plan() self-nest fix from last session now pinned by test.

**Verification:** migrations 28/28 (8 new adversarial suites incl.
verify-gate via Module._load sabotage, symlink canary, no-clobber,
stack-rewrite, 0-file banner). All test/*.test.js suites pass by exit
code (grep-on-tail heuristic was fooled by multi-line result blocks —
use exit codes). Runner 37/37. CI 421/0/3. REAL-tree drill: git archive
origin/main models/ → status shows legacy+notice → migrate imports 168,
verified:true, exit 0 → zero flat residue → fresh-process read OK,
corpus 60 → second start quiet → live axolotl tree up-to-date.

---

## Session (2026-09-22 — migration QC + alerts + docs, `d5a63c6`)

User asked: did you TEST it? — and demanded warn/alert surfaces + docs.
QC against a REAL `git archive origin/main models/` tree (not a synthetic
fixture) caught THREE bugs the synthetic tests missed:

1. **No-args migrate = help+exit0** — vant start's auto-run silently did
   nothing. No-args now runs; help is -h/--help only.
2. **Detection masking (two vectors):** brain boot creates
   models/private/<brain>/orgchart/ on legacy trees pre-migration → "any
   private brain dir" check blocked detection forever. Brain dirs now
   count only with .md content inside. AND: health/first-load auto-
   persists a default ['vant'] stack onto legacy trees → stack check
   relaxed: default-only stack no longer masks (flat public content is
   the real legacy signature).
3. **Empty dir shells:** nested dirs survived rmdirSync (ENOTEMPTY) →
   import now verifies all files walked out and rmSync -rf's the husk.

**Alert surfaces:** vant start prints a BRAIN MIGRATED banner (files
count, brain name, new locations, verify/rename hints) ONLY when the
import ran — idempotent starts stay silent. MCP `brain_migration_status`
tool: layout version + pending legacy + actionable guidance.

**Loader compat find:** main's _loadBrain fell back private→public in
dual mode; axolotl read() lost that. Migrated users' brains live in
public — plain read() would miss them. Restored the fallback when no
type is pinned (pinned reads unchanged). Verified against the real tree.

**Docs:** README upgrade section, AGENTS.md brain-layout contract,
docs/getting-started/setup.md upgrade guide, docs/reference/cli.md (vant
migrate reference + start sequence), docs/integrations/docker.md volume
upgrade notes.

**Verification:** 18/18 migration suites (5 new: banner-once, MCP legacy,
MCP up-to-date, read fallback, explicit-public); real-main-tree drill:
start imports 169 files, zero residue, fresh-process reads OK, second
start clean no-op; full loop 107/107; CI 421/0/3; runner 37/37.

---

## Session (2026-09-22 — legacy.multibrain-import, layout v3, `3bbacf9`)

The merge blocker caught before it shipped: main-style users have a FLAT
brain (all content in models/public root, no models/private dirs, no stack
in state.json). The axolotl loader reads state.stack[0] and probes
models/{private,public}/<name>/ — a main user's brain would be silently
invisible post-merge.

**Vehicle: lib/migrations.js** (the user's instinct — right call). Added
step `legacy.multibrain-import`, LAYOUT_VERSION 2→3:

- **Detect:** ALL of (no private brain dirs) + (≥3 flat public .md or ≥1
  flat private .md) + (state.json lacks `stack`). Conservative — never
  fires on multibrain trees (pinned by a no-false-positive suite).
- **Plan/apply:** every flat models/{public,private} entry nests under the
  named brain (dirs recurse; one plan shared by both passes — re-planning
  mid-migration sees the destination dir as a new root entry and recurses
  into <name>/<name>/, the subtlest bug of the slice); skip roots
  sudo/, tmp-space/, state.json, marker. Brain name via --brain-name or
  default 'vant', segment-validated (migration must never be a traversal
  vector).
- **State synth:** stack=[name], currentBrain=name, neurons preserved.
- **Stale-module resync (the second subtle bug):** brain.js loads as a
  side effect of storage's circular require the FIRST time apply()
  constructs a FileStorage — i.e. BEFORE the stack exists — so its
  in-memory _brainStack is the 'vant' default and a later switchBrain
  would persist ['nova','vant']. Fix: loadStack([name]) resync BEFORE
  switchBrain inside the verify.
- **Self-verify:** corpus.length > 0 through the real loader, reported in
  the step result (verified:true). Fresh-process read pinned by suite.
- **UX:** `vant migrate --brain-name <name>`; `vant start` auto-runs
  migrations before health (idempotent no-op when current; --no-migrate
  opts out). Auto-run is the difference between "users' brains just work"
  and "users must read a changelog".

**Verification:** tests first (5 new legacy-main suites), 13/13; full
module loop 107/107; CI 421/0/3; runner 37/37; end-to-end CLI drill on a
fixture (migrate --brain-name mybrain → nested, verified, marker v3).

**PR #91 picks this up automatically** — the merge is now safe for
old-style brains without a PR v2.

---

## Session (2026-09-22 — CI testBin overhaul, `1d7245c`)

Follow-up from the cold-clone drill: `testBin`'s "any stdout = pass" rule
was environment-fragile. Replaced with exit-semantics judging:

- **Pass:** exit 0; exit 1 with stdout (usage-screen CLI convention);
  alive-at-watchdog for known servers (mcp/watch/server)
- **Fail:** self-exited nonzero with no stdout (real breakage); any
  non-server bin that hangs past the watchdog
- **Skip (new, exit-code neutral):** environment denials (bind refused in
  capability-poor sandboxes) and sandbox-gate refusals (deny-by-default
  doing its job — `clean`/`snapshot` refuse their no-arg write ops). Skip
  messages quote the actual refusal line via `detailLine()` (stderr noise
  like circular-dep warnings no longer drowns it)
- **stdin: 'ignore'** so interactive CLIs (setup.js) get immediate EOF
  instead of hanging the watchdog
- **Fixed `--bin=X` silently running nothing** (outer guard swallowed the
  filter — now it actually filters)

Also exposed by the strict judge (all pre-existing): ~21 CLI bins print
usage to stdout and exit 1 on bare invocation (now recognized);
`setup.js` is interactive (fixed via stdin); `snapshot.js` deliberately
prints capability refusals to stdout (documented in its source, now
covered by the refusal skip). No bin behavior was changed — only judged.

**Verification:** this env 421/0/3 skipped; spot checks (`--bin` groups,
mcp alive-pass, setup EOF-pass, clean/snapshot refusal-skips); full module
loop 107/107; runner 37/37. Cold-clone CI implication: the drill's
`smoke:server` "failure" now classifies as a skip — CI is deterministic
across machines.

---

## Session (2026-09-22 — cold-clone reincarnation drill)

The refactor wave (atomic writes #27, primitives.js, error.js bug batch,
agents split #32, brain breaker #34, integration suite #35) had only ever
been validated in the dev workspace. This drill validated it from a FRESH
clone, the way a new contributor (or a disaster recovery) would arrive.

**Method:** cloned `axolotl` to `/tmp/vant-drill`, `bun install`, then:

1. **Horcrux inspect + restore** — `transform.inspectHorcrux()` on the real
   axolotl boot horcrux: valid, both formats detected. Full `restore()` of
   the gathered data: 18 state items restored (mode, stack, state,
   currentBrain, brainStorage, neurons, configStorage, islandState,
   teams, trust, islands, runtime, consensus, escrow, msg, realm, market,
   boot), 0 errors, validation clean across 6+6 private/public files.
2. **Brain pipeline** — dual-mode corpus: 63 items (json/md/txt,
   private+public), async/sync paths consistent, `read('identity')` →
   md/private 2672 chars. New breaker surface live: CLOSED/0 failures,
   threshold 5, resetMs 30s. `primitives.atomicWriteFile` writes + reads
   clean in the clone.
3. **Tests** — `test/ci.js`: 423/1. The 1: `smoke:server` — root-caused as
   a CI-heuristic artifact, NOT a wave regression: `bin/server.js` exits 1
   in BOTH environments here ("Network permission required" — the sandbox
   denies the bind). `testBin` passes when there is ANY stdout, and the
   main repo only has stdout because a leftover `.circuit-auth.json` emits
   an INFO line. Fresh clone → empty stdout → heuristic fail. The module
   itself fails identically pre-wave.
4. **Full module loop** — 107/107 suites green, runner 37/37.

**Verdict: PASS.** The wave survives a cold clone end-to-end. One CI
robustness note left for follow-up: `testBin`'s "any stdout = pass" rule
is fragile — a server that legitimately fails *silently* passes, and an
environment-dependent INFO line flips the same binary between pass/fail.
Candidate fix: exit-code-only judging, or explicit expected-output pins.

Scratch cleaned (`/tmp/vant-drill` removed).

---

## Session (2026-09-22 — integration regression suite, P3 #35)

The final audit-queue item. Shipped as `ca56f87`, tests first
(`test/integration-criticals.test.js`, 21 checks). With this, the ENTIRE
audit action plan (P0 1-10, P1 11-20, P2 21-30 minus documented residuals,
P3 31-35) is closed or ledger-annotated.

**What it is:** the closed criticals were pinned mostly module-local. This
suite walks them END-TO-END through real entry points — mcp.execute,
brain.load, agents delegateAsync, islands.createIsland, transform.toHorcrux,
sync.saveProviderState, the storage facade — so a refactor that breaks a
wire (export shape, gate order, error contract) fails here even when every
module-local suite still passes. This is exactly the harness that would have
caught the error.js ReferenceErrors and the dead _metrics.errors years ago:
behavioral, cross-module, no mocking of the module under test.

**BONUS REAL BUG (found by the suite, pre-existing in the monolith):**
`agents.work.delegateAsync` IGNORED stream.enqueue's gate result. The
sandbox→vaf→qos gate returns `{error:'sandbox_denied', capability:'canWrite'}`
on refusal; delegateAsync didn't check it and returned
`{status:'queued', workId:undefined}` anyway — denied work silently vanished
while the caller believed it was queued (the agent also stuck in 'delegated'
state). Now propagates `{agentId, error, capability, code:'E_GATE_DENIED'}`
and reverts agent.state to idle. Found by probing delegateAsync under
`canWrite:false` — the phantom-'queued' shape was the giveaway. NOT a split
regression (verified identical in the 4124da3 monolith).

**Probe-methodology notes (repeat for future cross-module pins):**
- mcp.execute resolves coded-error OBJECTS for input-validation refusals
  (MCP_INPUT_INVALID) and throws VantErrors for gate refusals — tests must
  handle both shapes.
- sync.saveProviderState's userCtx guard rejects FALSY ctx (EINVAL);
  truthy-but-wrong-typed ctx is RLS territory (sandbox 3 BY DESIGN, opt-in).
- vm-jail probe: `module.exports = { leaked: typeof require }` → 'undefined'
  (never 'function'); assert on typeof, not on throw — the jail swallows into
  defaults by design.
- transform.toHorcrux output paths must be repo-relative (vaf clamps
  absolute /tmp paths as traversal BEFORE the password check).
- Child-process (execFileSync node -e) is the right harness for load-time
  crash regressions (vaf 1) — the crash predates any test-side hook.

**Audit action-plan status: ALL P0/P1/P2/P3 items closed or annotated.**
What remains in the ledger are the 🔶 LATENT / BY DESIGN residuals
(sandbox 5 canBrain zero-caller, sandbox 3/4 opt-in layers, storage 2 raw
bypass, brain 8/9 mitigations) — all documented with rationale.

**Evidence:** CI 424/0/0; full module loop ALL GREEN; runner 37/37;
integration-criticals 21/21; agents-split 22/22 (delegateAsync fix
compatible); agents 17/17.

**Next candidates (post-audit):** P2 #26 work-item Map de-multiplexing
(flagged during the split), fresh-clone reincarnation drill rerun after the
refactor wave, horcrux refresh (point-in-time snapshots are stale),
DEAD_EXPORTS.md long tail.

---

## Session (2026-09-22 — brain-load circuit breaker, P3 #34)

Shipped as `5290471`, tests first (`test/brain-circuit.test.js`, 10 checks).

**The gap:** load() mostly returns null gracefully, but three real paths
THROW — (1) pipeline-CRITICAL handler crash (sandbox/vaf/qos/escrow;
executePipeline re-throws critical failures), (2) storage-layer error on the
options.brain direct-read path, (3) recursion-guard trip. A wedged storage
layer hammered every load forever, and `_metrics.errors` was
**reset-but-never-incremented** — dead telemetry since the metrics block
landed (found while wiring; the audit's "add circuit breaker for brain loads"
was the visible symptom).

**Contract:** consecutive-thrown-failure counting → threshold
(`VANT_BRAIN_CIRCUIT_THRESHOLD`, default 5) → short-circuit with coded
retryable `BRAIN_CIRCUIT_OPEN` VantError. HALF-OPEN probe after
`VANT_BRAIN_CIRCUIT_RESET_MS` (default 30s): exactly one load through
(`probing` flag prevents concurrent probe storms) — success closes, failure
re-opens. Null misses (brain-not-found, the dominant normal case) NEVER feed
the breaker; success-through closes it. Events `brain:load:circuit:open` /
`:halfOpen`. DI: `_setLoadCircuitThreshold` / `_setLoadCircuitResetMs`.

**BONUS: `_clearHandlerOverride()`** — register() had no undo: poisoning a
pipeline handler from the public API was PERMANENT (getHandler prefers the
_handlers Map over _defaults). Now droppable back to the default factory.

**Design notes:** OPEN blocks even good loads until the window elapses —
that's the point (fast-fail beats queuing on a wedge). Recovery is
success-through-probe, matching qos.CircuitBreaker; resetMs=0 disables
probing (stay open until resetLoadCircuit()). The half-open state is
transient: it exists only between the window check and the probe's
success/failure record.

**Test-writing gotchas:** (1) `addMiddleware(mode, name, pos)` — first arg is
the MODE, not a handler name; to poison a pipeline stage you
`brain.register('sandbox', boom)` (register() takes the handler). (2) The
suite's tmp VANT_MODEL_PATH does nothing — _brainModelsRoot is
`__dirname/../models` resolved at load; sandboxing tests via env vars doesn't
work for brain paths. (3) There's no brain.reset() — the handler-override
undo needed the new `_clearHandlerOverride` DI.

**Evidence:** CI 424/0/0; full module loop ALL GREEN; runner 37/37;
brain-circuit 10/10; brain suite 77/77 (no regressions from the load()
wiring).

**Remaining audit items:** P3 #33 error-handling standardization, #35
integration tests for P0/P1 fixes. P0/P1/P2 + #32/#34 all closed.

---

## Session (2026-09-22 — agents module split, P3 #32)

The big one from the audit queue. Shipped as `3fe53bf`, tests first
(`test/agents-split.test.js`, 22 checks).

**Structure:** 1156-line monolith → five files. lib/agents.js stays as the
ONE public door (thin facade re-export) so all 9 require points (brain, mcp,
system, vant, prune, transform, teams flow, bin/agent-spawner, bin/agents,
bin/org) work UNCHANGED — node resolves `lib/agents/` dir + `lib/agents.js`
file without conflict.

| File | Lines | Owns |
|------|-------|------|
| lib/agents/core.js | 333 | agent lifecycle: spawn (quota/rate/sandbox/sudo gates), pause/resume, terminate+kill, prune, list/get, metrics, fork, join, emit/on, Agents class |
| lib/agents/work.js | 341 | work items: delegate (guard+pipeline+team perms), delegateAsync/pollWork/completeWork, approve/reject/signOff, setDeadline/retry/escalate/setPriority |
| lib/agents/protos.js | 249 | loadProto/listProtos/loadFolder/listFolders/loadChain/startMCP + proto cache |
| lib/agents/multibrain.js | 47 | per-brain agents config + stack traversal |
| lib/agents/internal.js | 261 | ONE shared registry Map + _messages + persistence + all underscore helpers |

Facade pins: export surface identical to a pre-split snapshot (names AND
presence), no moved function bodies remain, gatherState/restoreState stay in
the facade (span registry + persistence domains).

**BONUS FIX (bare-identifier bug class #4):** emit()'s listener-error catch
called bare `audit.error(...)` — never defined — so a throwing listener
crashed the whole emit loop. Now console.warn. Found because the new suite
pins comment-stripped bare-ref patterns across all submodules.

**BONUS: _initCache() was dead code** — defined brain afterSave/brainChanged
cache-invalidation listeners but had ZERO callers, so the documented proto
cache invalidation NEVER HAPPENED. protos.js now registers the listeners at
load time (try/catch-guarded) — the intent is finally real. Pre-split suite
couldn't catch this: it was typeof-only.

**P2 #26 preserved deliberately:** the _messages Map multiplexing (work items
+ event listeners + conversation buffers) moved VERBATIM with the fail-safe
contract documented in work.js. De-multiplexing would have turned a pure move
into a behavior change — flagged for a future work-item ownership slice.
Also documented there: delegateAsync returns the STREAM workId while
setDeadline/retry/escalate/setPriority look up _messages — stream.complete()
is the real updater.

**Test-writing gotchas (MEM-worthy):**
1. Deny-by-default sandbox means spawn/fork refuse without a grant — suite
   must `setScopes + setCapabilities` up front (orgflow pattern). The
   pre-split suites never hit this because they never CALLED spawn.
2. `async function` early-returns RESOLVE with the error object, they don't
   reject: `resume(idle-agent)` resolves `{error:'Agent not paused'}`. Tests
   must assert resolved values, not use rejection handlers. Cost me 3 debug
   rounds before the instrumentation proved it.
3. Bare-identifier structural pins must strip comments first — doc comments
   legitimately mention the bug class by name.
4. Dead test scaffolding: don't leave `require('lib/agents/core')` unused in
   a test (confuses the next debugger).

**Evidence:** CI 424/0/0; full module loop ALL GREEN; runner 37/37;
agents-split 22/22; pre-split suites still green (agents 17, orgflow 18,
concurrent-agents 6) — zero consumer changes needed.

**Remaining audit items:** P3 #33 error-handling standardization, #34
brain-load circuit breaker, #35 integration tests for P0/P1 fixes. The P0/P1
queues are fully closed.

---

## Session (2026-09-22 — error.js latent-bug batch)

The queued follow-up to the primitives census. Shipped as `50e9bae`, tests
first (behavioral additions to `test/error.test.js`, 19/19 total).

**Root pattern:** three error.js functions referenced bare identifiers that
never existed in module scope. Every shape test (`typeof fn === 'function'`)
passed while the first real call threw ReferenceError — the exact trap the
vaf C1 ledger find came from:

| Fn | Bare ref | Effect |
|----|----------|--------|
| `handle()` | `vaf`, `logger` (real getters: `_getVaf`/`_getLogger`) | threw on EVERY call |
| `retry()` | `audit` (retry-path warn line) | only non-retryable errors ever worked; the retry path was itself the crash |
| `circuitBreaker()` | `errors.*` (open-state throw) | breaker could never actually OPEN |

Fixes: wired to the lazy getters (console fallbacks intact — audit/vaf stays
optional), module-local `VantError`/`CODES` in the breaker. Zero external
callers existed, which is why nothing ever noticed — these are the fail-safe
legacy API surfaces the audit ledger keeps flagging.

**CODES dedupe:** `NETWORK_TIMEOUT` and `SUDO_DENIED` were each defined
twice (identical values; JS silently keeps the last key). Deduped with
comments; structural pin in error.test.js parses the CODES block and refuses
any duplicate key going forward.

**Gotchas:** (1) error.test.js's original harness is SYNC-only — async
checks must go through the appended serialized `atest()` chain or Promises
get misjudged as failures (hit this mid-slice; first run showed 4 phantom
async failures). (2) The async tests surface the known circular-dependency
WARN lines (vaf↔storage↔sandbox) — pre-existing, harmless, out of scope
here.

**Evidence:** CI 424/0/0; full module loop ALL GREEN; runner 37/37;
error 19/19; primitives 8/8; atomic-writes 13/13.

**Remaining audit items:** P3 #32 agents module split (the big one), #33
error-handling standardization, #34 brain-load circuit breaker, #35
integration tests for P0/P1 fixes.

---

## Session (2026-09-22 — lib/primitives.js home + error.js census)

Follow-up to `faedaf8` after dhaupin challenged the error.js placement of
atomicWriteFile ("seems very weird"). Shipped as `daa0f51`, tests first
(`test/primitives.test.js`, 8 checks).

**Naming decision (discussed):** `lib/primitives.js`, NOT `lib/utils.js`.
Hard enforced contract in the file + test: node builtins ONLY, zero `./`
requires ever — the one module anything inside the brain↔storage↔gate cycle
or a bootstrap window may require at LOAD time without partial-module risk
(the 5b3ca91 bug class). "utils" would be the first junk-drawer module in an
88-flat-module layout that has deliberately avoided one — rejected.

**Moved:** atomicWriteFile (error.js keeps a delegating compat re-export;
same for sleep, a timing primitive with zero callers). All 12 call sites
repointed — they were inline lazy `require('./error')` so the swap was
mechanical. Structural pins in atomic-writes.test.js retargeted
(error.js → primitives.js as the one legitimate direct write outside the
storage layer).

**Gated-vs-ungated is now a documented distinction, not an accident:**
primitives are UNGATED (the sandbox capability gate is unusable mid-cycle —
that's the point). stego.js/backup.js deliberately STAY on the GATED
storage.atomicWrite — they're sandbox-relevant artifact writers with no
cycle constraint, and migrating them onto the primitive would silently drop
`_checkWrite()` enforcement. Header + test pin this so a future "cleanup"
can't do it.

**BONUS FIND while inventorying error.js — 3 latent ReferenceErrors +
CODES dupes (live-repro'd, same class as the vaf C1 ledger find):**
- `handle()` references bare `vaf` and `logger` — never defined (the
  getters are `_getLogger`/`_getVaf`) → throws on FIRST call. Zero callers
  outside error.js, fail-safe legacy surface.
- `retry()` references bare `audit` → throws on the first RETRYABLE
  failure (only the non-retryable path works).
- `circuitBreaker()` references bare `errors` when throwing the OPEN-state
  VantError → the breaker can never actually open.
- `CODES` defines `NETWORK_TIMEOUT` and `SUDO_DENIED` TWICE (~lines 110/131,
  115/160) — JS keeps the last silently.

**NEXT SLICE (queued):** error.js fixes, tests first — wire the lazy getters
(`_getVaf()`/`_getLogger()` + lazy audit shim), fix `errors` → module-local
reference in circuitBreaker, dedupe CODES. Then P3 #32 agents split remains
the big one.

**Evidence:** CI 424/0/0; full module loop ALL GREEN; runner 37/37;
primitives 8/8, atomic-writes 13/13, error 12/12.

---

## Session (2026-09-22 — atomic writes everywhere, P2 #27)

Shipped as `faedaf8`, tests first (`test/atomic-writes.test.js`, 13 checks).

**Design:** shared `atomicWriteFile()` helper in **lib/error.js** — deliberate
home choice: error.js has ZERO Vant-module requires at load time (event/audit
are lazy), so ANY module inside the brain↔storage↔gate require cycle can use
it without adding a cycle edge. Contract: hidden same-dir temp file
(`.name.UUID.tmp`) + writeFileSync-to-fd + fsync + rename; a crash leaves at
worst a harmless hidden temp (swept by `vant clean cache`), never a truncated
final file. storage.js re-exports it (`atomicWriteFile`) as the one door for
outside-the-layer writers. storage.atomicWrite (capability-gated variant)
unchanged.

**Census → migration (all raw final-path writes in lib/ now gone):**

| Site | Hazard fixed |
|--------|-------------|
| brain.js `_bfsWrite` bootstrap fallback | truncated brain file in the storage↔brain cycle window |
| qos.js CircuitBreaker._save non-models fallback | torn snapshot loads as null → silent breaker reset |
| security/gates.js `_save` | torn trust/block DB resets every breaker on next load |
| transform.js horcrux create() svg + json | partial horcrux that inspect/restore fail on (reincarnation-drill artifact!) |
| wal.js blob spill + compact() truncate | torn blob fails replay digest; torn truncate resurrects stale intents |
| format.js saveFile fallback | the pipeline-routed path was crash-safe; the raw escape was not |
| geometry/fragmenter.js ×2 + quasicrystal.js | provider records |

**Structural pins:** suite walks lib/ and refuses ANY bare `fs.writeFileSync`
outside storage.js (tempPath line) + error.js (the helper's own fd write), and
ANY `fs.promises.writeFile` anywhere — future raw-write regressions fail CI.

**Scope notes:** bin/+srv/ were already clean (git grep verified). FileStorage
unlinked() truncate path stays as-is (documented pre-existing behavior). WAL
blob write being atomic makes replay digest-checks stricter than before, not
weaker. geometry helpers keep the `await` on the now-sync helper (same-call
await, harmless) so call sites stay unchanged.

**Gotchas:** (1) wal journal is `wal.log` not `journal.jsonl` — constants
WAL_DIR/LOG_FILE at the top of wal.js. (2) error.js is now THE home for
fs-only shared primitives that must be cycle-safe; audit/logger stay lazy
requires. (3) structural walk tests must special-case the helper's own file
or the fix fails its own pin.

**Evidence:** CI 422/0/0; full module loop ALL GREEN; runner 37/37; module
suites for every touched file green (brain, qos, wal, transform, security,
islands, storage-metrics, sync, remote, connector, mcp).

**Remaining audit items:** P3 #32 agents module split (8hr est), P3 #33
error-handling standardization, P3 #34 brain-load circuit breaker, P3 #35
integration tests for P0/P1 fixes.

---

## Session (2026-09-22 — provider HTTP through network.js)

Follow-up from the P2 #25 handoff: connectors rode `_requestJson` timeouts
but still called the bare global fetch — no SSRF walls, no circuit breaker,
no events. Shipped as `31f6f69`, tests first
(`test/provider-network.test.js`, 10 checks).

**Decisive discovery:** network.fetch's sandbox gate is LIVE, not dead —
sandbox's final exports include top-level `can()` (`canNetwork()` false by
default). Verified live in a bare require: provider calls routed naively
would ALL deny. That's exactly why providers historically bypassed the
network layer.

**Fix:**
- `network.fetch` gains documented `system: true` — system-initiated ops
  bypass the per-call sandbox gate; their authorization lives at the entry
  point (explicit config, escrow, recursion guard, circuits, wall-clock
  caps). Agents/user fetches stay gated. Structural pin test guards the
  contract through the prd-security canX()/can() migration.
- `GitProvider._requestJson` routes through network.fetch (`system: true`,
  `cache: false` — network cache is not auth-keyed; a cached authed response
  could cross tokens). Blockers → coded `NETWORK_BLOCKED` (non-retryable);
  `HTTP <status>` rejections → `NETWORK_HTTP_ERROR` (retryable 5xx/429);
  wall-clock race keeps `NETWORK_TIMEOUT` on hung transports.
- network.js bugfix pinned via loopback: non-2xx rejections said
  `` HTTP \${res.statusCode} `` LITERALLY (escaped dollar — status never
  interpolated).
- `_checkNetwork` fail-open documented inline in sync.js (no flip — would
  brick configured installs; fail-closed tracked for sandbox network-scope
  grant path).
- provider-timeouts suite re-targeted: network.fetch owns its http/https
  transport, so global-fetch stubs were INERT (would have hit real DNS).

**Evidence:** CI 422/0/0; 10 suites green (sync, sync-pull,
sync-recursion, remote, remote-storage, network, connector, remote-cli,
provider-timeouts, provider-network); `npm run check` clean.

---

## Session (2026-09-22 — P2 #25 provider-op timeouts)

Audit P2 #25: "Add timeouts to all provider operations (sync.js, remote.js)".
Shipped as `bf11f78`, tests first (`test/provider-timeouts.test.js`, 14
offline checks).

**Real finding (re-scoped the slice):** the connectors were the actual hole.
All 5 git providers' `_request()` called the BARE GLOBAL fetch() — no timeout,
no abort, no circuit breaker, no sandbox canNetwork gate — while network.js
sat right there with all four. Git CLI ops were bare execSync with no kill
timeout. A dead endpoint or hung SSH remote froze pushAll/pullAny/rebase
forever (the hung-commit repro test hung the whole suite pre-fix — that was
the demonstration).

**Fix, two layers:**
- GitProvider base (lib/remote.js): `_requestJson()` — AbortController +
  timer; abort → coded NETWORK_TIMEOUT VantError, retryable:true; non-2xx →
  NETWORK_HTTP_ERROR (retryable on 5xx/429). `_gitOpts()` — execSync timeout
  (default 60s, `VANT_GIT_TIMEOUT_MS`). All 5 connectors (github/gitlab/
  bitbucket/gitea/selfhosted) ride the base; structural test pins that no
  provider file ever calls bare fetch() again.
- sync.js `_capOp()`: wall-clock cap around EVERY provider op in
  pushAll/pullAny/rebase/status — including ops that never touch HTTP
  (overridden methods, stuck git children). `VANT_SYNC_OP_TIMEOUT_MS`
  (default 120s), per-call `opTimeoutMs`. Hangs now land as coded per-provider
  results instead of a frozen broadcast.

**Deliberate scope calls:** (1) timeout layer ≠ network layer — connectors
still don't get circuit breaker/cache/SSRF-walls; routing them through
network.fetch() is the NEXT step (response-shape differs: string vs Response,
github's PR flow asserts on it). (2) Module-level detectRepoFromRemote()
sites stay bare execSync — boot-time local probes, not remote ops. (3) Error
messages changed from "GitHub API error: ..." to "Provider API error: ..." —
no test pinned the old text.

**Evidence:** CI 422/0/0; sync/sync-pull/sync-recursion/remote/
remote-storage/network/connector/remote-cli suites green; `npm run check`
clean across lib/bin/test.

---

## Session (2026-09-22 — mcp schema validation + sync pull/rebase)

Next-wave candidates from the audit ledger, two shipped slices:

**mcp P1 #14 — `20eda2e`.** 269 tools declared `inputSchema`; zero validated at
dispatch. `_validateToolInput` now runs at every door: `execute`/`call` return
`{error:'MCP_INPUT_INVALID', problems[]}`; the HTTP JSON-RPC path throws coded
`MCP_INPUT_INVALID` BEFORE the security chain. Contract: fail-closed on declared
constraints (required/type/enum/minItems), permissive on undeclared keys so bare
`{type:'object'}` schemas keep passing. Repo-wide meta-test pins that every
registered schema is well-formed. `test/mcp-schema.test.js` 13 checks.

**sync P2 #23/#24 — `a1200c3`.** pullAny now reports a real corpus apply diff
(added/updated/unchanged/total) via before/after snapshots, invalidates the
corpus cache, supports dryRun. rebase classifies pull conflicts (→ needsManual,
push never attempted), scans the corpus for unresolved git conflict markers and
BLOCKS the push when any brain file carries one, and pushes only clean trees.
Provider not-found/not-configured → structured errors. Added
`brain.invalidateCorpusCache()` + test-only provider DI
(`_setTestProvider`/`_clearTestProviders`, s3 `_setR2TestClient` pattern).
`test/sync-pull.test.js` 15 checks.

**Gotchas hit (MEM-worthy):** (1) `brain.loadCorpus()` returns the warm cache
verbatim — snapshot code must `invalidateCorpusCache()` first or diffs lie.
(2) Brain files must be written via the RESOLVED brain path
(`models/private/<brain>/...`, multibrain layout) — hardcoding `models/private`
lands files where the corpus can't see them. (3) Corpus ids are extensionless.
(4) Test provider fakes must be registered before the async chain drains or
clear/re-register inside the test.

**Evidence:** CI 422/0/0; mcp/mcp-schema/vant/agents/sync/remote/brain suites
green.

---

## Session (2026-09-22 — audit criticals verification ledger)

Third item of the wave (after B-2 `b99065d` and branch-manager `718558b`).
Bookkeeping pass turned adversarial: every critical was re-derived from source
and, where cheap, live-repro'd — not just trusted from prior commit messages.

**Result: 22/23 confirmed closed, 1 live bug found and fixed.**

| Module | Count | Outcome |
|--------|-------|---------|
| brain | 9 | all closed (C8/C9 mitigated-by-design: cache-warm preload + graceful remote null) |
| islands | 4 | all closed |
| mcp | 5 | all closed (contained storage tools, sudo-gated shell/eval, SSRF blocklist) |
| storage | 4 | all closed (P1-16 rename-replaces-symlink has a regression pin) |
| sandbox | 5 | 4 closed + 1 latent (`canBrain` static defaults, zero callers) |
| vaf | 5 | **C1 LIVE** — fixed; other 4 closed |
| agents | 4 | closed (C1 residual: work-item fns are fail-safe legacy API, zero callers) |
| sync/backup/remote/transform | 6 | all closed |

**The vaf C1 find:** `_loadBlockedIPs()` called `audit.info(...)` but vaf's own
`audit` is a plain function — a valid `.circuit-vaf.json` present at require
time threw `audit.info is not a function` and killed the ENTIRE module load.
Happy path (no blocklist file) masked it; the base test suite never planted the
file. Fix: the three calls now use vaf's `audit()` (coded events,
`IP_BLOCKLIST_*`); regression test plants the file and requires vaf in a fresh
child process (`test/vaf.test.js`).

**Bonus fix — stale sandbox assertions:** `test/test-sandbox.js` still asserted
the OLD permissive contract (canWrite/canExec default true; top-level capability
passthrough). Updated to pin the deny-by-default contract; 14/14 green.

**Evidence:** CI loop **422 passed / 0 failed / 0 warnings**; module suites
listed in the ledger header of `labs/AUDIT_FINDINGS.md`. Full per-item table
with file:line evidence written into AUDIT_FINDINGS.md (top of file).

**Next candidates:** sec-chain leftovers (QC_WAVE), sync pullAny/rebase real
implementations (audit P2 #23/#24), mcp tool schema validation enforcement
(P1 #14), agents module split (P3 #32).

---

## Session (2026-09-22 — cloudflare: strip → delete)

The full arc, in three commits after the r2 delegation:

| Commit | What |
|--------|------|
| `f81366f` | getConfig() secret redaction (apiToken always, r2Secret after delegation). |
| `be0b3f2` | Museum strip: Pages-sync/KV/Workers/adapter/srv halves removed (−1,274 lines); connector reduced to an R2 facade. |
| `ead471e` | **Final step (dhaupin: "do we need the connector at all? R2 uses s3 patterns")**: NO — the facade was a redundant second front door. Connector + both suites + orphaned config.cloudflare block deleted (zero consumers verified first). −418 more lines. |

**Final state:** R2 is first-class through ONE door — `connectors.s3({provider:'r2'})`,
`getStorage('remote',{provider:'r2'})` / `VANT_REMOTE_PROVIDER=r2` + `vant s3`. The
connectors index documents that R2 needs no separate connector. Full loop 0 failures,
CI 422/422, R2 paths smoke-verified through both the client and the store.

**Session-wide net:** cloudflare footprint went from ~2,900 lines (connector + adapter
+ srv functions + tests, most of it never-functional) to zero dedicated lines — with
greater R2 capability than it ever had (real SigV4, delete op, list metadata).

---

## Session (2026-09-22 — cloudflare museum strip + secret redaction)

Follow-up to the r2 delegation, after the "what does this even provide" inventory:

| Commit | What |
|--------|------|
| `f81366f` | **getConfig() redaction** — spread raw `apiToken` (always) + `r2SecretAccessKey` (since delegation); now `***set***`/undefined markers. Dormant module, hygiene only. |
| `be0b3f2` | **Museum strip** (dhaupin: "strip the museum pieces"). Context: future web-UI hosting goes on CF Pages/Vercel as frontend deploys — never needed the Node→Pages-Functions sync RELAY. Removed: connector's sync/KV/Workers/connect surface, `lib/adapters/cloudflare.js` (transport multiplexer existed only for those), its shape-test, `srv/cloudflare/` Pages Functions (the never-deployed server half), `lib/config.js` cf* plumbing (zero consumers). Kept: **R2 facade over connectors/s3** (get/put/list/delete + cf:r2:* events + management surface + `_setR2TestClient` DI). Strip-regression pins in `cloudflare-r2.test.js` (museum exports must stay gone, control-API endpoints/CF_* env reads must not return). |

**Cloudflare story is now:** R2 object storage via S3 client, full stop. Web-UI hosting
decision (CF Pages vs Vercel) is orthogonal — it deploys frontend files, doesn't touch
the connector. Suites: cloudflare-r2 9/9, cloudflare 10/10 (shape tests survived the
strip untouched — they only ever pinned the kept management surface).

---

## Session (2026-09-22 — connectors-family consolidation: s3 relocation + cloudflare r2 delegation)

Follow-ups to the remote-connectors wave, per dhaupin review. Two commits:

| Commit | What |
|--------|------|
| `38790a0` | **Option B — S3 client relocated** to `lib/connectors/s3.js` (git-provider precedent: peers + index registration as `connectors.s3(config)`); RemoteStorage consumes it; name verified against git log before the move. |
| `9fd4a51` | **Option C — cloudflare r2\* delegation.** `connectors/cloudflare.js` r2Get/r2Put/r2List now ride the S3 client against R2's NATIVE S3 endpoint: SigV4 with R2 access keys (`CF_R2_ACCESS_KEY_ID`/`CF_R2_SECRET_ACCESS_KEY`, optional `CF_R2_JURISDICTION`/`CF_R2_ENDPOINT`), gains `r2Delete` (control API had none), size/etag list parsing (`_parseListXml` shared with s3 client), put content-type support; adapter `r2()` interface gains delete wrapper. **BONUS DOA FIND:** the connector AND adapter had `require('./error')`/`'./event')`/`'./network')` — siblings that don't exist in their directories — so EVERY code path, including the "not configured" refusals, threw MODULE_NOT_FOUND since creation. Nothing noticed because nothing consumed them. Fixed to `../` requires; pinned by the new suite. Tests: `cloudflare-r2` 9/9 offline (DI fake client + event listeners), `remote` 10/10 (added `_parseListXml` known-answer). |

**R2 auth contract change (safe — no consumers existed):** object ops no longer use
`CF_API_TOKEN` (control plane); they need R2 S3 access keys. Control-plane ops
(KV/Pages/Workers) untouched. `_setR2TestClient()` DI hook exported for offline tests.

---

## Session (2026-09-22 — remote connectors: S3/R2/MinIO/B2 via ONE own implementation)

The last open prd-storage checklist item. Three slices, committed per slice, full
loop + CI green after each (R1's original commit was verified slice-local only —
see the regression note).

| Commit | Slice | What |
|--------|-------|------|
| `d22379b` | R1 | **Own S3-API client** — SigV4 signer over global `fetch` (zero deps, Node ≥18), provider presets: s3 (`{bucket}.s3.{region}.amazonaws.com`), r2 (account-scoped host + path-style), minio (localhost:9000), b2 (`{region}.backblazeb2.com`); UNSIGNED-PAYLOAD signing; traversal-gated key charset BEFORE any URL interpolation; credential-safety in all error paths; `headBucket`/`test()` probes. Tests 9/9 OFFLINE incl. SigV4 known-answer (canonical request rebuilt independently from the AWS spec). |
| `703f39e` | fix | **R1 clobbered lib/remote.js** — the git-providers registry (sync/branch/mcp/system/vant consumers) — caught by the full loop (sync-recursion suite crash), NOT by CI smokes. Registry restored, S3 client relocated to `lib/remote-s3.js`. Distinct concepts, distinct homes — the names were a trap. |
| `b3d7f73` | R2 | **RemoteStorage store** — `getStorage('remote', {provider,bucket,region,prefix,endpoint,keys} | env VANT_REMOTE_*)`; shared B-2 gate + vaf + key hardening on EVERY path incl. raw bypass (absolute/backslash/`..` refused pre-network); recursive-by-default `list()` (shallow parity opt-in — FileStorage's one-level list is a readdir limitation, not a network contract); prefix round-trip mapping; `pushFrom`/`pullTo` (dryRun); per-store metrics at `remote://` pseudo basePath; DI client injection for offline tests; lazy config refusal. Tests 13/13 offline. |
| `4597044` | R3 | **`vant s3` CLI** — status (secret-free) / test (connectivity probe) / ls / push / pull with --dry-run; refuses before any transfer when unconfigured; pre-existing `vant remote` SSH CLI untouched. Tests 6/6 offline smoke + router wiring. |

**Config contract:** `VANT_REMOTE_PROVIDER|BUCKET|REGION|KEY|SECRET|PREFIX|ENDPOINT`.
GCS/Azure deliberately out of scope (non-S3 APIs; revisit only with a real demand).

**Gotchas (new + reinforced):**
1. **NEVER trust a fresh-looking filename** — check `git log -- <path>` before creating
   anything. Both clobber-regressions (lib/remote.js, bin/remote.js) were names that
   LOOKED free but belonged to commits outside the recent log window. `glob` being
   blind to lib/bin here makes this worse — use `git ls-files | grep`.
2. Slice-local test suites catch slice bugs; ONLY the full module loop catches
   blast radius. Run the loop before EVERY commit that touches a shared lib.
3. SigV4 known-answer testing works: build the canonical request by hand from the
   AWS spec in the test (header lines carry their own trailing \n INSIDE the block,
   join('\n') separates the five SECTIONS) — signature mismatches then localize
   instantly.
4. str_replace silently refuses edits on storage.js (2000+ lines) — the exact-match-
   or-throw node-script splice is now the default for that file; scripts are one-off,
   always `rm`'d after success.
5. Async test summaries lie unless tests are serialized into one promise chain —
   the gating test flips the SHARED default sandbox, so concurrency = flaky cross-test
   poisoning.
6. `vant remote` (SSH host CLI, ecosystem wave `5e33280`) vs `vant s3` (object
   storage connectors) — document the split in any future docs pass.

**prd-storage checklist: ALL items closed.** Remaining wave: B-2 security-chain
consolidation, branch-manager args-array refactor (tests first), audit criticals
verification ledger.

---

## Session (2026-09-22 — QC wave: security/consistency/gap analysis over the last-2-days code)

Audit-style pass over the wave code + repo-wide sweeps. **Fixed:** WAL replay path
escape (journal JSON fed to path.resolve unvalidated — crafted wal.log wrote outside
the store; now re-contained + blob names must be sha256 hex) AND the WAL fsync that
never actually fsynced (fsync on a closed fd, EBADF swallowed) — `5a28829`. Sudo env
tunables NaN'd on garbage values (health timeout fired at 0ms → grants wrongly
revoked; revalidate interval would tight-loop) + bin/branch.js ref-name validation —
`ce246ea`. `npm run check` was a silent no-op (node --check multi-arg validates only
the first file — probed and confirmed) — `bdf2025`. Lint warnings zeroed — `7039827`.
**Clean:** syntax sweep all files, full test loop 0 failures, mcp RCE false positive
(sudo-gated + safe vant_call), router 92/92 routes exist, metric naming consistent.
Findings ledger + not-fixed gaps (branch-manager git() refactor, dead exports,
security-chain consolidation) in **labs/QC_WAVE.md**.

---

## Session (2026-09-22 — shared metrics registry + WAL + mirror + sudo metrics + health-check revalidation)

The full 6-slice wave (prd-storage metrics/WAL/replication + prd-sudo metrics/health-check)
landed, verified per slice, committed per slice:

| Commit | Slice | What |
|--------|-------|------|
| `59325b8` | A | **lib/metrics.js** — shared in-process registry: counters/gauges/histograms keyed by name+sorted labels, Prometheus text exposition (`vant metrics --prom`), never-throws contract; system.js migrated onto it |
| `3fc1d3d` | B | **Storage op metrics** — op/outcome counters + duration histograms in lib/storage.js; CLI storage section. Tests: storage-metrics 8/8 |
| `5d22fae` | C | **WAL crash recovery** — lib/wal.js JSONL journal, replay/verify/truncate, FileStorage recovery on open; CLI `vant wal`. Tests: wal.test.js incl. crash fixtures |
| `4794d49` | D | **Mirror replication** — primary→mirror push-on-write + `replicate()`; CLI `vant mirror`. Tests: storage-mirror 10/10 |
| `45a594b` | E | **Sudo metrics** — escalations_total (requested/granted/denied+reason), revalidations_total, grants_active gauge, escalation_duration_ms histogram; getSudoMetrics(); CLI `vant sudo metrics` + `vant metrics` sudo section; instrumentation never throws into sudo paths. Tests: sudo-metrics 7/7 |
| `bc36095` | F | **Health-check gated revalidation (prd-sudo §12)** — registerHealthCheck()/runHealthChecks(); revalidation loop extends expired revalidate:true grants only when the service probe passes, otherwise revokes with `reason: 'health_check_failed'`; no probe = plain TTL (backward compatible); 1s probe timeout (VANT_SUDO_HEALTH_TIMEOUT) + in-flight guard (never resurrect a grant revoked mid-probe); CLI `vant sudo health`. Tests: sudo-health 11/11 |

**Verification:** per-slice suites green (sudo 7, sudo-integration 21, sudo-policies 17, sudo-metrics 7,
sudo-health 11, metrics 11, storage-metrics 8, wal 14, storage-mirror 10, health 6, boot 15);
full module loop over ALL test/*.test.js: 0 failures (two halves, 15s per-suite timeout).

**Gotchas:**
1. **Discovery tools blind here:** glob/code_search return nothing for lib/ + test/ on this
   workspace — use `git ls-files` / `git grep` for code discovery in this repo.
2. **Multi-replacement edits into structural regions can misapply** — the first attempt at the
   revalidation-loop edit duplicated a branch and nested the helper inside the loop body. Always
   re-read the edited region (not just `node --check`) after a multi-patch into an existing
   control-flow block; repair by replacing the whole function.
3. **sudo.reset() before asserting:** `sudo.reset(); return sudo.can(...) === false` evaluates the
   assertion against the RESET state (no grants). Capture `getGrants()`/`can()` into locals BEFORE
   reset, then assert on the locals.
4. **Health-timeout test timing:** revocation happens AT the 1s timeout expiry — the test must
   wait PAST it (1400ms), not before it, and the hanging probe resolves later than the wait.
5. CI (`test/ci.js`) auto-enumerates lib/*.js + bin/*.js (load/syntax probes); the *.test.js
   suites are run by the module-loop convention, not by CI.
6. Standing: the axolotl horcrux SVG gets mutated by test runs — leave unstaged.

**prd checklist now:** prd-sudo open items = Web UI, external auth (OAuth/LDAP) only;
prd-storage open items = remote connectors (S3/GCS/Azure) only.

---

## Session (2026-09-21 — sudo escalation templates + policies-as-code)

The in-flight working-tree slice landed and verified. prd-sudo checklist now: templates [x],
policies-as-code [x]. Remaining open: Web UI, external auth (OAuth/LDAP), health-check
revalidation, metrics.

| Commit | What |
|--------|------|
| `d003191` | **Templates** — defineTemplate/getTemplate/listTemplates/deleteTemplate/applyTemplate in lib/sudo.js. Pinned service+scope+ttl (ttl clamped to CURRENT policy at define; escalate() re-clamps at apply), persisted at models/private/sudo/templates.json via FileStorage, name charset-gated (TEMPLATE_NAME_RE). applyTemplate routes through escalate() so whitelist/rate-limit/audit still govern every grant — templates are sugar, never a bypass. **Policies-as-code** — loadPolicies()/resetPolicies()/getPoliciesStatus(); optional JSON at models/private/sudo/policies.json (VANT_SUDO_POLICIES_PATH); TIGHTEN-ONLY invariants: no scope adds, no autoApprove adds, no requiresCallback removals, no maxTTL raises, no revalidate-off where forced on, no unknown services/fields/arrays — whole-file refusal, zero partial application. Wired into boot.init (refusal logs loudly, never blocks boot). CLI: `vant sudo template def|list|show|rm|apply`, `vant sudo policies load|status|reset`, `vant sudo audit [n]`. Tests: test/sudo-policies.test.js 17/17.

**Gotchas:** (1) test suite leaves NO policies.json behind — a leftover file would tighten every future boot silently; tests clean both files + resetPolicies() on exit. (2) The axolotl horcrux SVG (models/public/vant/boot/axolotl-p_axolotl2026.svg) gets mutated by test runs that touch boot/horcrux state — leave unstaged, restore via checkout if needed.

**Verification:** sudo-policies 17/17; full module loop 0 fails; CI 414/414; runner 37/37; boot.init smoke with policies wiring OK.

---

## Session (2026-09-21 — brain layout migration tool + the `require`+top-level-await test trap)

**Context:** "Run keeps failing" → the in-flight slice (brain layout migration tool per
prd-storage.md checklist) was uncommitted with `test/migrations.test.js` failing 3/8.
Root cause of the "failing run" was NOT the migration code — the tool itself worked
(manual repros passed). Two real issues:

1. **Node refuses top-level `await` alongside `require()`** in the fixture probe
   scripts: `ReferenceError: Cannot determine intended module format because both
   require() and top-level await are present`. The three fixture tests crashed the
   child before any assertion. Fix: wrap probe bodies in async IIFEs (CJS-safe),
   plus `catch → process.exit(1)` so future child failures surface properly.
2. **Self-contradictory assertion:** the apply test demanded the legacy `state/` dir
   still exist AND be empty after migration — but the migration correctly drains and
   `rmdir`s it. Fixed the check to "gone OR empty" and tightened it to also verify
   both moved dropfiles with intact content.

| Commit | What |
|--------|------|
| `3a38f04` | (prior wave, context) PRD hygiene record | — |

**This session's slice:**

| Files | What |
|-------|------|
| `lib/migrations.js` (new) | Layout registry: content-based detection (marker never trusted alone), ordered idempotent steps — `orgchart.brain-scope` (.agent_tmp → models/private/<brain>/orgchart/), `tmpspace.models-anchor` (./storage → models/tmp-space/), `dropfiles.tmp-space` (state/ dropfiles → tmp-space/myStuff), `marker.write` last (models/private/.layout-version.json, written only after success). dryRun support; all moves through FileStorage (sandbox→vaf→qos→escrow chain); crash-recovery path re-derives from fs evidence and re-writes the marker. |
| `bin/migrate.js` (new) | `vant migrate --status / --dry-run / apply`. Registered in bin/vant.js COMMANDS + help. Refusals print to stdout (CI smoke gotcha from the 1b wave). |
| `test/migrations.test.js` (new) | 8 checks: registry shape, real-tree idempotence, fixture detection/dryRun-no-mutation, apply round-trip (escrow + dropfiles + content verification), no-clobber (existing dropfile wins), CLI status + dry-run. |
| `labs/prd-storage.md` | Migration-tool checklist item → [x] with implementation notes. |
| `.gitignore` | `.migration-fixture/` scratch excluded. |

**CORRECTION (found during the snapshots slice):** the earlier note claiming the
18:26 real-tree `dropfiles.tmp-space` move was "the migration working" was WRONG —
it was a **mis-classification bug**: `models/private/<brain>/state/<key>.json.md`
is the LIVE StateStorage layout (brain tests/boots re-create it constantly), not
legacy dropfiles. Fixed the detector: only non-`.json.md` arbitrary-named files
are treated as legacy drop content; live state files never move, and the dir is
only removed when truly drained. The 4 real-tree files were already re-created by
the runtime; the stale copies moved to tmp-space were preserved as
`*.moved-bak` (never delete data) and the live ones verified in place.

**Verification:** migrations 8/8; snapshots 9/9; full module loop ALL GREEN;
runner 37/37; CI 414/414; `vant migrate --status` stable across repeated loop runs.

---

## Session (2026-09-21 — PRD hygiene wave: security checklist + storage enhancements + sudo persistence)

All six queued PRD items, one commit per slice, full loop + CI green each.

| Commit | What |
|--------|------|
| `fc2b314` | **1a — service-tag MCP escalations.** sudo_escalate (legacy level-as-scope mapped 1=read, 2+=write) + vant_sudo_escalate now `service: 'mcp'` (3-min TTL, whitelist applies). Verified granted events carry service=mcp with mcp maxTTL. Caller audit: storage + vant_storage_* were already tagged. |
| `3dca7a2` | **1b — CLI write gates.** clean.js run() (dry-run ungated), snapshot.js run(), compress.js adaptive-write, succession.js log, bump.js updatePackageJson now _checkWrite(). Audit finding: 12 CLIs define _checkRead/_checkWrite but never call them (dead helpers); 5 write-performing CLIs had NO checks. Grant path stays `vant org grant` (per-process, D-3). |
| `73778c1` | **1c — docs/essential/sudo.md.** Threat model, can(cap)→sudo delegation, service policy table, vant org grant UX, CLI write gates, audit event catalog. |
| `e91111b` | **2 — encryption at rest.** FileStorage opt-in AES-256-GCM via encrypt.js (`encrypt: true` + `encryptKey` or `VANT_STORAGE_KEY`/`VANT_STORAGE_ENCRYPT=1`); `vant-enc:v1:` prefix; mixed plaintext/encrypted stores read fine; no-key/wrong-key reads refused. QC 6/6. |
| `d4990d8` | **2b — transparent gzip.** `compressAbove` bytes threshold (`VANT_STORAGE_COMPRESS_ABOVE`); `vant-gz:v1:` prefix; pipeline serialize→compress→encrypt (ciphertext never compressed); prefix-detected decode reverses per step — any vintage mix reads correctly. 8200→99 bytes demo. |
| `f3a40e1` | **3+3b — sudo audit log + rate limit.** Escalation decisions append to models/private/sudo/escalations.jsonl via FileStorage (capped, survives reset, getEscalationAuditLog()). Rate limit: task+scope+service 20/60s env-tunable; over-budget denied + audited. **Companion bug:** revoke() now also clears TTL grants — an auto-approved escalation previously survived revoke until expiry. |

**PRD checkbox status:** prd-security migration checklist 5/5 done; prd-storage
encryption+compression done (WAL/replication/metrics/migration/point-in-time
still open, larger efforts); prd-sudo audit+rate-limit done (templates/WebUI/
ext-auth/policies-as-code/metrics remain). prd-org-teams D-1..D-5 all landed in
the O-wave.

**Gotchas:** CI smoke runs bare CLIs — capability refusals must print to stdout
(not just stderr) or the smoke harness counts them failed. encrypt.js
Encrypt.encrypt/decrypt is salt:iv:authTag:ciphertext base64-ish text — safe
to embed after a text prefix marker.

---

## Session (2026-09-21 — selfhosted fix + brain/horcrux cleanup)

| Commit | What |
|--------|------|
| `944ab84` | **SECURITY — selfhosted provider opt-in.** `isConfigured()` was hardcoded `true`; now dormant by default, configured via constructor `{url\|remoteUrl}`, `VANT_SELFHOSTED_REMOTE`, or `VANT_SELFHOSTED=1`. sync-recursion test now leans on production dormancy (prototype patch = CI belt-and-suspenders). QC 5/5 incl. sync early-return with zero providers. |
| `5bf90bf` | **Horcrux + brain cleanup.** axolotl brain stubs fleshed out with real refactor state (were template stubs from the first snapshot — the drill's staleness finding); buffy identity refreshed to post-F3 state; fresh export via `horcrux create`; round-trip QC 6/6 into a scratch runtime. |
| `8dcff83` | **SECURITY — canX() → can(cap) unification** (prd-security.md checklist item 1). Module-level canRead/canWrite/canNetwork/canExec/canSpawn now route through `defaultSandbox.can(cap)`, so all 56 canX() call sites in lib/+bin/ inherit sudo-aware verdicts without touching 30 files. Verified both routes MATCH in allow/deny/mixed states; CI 410/410. Remaining checklist items: `service` param on escalation ops, tests config/mock sudo, CLI `_checkWrite()` pattern audit, docs. |

---

## Session (2026-09-21 — test-gap trio + reincarnation drill + timer registry)

**Scope:** the three long-queued test gaps, the cold-clone reincarnation drill,
and the 9-timer lifecycle roadmap item. 84→87 suites, all green.

| Commit | What |
|--------|------|
| `00ee866` | **Test-gap trio lands.** concurrent-agents (real lock races, mutual exclusion, token security incl. cross-process tokenless-release refusal, stale takeover, multibrain isolation); malicious-restore (traversal/absolute/dotfile/brain-smuggling payloads vs the real restore chain + benign control); sync-recursion (guard depth semantics + pushAll/pullAny finally-release leak checks, offline). |
| `677701b` | **Timer lifecycle registry coverage.** registerTimer contract validation, replace-not-duplicate, unregister safety, stopAllTimers count/idempotence, live tick, and boot.reset() clearing timers (regression test for the original 9-interval bug). Registry verified complete: all 8 timer-owning modules (brain, context, cron, encounter, stream, sudo, watch, zen) ride it. |

**Reincarnation drill: PASSED.** Cold `git clone axolotl` to scratch → bun
install → `horcrux inspect` ✅ → `horcrux restore buffy.svg buffy2026` → 4
brains revived (axolotl/buffy/vant + state) → brain pipeline sandbox→vaf→qos→
escrow green → corpus 60 files → full loop 84/84 → CI 410/410. The horcrux
lifecycle works end-to-end from a cold machine.

**Drill findings (no code bugs):**
1. brain.loadCorpus() async default returns a Promise — probe error, not a bug
   (both modes return 60 files when awaited / {sync:true}).
2. Horcrux content staleness: the buffy horcrux carries a stale pre-session
   axolotl brain (template identity, empty lessons) captured before the session
   started. Horcruxes are point-in-time snapshots — refresh before relying on
   them for cross-brain state. Noted for the next export.
3. `bin/vant.js health` reports 'not initialized' after restore because the
   root-level check ignores per-brain subdirs — cosmetic; per-brain check via
   MODEL_PATH works.

**🔴 PRODUCTION HAZARD (product decision needed):**
`SelfHostedProvider.isConfigured()` is hardcoded `true` ("always viable —
uses generic git CLI"). Any `sync.pushAll()` therefore broadcasts REAL git
operations (`git add -A` → `git commit` → `git push -u origin`) in whatever
CWD it runs in. **Proven live during test development:** the first recursion
test draft triggered a real commit ('recursion-leak probe') — caught and
soft-reset before any push (child had no credentials). The committed test
neutralizes selfhosted at prototype scope. Options: (a) require explicit
config (VANT_SELFHOSTED=1 or selfhosted.url) to mark configured, (b) keep
always-on but add a dry-run/env guard in sync.pushAll. Recommend (a).

**Verification:** full loop ALL-GREEN (87 suites), runner 37/37, drill clone
CI 410/410.

---

## Session (2026-09-21 — fs→storage wave F-3: bin/ census + first bin/ migrations)

**Scope:** bin/ had never had a full census (~100 raw fs sites across 20 files).
Triaged by risk; migrated the genuine models-data sites, documented the rest.
One commit per module, runner green after each.

| Commit | What |
|--------|------|
| `fe02297` | **bin/clean.js** — `vant clean cache` now deletes models/ cache files through FileStorage (sandbox + vaf chain gates every unlink); verified existing-delete / missing-no-op / traversal-blocked. cleanLogs (process logs) + cleanTmp (OS dirs incl. bare `/tmp` sweep — flagged aggressive, NOT changed) documented stay-on-fs. |
| `c3113e5` | **bin/load.js** — `loadModel()` brain-file content reads ride the store; enumeration stays on fs. Traversal probes re-verified: `../../lib` exits 1 via own guard, `../lib` throws `SECURITY_PATH_TRAVERSAL` at vaf (R-6 gate intact). |
| `f7942fe` | **bin/health.js** — checkModel/checkDirs brain access (identity.md/.txt, .state.json) via FileStorage `has()`/`read()`; config/app-env probes + dir checks stay on fs (app-config class). Verified parity on missing brain + positive path (buffy brain; identity uses `NAME:` so no `MODEL:` line — correct, not a regression). |

**bin/ census verdict (stay-on-fs, documented):** boot.js (artifact SVGs + env
file reads), lock.js token file (repo-root process file), brain-unlock/snapshot/
stego/horcrux (binary artifact SVG/PNG reads, path-gated at CLI), audit.js
(lib/bin source scans = codebase introspection), clean.js logs/tmp (process/OS),
format-test/build-test (test fixtures), sync.js (git plumbing).

**Gotcha worth remembering:** a commit message containing the literal string
".env" trips Freebuff's sensitive-file hook — reword, don't fight it.

**Next candidates:** remaining bin/ sweeps if any models-data sites surface;
test-gap trio (concurrent agents, malicious backup restore, sync recursion);
DEAD_EXPORTS.md long tail; fresh-clone reincarnation drill.

---


| Commit | What |
|--------|------|
| `9c0cd0b` | **auth.js** — lockout persistence (`.circuit-auth.json`) via FileStorage; lib/auth.js now 0 raw fs. Verified: recordFailedAttempt round-trip persists through the store. |
| `29190a0` | **vaf.js** — blocked-IPs (`.circuit-vaf.json`) + audit append (`.audit.log`, read-modify-write) via FileStorage (lazy require to dodge the storage↔vaf cycle); 0 raw fs calls. Verified: block→persist→isBlocked round-trip, audit line written. |
| `00b7d43` | **qos.js** — CircuitBreaker full-mode `_load/_save` route through FileStorage when basePath is the models tree. **Bonus bug:** `audit` was never imported — every rate-limit block / circuit-open trip threw a swallowed ReferenceError. Lazy audit shim added; full-mode trip→persist→reopen verified. |
| `6c645bb` | **escrow.js** — budget persistence (brain-scoped orgchart store) via FileStorage; 0 raw fs. Verified: setBudget → fresh-module reload. |
| `bb86477` | **transform.js** — section-2 brainStorage restore (multibrain brains-object + legacy files-array) writes through `_getStore()`; (R-6) payload brain names charset-gated. Verified: probe restore writes `identity.md` + `notes/probe.md` through the store with auto-mkdir. |
| `5b3ca91` | **SECURITY FIX — partial-cache hole.** The gate→sandbox→vaf→storage→gate require cycle let `gate._getSandboxMod` and `storage._getVaf` cache PARTIAL modules mid-init: vaf path checks were silently skipped on EVERY storage.write/read, and gate trusted the unconfigured stub. 3 security-hardening tests failing since `29190a0`. Both caches now verify the member they rely on before caching and retry until the module finishes init. |

**Verification:** full test loop 0 failures, runner 37/37, security-hardening all green.
Traversal probe (`../../escape` write) now throws `VAF_PATH_BLOCKED`; configured-deny is enforced.

**Remaining fs census (documented stay-on-fs per prd-storage.md):** storage.js layer
itself, brain.js internals, readdir-style enumeration (pattern-glob limitation),
binary artifacts (stego/backup SVG+PNG), codebase introspection (legal/compute/
vant/.git), contained+sudo-gated `vant_storage_*` MCP tools, server TLS certs +
static file serving, transform horcrux SVG I/O (path-gated at CLI). Nothing
models-data-shaped bypasses the store.

**Next candidates:** test-gap trio (concurrent agents, malicious backup restore,
sync recursion); DEAD_EXPORTS.md long tail; fresh-clone reincarnation drill.

---

## Session (2026-09-21 — fs→storage wave F-1: small modules + census refresh)

**Context:** Pivoted back to fs→storage per dhaupin (R-track done). Fresh census across lib/ classified every remaining raw fs site. **BONUS SECURITY FIND:** transform restore()'s legacy privateBrains path called `_safeBrainName`/`_modelsRel`/`_getStore()` — **defined nowhere** (R-3's batch edit landed call sites, not definitions) → every legacy-horcrux brain restore silently failed with swallowed ReferenceErrors. Fixed + verified round-trip.

| # | Item | State |
|---|------|-------|
| FIX | (`c7412a4`) **transform restore helper defs** — defined once (islands pattern); legacy privateBrains restore now writes brain files through the models store (verified: 0 files + swallowed error → 1 file written) | done |
| V-1 | (`2266e42`) **vibe.js** — mood.ini through brain-scoped FileStorage; read contract null→default. vibe 11/11 | done |
| V-2 | (`1571b85`) **schema.js** — brain.json/_core.json through FileStorage; fileName charset-gated (was straight path.join). schema 10/10 | done |
| V-3 | (`0a71939`) **context.js** — _gatherStatic reads through models-root store; secondary-brain names gated. Enumeration stays fs (PRD #7) | done |
| V-4 | (`1c6f145`) **search.js** — dead `_stat`/`_readDir` helpers removed (zero callers). search 22/22 | done |
| AUD | **Classified as staying on fs (PRD #7):** legal.js (LEGAL.md/LICENSE repo-root docs), compute.js (codebase connector enumeration), vant.js (lib dir discovery), search getCurrentCommit (.git internals), mcp autoWire + contained vant_storage_* (by design), agents/tmp/backup enumeration+binary (documented exceptions), brain/storage/transform remainder (the layer itself + horcrux artifacts) | done |

**Remaining genuinely-migratable fs sites:** near zero in lib/ — the models-data I/O is now routed through the storage layer chain. What's left is enumerated metadata (readdir withFileTypes), binary artifacts (stego/backup images), the storage layer itself, and codebase-introspection reads — all documented exceptions.

---

## Session (2026-09-21 — R-5/R-6 + cleanups: the R-track is DONE)

**Context:** Completed the remaining R-roadmap. **BONUS FIND:** bin/snapshot.js was resurrectable and inspectHorcrux had a shadow-var bug that crashed the horcrux inspect CLI on EVERY file — found while testing the resurrection.

| # | Item | State |
|---|------|-------|
| R-5 | (`4db2c29`) **snapshot.js un-staled** — deriveOutput kept repo-RELATIVE (vaf blocks absolute /home/... as sensitive prefix; the "snapshot is dead" claim was just this). --output clamped inside repo + vaf-checked; agent/password filenames charset-validated. Round-trip verified: snapshot create → horcrux inspect VALID. **BONUS: lib/transform.js inspectHorcrux had a shadowed inner `let data`** — outer stayed undefined after successful parse → data.timestamp TypeError on every inspect; fixed, buffy horcrux + fresh snapshot both inspect clean. Also audited bin/health/summary/clean/audit/boot/backup/load/lock/watch: remaining fs uses are codebase-metadata (readdir lib/bin, package.json) or pid/lock tokens — NOT models data; no migration needed per PRD #7 | done |
| R-6 | (`22dfbe5`) **name→path sweep** — bin/load.js model arg (vaf.check alone allowed `sub/dir`; charset-gate now), bin/branch-manager brain-from-git-status, bin/horcrux brain-stack from state.json (malicious state.json could have redirected boot scans), bin/node.js saveBrain file names (probable writer of the models/private/undefined artifact), lib/agents listProtos/listFolders brainName entries. Confirmed already-clean: skills loadProto/loadFolder, canvas, islands, brain (_validBrainSegment), tmp | done |
| C-1 | (`c00a8c8`) **transform dead block removed** (1KB if(false) + orphaned catch fragment; node-script removal + syntax check) | done |
| C-2 | (`c00a8c8`) **escrow store brain-scoped** — models/private/<brain>/orgchart/escrow.json default (pushBrain-aware, config override kept); probe budget persisted to models store; .agent_tmp NOT recreated; probe budgets scrubbed | done |
| V-2 | Full module loop exit-0 after each commit; runner 37/37; orgflow 18/18 | done |

**Remaining from the old audit queue (lower priority):** bin/sync.js axolotl-branch awareness (pushes DEFAULT_BRANCH=main), dead-export removal per DEAD_EXPORTS.md, test gaps (concurrent agents, malicious backup restore, sync recursion).

---

## Session (2026-09-21 — Org/Teams BUILD: O-1..O-8 all landed)

**Context:** dhaupin greenlit the build ("run it all", PRD recommendations adopted for D-1..D-5). The full orgchart stack is now real: IDs internally, name-or-ID everywhere, brain-scoped stores, operator grant CLI, cascade+dryRun, REAL horcrux restore. **The reincarnation test passes**: org → dept → team → role → spawn → assign → gather → wipe → restore → everything back incl. brain bindings.

| # | Item | State |
|---|------|-------|
| O-1+O-3+O-4 | (`7a1c01f`) **Resolver + FK IDs + contract** — `_resolve{Org,Dept,Team,Role}Ref` (exact-ID, then unique case-insensitive name; context-scoped role resolution within a team); creates+assign+listings route through it, IDs stored internally (cascade code started working the moment FKs were consistent); assign rejects non-string agentId [E_INVALID_AGENT]; spawn binds current brain (was always null); createRole sync + validated + dup-checked; error contract: throw for misuse, {error,code} for policy denials | done |
| O-2 | (`7a1c01f`) **Integrity** — delete{Org,Dept} return `{cascaded:{depts|teams:[ids]}}` + emit counts; dryRun option on all three deletes; zero orphans verified after deletes | done |
| O-5 | (`7a1c01f` + `fb65b00` fix) **Operator grant path** — `bin/org.js`: `grant` (scopes + canWrite/canSpawn caps + sudo task), `status`, `config --set-operator-scopes` (persisted default), `demo` (full flow, uses boot().init — NOT boot() which is islands/prompt). F-1's two-layer trap documented: boot scopes alone do NOT flip DEFAULT_CAPABILITIES | done |
| O-7 | (`fb65b00`) **Stores brain-scoped** — teams → `models/private/<brain>/orgchart/teams.json`, agents registry → `orgchart/agents.json`, resolved PER CALL (pushBrain moves them); safe-charset brain-name guard; config override preserved; legacy `.agent_tmp` only when brain module unusable. SPLIT registry store from models-root store: loadProto/loadFolder were probing models/-relative paths against the `.agent_tmp` basePath — brain-scoped proto loading silently broken, now reads through a models-root store with correct relpaths | done |
| O-8 | (`9066275` + `7a1c01f`) **Horcrux single-source** — transform gatherTeams/gatherAgents2 both delegate to module `gatherState()` (no more store-file fs read / dual formats); restore consumes `teams.restoreState()` (accepts Map-entries AND legacy array format) and `agents.restoreState()` (REAL restore — was `push('agents')` label-only; gatherState now carries full records incl. brain; empty array = wipe); agents.js duplicate export deduped | done |
| O-6 | (`9066275`) **test/orgflow.test.js** — 18 e2e tests, promise-aware harness (async restore/delete — a sync harness lies): full flow, negative paths, dryRun/cascade, listings by name+ID, brain binding, reincarnation round-trip. 18/18 exit 0 | done |
| V-1 | Full module loop all exit-0 (earlier "FAIL" lines were grep false-positives on test NAMES containing 'error'); `test/runner.js` 37/37; horcrux validate + p_<pw> re-verified after transform changes | done |

**Reincarnation verified end-to-end** (`/tmp/qc_reincarnate.js`): BUILD ok → GATHER (teams2 orgs=1, agents=1) → WIPE (maps cleared + stores deleted) → RESTORE (orgs=1 depts=1 teams=1 roles=1 assigns=1, agents=1) → VERIFY (org roundtrip by ID, listDepts by name, getAgentBrain='vant', agent record back, store persisted) → REINCARNATION-PASS.

**Open follow-ups:** transform.js legacy `if (false)` block (dead store-file write path) can be deleted next cleanup; escrow.js still defaults its store to `.agent_tmp/escrow.json` (same O-7 treatment would apply); bin/org.js demo hardcodes 'vant' brain docs; R-5 bin sweep + R-6 name-validation sweep still queued.

---

## Session (2026-09-21 — Succession/Audit migration + memory maintenance)

**Context:** Continuing the fs→storage cohesion pass (superseded by newer sessions above). Brain.js (slices 1-5) + mcp.js are done; next per the audit are the small JSON-store modules, then islands/tmp/skills, transform.js last. `labs/MEM.md` restored this session (was a stale 2026-09-19 crash dump).

| # | Item | State |
|---|------|-------|
| M-0 | **MEM.md convention settled** — it's a tmp-style scratch dump space (dump in-flight state freely, NO commit ceremony, nothing precious; durable state lives HERE in TASKS.md). Earlier template/history interpretations both superseded. | done |
| S-1 | **succession.js fs→storage** (`a3c0322`) — `_succession.json` config + `.ledger.json` through FileStorage; fixes module-load path freeze (PUBLIC_DIR/LEDGER_PATH captured once → `getStackTrustLevels`/`getStackLedgers` pushed-brain had NO effect, stack reads returned the original brain every time). | done |
| S-2 | **audit.js fs→storage** (`82c9429`) — ledger through FileStorage keyed by current brain path (follows pushBrain); rotate() archive clamped into contained `models/audit-rotate/` (legacy archiveDir param was never passed by any caller and accepted uncontained paths). Verified: no `storage:*` event listeners exist → no audit↔storage re-entrancy. | done |
| S-3 | Buffy priv-brain lessons + push. | done |
| I-1 | **islands.js fs→storage** (`d089146`) — manifest + static-island brain files + status/populated checks through FileStorage; manifest save via store (format.saveFile silently fell back to raw fs when the secured read was denied). FIXED load() contract bug: static islands returned the format.parse wrapper object as `content`; consumers expect the raw text string per the islands.load() contract. createIsland() validates island names before path use. Zero raw fs sites remain. | done |
| T-1 | **tmp.js fs→storage** (`aae610d`) — put/get/delete/clear through FileStorage on top of the existing full security chain. FIXED _getPath(): getBrainStorage() has no `.path` → every space silently wrote to `./storage` outside models; spaces now anchor at `<models>/tmp-space/<space>` (myStuff flattened to match brain.js slice-2). clear() deletes per-entry through the store (flat namespace) instead of recursive rmSync. | done |
| K-1 | **skills.js fs→storage** (`ee1dc79`) — manifest + loadProto/loadFolder reads through FileStorage. FIXED unvalidated name interpolation into vant-skill-{name} paths; safe-charset validation (islands pattern). Enumeration stays on fs (pattern-glob limitation). | done |

**Next after this session:** see the R-1..R-6 roadmap below.

### fs→storage Refactor Roadmap (R-1..R-6)

Migration pattern (validated across 13 modules so far): FileStorage on the models root, `path.relative` for store-relative paths, `read()`→null / `has()`→bool / write=atomic+mkdirs contracts, safe-charset validation for any name that becomes a path segment, per-call path resolution for anything that must follow `pushBrain()`, enumeration stays on fs (pattern-glob limitation). Verify each with the full test loop + `node test/ci.js` (408/408), one commit per module.

| # | Task | Details | Est. size |
|---|------|---------|-----------|
| R-1 | **stego.js** — DONE (`50ddd14`): binary artifacts (PNG pixels) at caller paths → stays on fs BY DESIGN per PRD standard #7, documented. Hardened: encode() paths required + atomicWrite output (crash can't truncate horcrux). FIXED decodeFromBuffer — referenced pwd/meta from decodeSvg's scope, every call threw ReferenceError (tests only checked typeof). Also: storage.js now exports atomicWrite/readJson/writeJson; module-level readRaw/writeRaw factory shortcuts still exist (P1-17 "removed entirely" claim stale — flagged to R-4). | done |
| R-2 | **backup/sync/server** — DONE. backup (`d3abb57`): SVG binary stays fs; JSON artifacts → atomicWrite; backupPath anchored at models root (was cwd-relative); outputPath now required for horcrux/json. sync (`cdce966`): .providers.json + privacy config → FileStorage, per-call paths (pushBrain applies); FIXED hybrid_getPrivacyConfig — undefined PRIVACY_FILE, every call + whole hybrid_* cluster threw ReferenceError. server (`dfeed08`): Static.serve containment check compared RELATIVE join vs ABSOLUTE root — always false, EVERY request returned null (traversal "protection" was total denial, feature was dead). Fixed + verified 6 escape vectors blocked AND legit files now serve. | done |
| R-3 | **transform.js** — DONE (`a742e20`): **SECURITY FIND** — restore() interpolated horcrux-controlled brain names into `path.join('models/private', name)`; a slash/dotdot name relocates the base and `vaf.validateSafePath` passes relative to the ESCAPED base (verified). Now: `_safeBrainName`/`_safeBrainFilePath` charset guards on all payload-controlled names/paths; brain-tree reads + file writes via models FileStore; horcrux artifacts stay fs (text, caller paths) but vaf-checked + atomicWrite. Verified: full horcrux round-trip (179 files, 324KB, validate=true) + traversal blocked. 15 batch replacements via node-script. | done |
| R-4 | **storage.js self-audit** — DONE (`abee55b`): FIXED `_getFilePath` — silently stripped '/'/'..' (making its own containment check dead code); now rejects loudly. `readRaw`/`writeRaw` factory shortcuts kept RAW BY DESIGN with contract documented (live callers: lock.js races, brain.js bootstrap window — pipeline-free variants are required; P1-17 "removed entirely" claim corrected). Executable audit script: all 5 checks green. | done |
| R-4 | **storage.js self-audit** (56 sites) | storage.js IS the layer — its internal fs calls are the implementation. Audit only: (a) ensure every method that takes caller paths runs the containment/VAF chain, (b) no path can bypass atomicWrite on write, (c) document which methods are raw-by-design vs secured, (d) resolve the readRaw/writeRaw factory-shortcut question (still exported despite P1-17 claim). | medium |
| R-5 | **bin/* fs consumers** | CLI layer reads models via lib APIs mostly; sweep for direct models-tree fs access and route through libs (health, summary, clean touch models paths). Low priority — bins run trusted-local. | medium |
| R-6 | **Cross-cutting: name→path validation sweep** | grep for template-literal/concatenated path segments across lib (`vant-skill-`-style bugs are likely still hiding). Apply the `_safeSkillName` pattern everywhere an external name becomes a path segment. Also hunt the `models/private/undefined` writer if the artifact ever reappears. | medium |

Also still open (from earlier sessions): `bin/sync.js` axolotl-branch awareness (pushes `${DEFAULT_BRANCH}` = main), dead-export removal per DEAD_EXPORTS.md, tests for concurrent agents / malicious backup restore / sync recursion leaks, and **bin/snapshot.js is stale** — its path.resolve()'d --output trips vaf's sensitive-prefix rule on absolute paths ("Path traversal blocked"); `bin/horcrux.js create` with a relative path is the working export tool (Buffy horcrux created+verified via it, see MEM.md).

### Agent Horcruxes

| Agent | File | Password | Created | Verified |
|-------|------|----------|---------|----------|
| Buffy | `models/public/vant/boot/buffy-p_buffy2026.svg` | `buffy2026` | 2026-09-21 (`bin/horcrux.js create`) | ✅ inspect + fromHorcrux + validateHorcruxData VALID (4 brains, buffy = identity.md + learnings.md) |

---

## Session Summary (2026-09-21 — fs→storage: brain.js slices 4-5 + mcp.js)

**Context:** Continuing the cohesion pass on `axolotl`. Slices 1-3 + citations/lock/resolution/prune/canvas/teams + timer registry were already committed (see prior summaries). This session finished brain.js and closed the mcp.js dir-scan gap.

**Result:** ALL green — full module suite clean + CI 408/408 (exit 0), one commit per item, pushed.

### Implemented This Session

| # | Item | Files |
|---|------|-------|
| B4 | **Brain slice 4 — brain discovery/enumeration + brain-tree reads** (~lines 1854-3323): `read`, `_loadBrain`, `hasBrain`, `readDir`, `loadStackCorpus`, `myStuff`, `updateMyStuff` (key validated), sandbox `read`/`exists` brain handlers, `switchBrain`/`getPublicPath`/`resolveBrainPath` existence probes → brain FileStore via `_bfs*` helpers + `_brainRel()`. Circular bootstrap window: `_bfs*` fall back to anchored fs on fixed models paths (storage.js requires brain.js at its module load — cannot construct FileStorage there). Dead closure in `loadStackCorpus` removed (undefined dirPath ref, never called); `listBackups` bug fixed (old code joined `getBrainStorage()` which has no `.path` → silently pointed at `./backups`; now `.basePath`). Enumeration stays on fs (pattern-glob limitation, prune.js precedent). | `lib/brain.js` |
| B5 | **Brain slice 5 — remaining brain-file write/delete**: `endEvolutionSession` state write → `_bfsWrite` (atomic, contained) instead of raw `fs.promises.writeFile`; `clearDropbox` deletes per-entry through the tmp-space store instead of recursive `rmSync`; listBackups shadowed fs require dropped. Leftover readdir/statSync sites are enumeration/metadata only — documented as staying on fs. | `lib/brain.js` |
| MCP | **mcp.js dir scans via storage**: `brain_discover` agents/skills + `brain_share` agent scans → `_mcpStore.listRaw` over models-root-relative globs (containment applies; listRaw returns [] on missing dirs so redundant existsSync guards removed). Raw-tools audit: `vant_storage_listRecursive/rm/cp/mkdir` stay on fs **by design** — contained via `_containedModelPath` + sudo write-gated (b882428); readRaw/writeRaw were removed in P1-17. Raw-tools migration confirmed complete. | `lib/mcp.js` |

### Lessons

- **str_replace fails on this big file even before the documented ~line-2200 mark** (brain.js line ~2118, a one-line 1-occurrence edit failed repeatedly while appearing byte-identical). The validated node-script fallback (`scripts/_fix_*.js`, exact-match-or-throw) is now the default for brain.js edits — also batch all of a file's edits into ONE script run (a multi-edit call partially applied: the first replacement landed, the rest were skipped, leaving `_statePath` deleted while still referenced; grep caught it before any damage).
- **storage bootstrap window is real**: storage.js requires brain.js during its own module load, so brain.js cannot construct FileStorage at module-load time — `_bfs*` anchored-fs fallbacks on fixed models paths are the workaround, with a one-time warn.

**Working-tree notes:** untracked `private/` (agent priv brain, stays local) and `scripts/_fix_*.js` (one-off migration helpers — do NOT commit).

---

## Session Summary (2026-09-20 — Cohesion Pass: fs→storage + Timer Registry)

**Objective:** Execute the recommended order from the cohesion audit: kill lying stubs (1), unify security chain (2), fs→storage migrations (3), cosmetic sweeps (4), timer lifecycle (C-1)
**Result:** ALL green — 1,147 module tests + CI 408/408 (exit 0), one commit per item, pushed per item

### Implemented This Session

| # | Item | Files |
|---|------|-------|
| CO-1 | **sync.pullAny actually pulls** — was returning `success: true` without pulling a single brain file; now symmetric with pushAll (recursion guard, circuit breaker, escrow budget, provider-state, real `provider.pull()`) | `lib/sync.js` |
| CO-2 | **islands.status()** — distinguishes unknown island vs wired-but-never-populated vs loaded (the 3 cases `load()`'s null blurred); surfaced as MCP `vant_island_status` | `lib/islands.js`, `lib/mcp.js` |
| CO-3 | **Shared gate (lib/gate.js) — closed real security hole** — trust/market/memory clones compared `sandbox.can` *method references* for stub detection, but `can()` is a prototype method shared by all instances → gates allowed everything even after explicit configuration (verified: `trust.record` succeeded under `canWrite: false`). All three now use `gate.requireCapability`, which checks `_explicitlyConfigured` | `lib/gate.js`, `lib/trust.js`, `lib/market.js`, `lib/memory.js`, `test/security-hardening.test.js` |
| CO-4 | **fs→storage: citations.js** — pattern-setter; its old capability checks were doubly broken (threw inside their own try{}, never denied) | `lib/citations.js` |
| CO-5 | **Error/version cosmetics** — 11 raw `throw new Error` → VantError with codes; 18 hand-typed display versions → `require('./version')`. Horcrux `'0.8.6'` deliberately untouched (format contract) | `lib/context.js`, `lib/do.js`, `lib/mcp.js`, +14 modules |
| CO-6 | **fs→storage: lock.js** — raw storage variants (locks must operate during races) + atomicWrite replaces the manual temp dance + brain-name validation on interpolated paths | `lib/lock.js` |
| CO-7 | **fs→storage: resolution.js** — ledger + brain-file edits through fileStore; dead `_removed_saveLedger`/`_ensureResolutionsDir`/`getResolutionPath` removed | `lib/resolution.js` |
| CO-8 | **fs→storage: prune.js** — ledger/LTC/scan reads+deletes/listPrunable through fileStore + shared gate; dir enumeration + mtime age stay on fs (pattern-glob/metadata limitations, paths anchored) | `lib/prune.js` |
| CO-9 | **fs→storage: canvas.js — closed live traversal hole** — artwork names were interpolated into raw `fs.writeFileSync` paths unguarded; storage's VAF check now blocks `save('../../evil')`. Removed stray console.log in embed() | `lib/canvas.js` |
| CO-10 | **fs→storage: teams.js** — the orgs/depts/teams/roles/assignments JSON store through FileStorage; config-driven `teams.store` path preserved | `lib/teams.js` |
| CO-11 | **Boot timer lifecycle registry (audit C-1)** — `registerTimer`/`unregisterTimer`/`stopAllTimers`/`getTimers`; `reset()` stops all. All 8 bare `setInterval` sites migrated (`brain.metabolize`, `context.heartbeat`, `cron.<id>`, `stream.leaseSweep`, `sudo.revalidate`, `encounter.<id>`, `watch.<n>`, `zen.<n>`); per-instance names for classes; boot-unavailable fallback = bare setInterval (lazy-require guard) | `lib/boot.js` + 8 modules |

### Lessons

- **storage VAF is the traversal gate — route name interpolation through it.** `vaf.checkPathTraversal` normalizes paths first, so prefix strings that end in `..`-adjacent chars can absorb traversal; validate *names* before interpolation (lock brain-name, canvas artwork-name).
- **str_replace fails silently past ~line 2200 on huge files** (transform.js). Validated node-script replacement (exact-match, throw on mismatch) is the reliable fallback.
- **Prototype methods can't prove stub-ness.** Capture-compare tricks (`sandbox.can === captured`) are always-true; the instance's `_explicitlyConfigured` flag is the real signal.

---

## Session Summary (2026-09-20 — Sudo Wiring + P3)

**Objective:** Wire real sudo escalation per prd-sudo.md, close handoff gaps (phantom test files), start P3 quality work  
**Result:** ALL green — 1,144 module tests (incl. 2 new suites: sudo-integration 21, security-hardening 19) + runner 37 + coverage 41 + CI 406/406 (exit 0)

### Implemented This Session

| # | Item | Files |
|---|------|-------|
| S-1 | **Sudo whitelist + TTL + revalidation** (prd-sudo.md §3-5 was documented as "implemented" but had never been committed). `ESCALATION_WHITELIST` per-service policies (boot/network/storage/mcp/agents/trust/default), TTL-capped grants (exact expiry — grants live ONLY in the TTL map, never as static scopes), revalidation loop (extends revalidatable services, revokes others), boot-time loop start, audit events (`sudo:escalation_requested/granted/denied/revalidated`) | `lib/sudo.js`, `lib/boot.js` |
| S-2 | **can(cap) → sudo.can(taskId, scope) delegation** (the PRD's core arrow). Sandbox consults sudo when the task exists; standalone sandboxes keep static-capability fallback. Storage `*Secured` methods escalate via the service path before operating | `lib/sandbox.js`, `lib/storage.js`, `lib/sudo.js` |
| S-3 | **P0-7 actually closed** — `ConfigStorage._load()` and `config.getConfig()` still used `require()` on user-writable `.js` configs (RCE despite audit claiming fixed). Both now evaluate in a bare `vm` context: no require/process/fs, 1s timeout; benign data configs load, hostile ones fail closed to defaults | `lib/storage.js`, `lib/config.js` |
| S-4 | **P1-15 actually implemented** — `vaf.checkPathTraversal` did NOT decode anything: `%2e%2e%2f`, `..%2f`, double-encoded `..%252f`, NFKC-normalized `‥`, and overlong UTF-8 (`%c0%ae`) all sailed through. Now: iterative decode-until-stable (max 5), checks raw AND decoded variants, malformed percent-encoding fails closed. Legit paths (incl. Unicode filenames) still pass | `lib/vaf.js` |
| S-5 | **Trust `_checkRateLimit` restored** — collateral damage from the corruption cleanup (the stray-pair edit sat inside `_defaults` next to that function; removal swallowed it). Every `trust.record()` call threw. Also caught: `trust.test.js`/`market.test.js` summary lines were broken (`Passed: 12 Passed: 8 Failed: 0`) — they MASKED these 8 failures in the previous session's "all green" | `lib/trust.js`, `test/trust.test.js`, `test/market.test.js` |
| S-6 | **Phantom test suites committed** — `test/sudo-integration.test.js` (21 checks: whitelist governance, TTL semantics, revalidation loop, sandbox delegation, storage escalation, audit events) and `test/security-hardening.test.js` (19 checks: P0-6/7/8/9, P1-11/15/16 verified as REAL behavior, plus corruption-class regression guards) | `test/sudo-integration.test.js`, `test/security-hardening.test.js` |
| S-7 | **P3 magic numbers → tunable config** — `sudo.REVALIDATE_INTERVAL_MS` and QoS `RateLimiter` defaults now read `VANT_*` env vars with the existing defaults (follows the codebase's established `VANT_ESCROW_*` convention) | `lib/sudo.js`, `lib/qos.js` |
| S-8 | **P3 dead-export sweep** — automated cross-reference scan complete; ~150 zero-consumer exports across ~35 files cataloged in `labs/DEAD_EXPORTS.md` with false-positive caveats and a safe removal process. Deliberately NOT mass-deleted (see that doc's reasoning re: the c7009da corruption incident) | `labs/DEAD_EXPORTS.md` |

### Lessons

- **Test summary lines can lie.** A broken formatter (`Passed: X Passed: Y`) masked 8 real failures; grepping for `✗` (not just the summary) is the reliable check.
- **Claim-vs-reality:** audit docs marked P0-7 and P1-15 "fixed"; neither was. The new security-hardening suite now pins the real behavior.

---

## Session Summary (2026-09-20 — Consistency Pass)

**Objective:** Absorb the repo, establish a real test baseline, fix gaps/errors to a consistent usable state  
**Result:** ALL test files green — 1,096 module tests + runner 37 + coverage 41 + CI 406/406 (exit 0)

### Fixed This Session

| # | Fix | Files |
|---|-----|-------|
| C-1 | **Pipeline export shadowing** — `run: runtimeRun` and `getStatus: getRuntimeStatus` shadowed the middleware executor in module.exports, so every `pipeline.run()` call returned `{error: 'Not running'}` (silently breaking storage `*Secured` variants and `brain.loadFile/saveFile`) | `lib/pipeline.js` (renamed to `runtimeRun`/`runtimeStop`/`runtimeStatus`) |
| C-2 | **Code corruption: stray `gatherState, restoreState,` pairs** injected mid-expression (38 in trust.js — incl. inside `Math.max()` making scores NaN; 28 in governance.js; 1 in market.js exports). Kept the legit horcrux export (transform.js calls `market.gatherState` / `governance.restoreState`) | `lib/trust.js`, `lib/governance.js`, `lib/market.js` |
| C-3 | **Safe-by-default capability gates** — memory ECAP, trust record, market list were hard-denied under the untouched default sandbox stub (deny-by-default hardening broke flows that never got the escalation path). Added stub-vs-configured detection (allow + one-time warning under default stub; strict enforcement once sandbox is explicitly configured via options/setScopes/setCapabilities) — mirrors storage.js `_checkWriteSafe` | `lib/memory.js`, `lib/trust.js`, `lib/market.js`, `lib/sandbox.js` (`_explicitlyConfigured`), `lib/pipeline.js` (sandbox handler) |
| C-4 | **embed pipeline mode** — `embed.generate` ran at PRIVATE (canWrite) but embedding is compute/read; moved to PUBLIC. This also unblocked memory.find/embed tests after C-1 made pipeline real again | `lib/embed.js` |
| C-5 | **QoS missing `reset()`/`resetRateLimiter()`** — `npm test` smoke + `bin/rate.js reset` crashed | `lib/qos.js` |
| C-6 | **Axolotl brain tests** — `models/private/` is gitignored by design, so tests asserting a committed axolotl brain can never pass on a fresh clone. Made them self-seeding (create-if-missing, never clobber) | `test/brain.test.js` |
| C-7 | **CI runner killed by required binaries** — syntax check did `require()` on `bin/*.js`; executing `bin/backup.js` called `process.exit(0)` and silently killed the whole runner mid-run. Now compile-only via `vm.Script` (shebang-stripped, CJS-wrapped). Also fixed JSON mode (stdout was stubbed before printing the JSON) and SIGKILL watchdog for servers that ignore SIGTERM (mcp.js, watch.js) | `test/ci.js` |
| C-8 | **brain-unlock stale default** — default horcrux path pointed at deleted `hypha-brain.svg`; now points at the existing axolotl horcrux | `bin/brain-unlock.js` |
| C-9 | **pipeline.test.js** — updated assertions from removed shadowed aliases (`start`/`stop`) to `runtimeStop`/`runtimeStatus` | `test/pipeline.test.js` |
| C-10 | **bump.js bare-invocation footgun** — `node bin/bump.js` with no args silently bumped the version and created a git tag. Fired during this session's CI run (bumped repo to 0.8.12 + tags v0.8.7-9, reverted). Now requires explicit `<major|minor|patch>` plus `--yes` to apply | `bin/bump.js` |

### Known Pre-existing Quirks (not blocking, worth noting)

- `test/brain.test.js` self-seeds `models/private/axolotl/` — runtime artifact, gitignored, by design
- Storage default-stub warning fires once per process ("Sandbox not configured...") — expected until boot configures capabilities
- `bin/sync.js` push writes credentials to a temp helper then pushes `${DEFAULT_BRANCH}` (main) — needs axolotl branch awareness someday
- `labs/TASKS.md` previously listed test files (`security-hardening.test.js`, `sudo-integration.test.js`, `sudo.test.js`) that don't exist in `test/` — handoff doc referenced tests never committed
- **LESSON:** never `require()` or spawn CLI binaries from a test runner without arg-guard auditing — `bin/bump.js` mutated the repo when CI's binary smoke test ran it (fixed in C-7 + C-10)

### How to Verify (fresh clone)

```bash
npm install
# Full module test suite (all test/*.test.js)
for f in test/*.test.js; do node "$f" || echo "FAIL: $f"; done
# CI runner (syntax + smoke + security)
node test/ci.js
# Smoke + coverage
npm test && node test/coverage.js
```

---

## Session Summary

**Objective:** Security audit and hardening of Vant axolotl branch  
**Approach:** Subagent-based exploration → targeted fixes → verification  
**Result:** 38 fixes applied, all core tests passing, defense-in-depth security posture achieved

---

## Phase Completion Status

### ✅ P0 — Critical Crashes/Exploits (10/10)
| # | Fix | Status |
|---|-----|--------|
| P0-1 | islands.js `save()` undefined `getBrain()` → `Storage.get('island')` | ✅ |
| P0-2 | islands.js `hydrate()`/`autoHydrate()` missing `await` | ✅ |
| P0-3 | sync.js missing `userCtx` in `saveProviderState` calls | ✅ |
| P0-4 | sync.js undefined `audit` variable | ✅ |
| P0-5 | remote.js missing `errors` import | ✅ |
| P0-6 | mcp.js `vant_call` arbitrary `require()` RCE | ✅ |
| P0-7 | storage.js `ConfigStorage` `require()` RCE | ✅ |
| P0-8 | transform.js restore path traversal | ✅ |
| P0-9 | sandbox.js `DEFAULT_CAPABILITIES` DENY by default | ✅ |
| P0-10 | brain.js TOCTOU (14 locations) | ✅ |

### ✅ P1 — High Security Hardening (10/10)
| # | Fix | Status |
|---|-----|--------|
| P1-11 | Path containment validation all file writes | ✅ |
| P1-12 | `vaf.sanitizeObject()` 10 storage write paths | ✅ |
| P1-13 | agents.js `delegateAsync`/`pollWork` security + Map fix | ✅ |
| P1-14 | mcp.js tool input schema validation enforcement | ✅ |
| P1-15 | vaf.js iterative URL decode + Unicode normalization | ✅ |
| P1-16 | storage.js `atomicWrite` symlink escape (O_NOFOLLOW) | ✅ |
| P1-17 | storage.js `readRaw`/`writeRaw` REMOVED | ✅ |
| P1-18 | brain.js format transformer content corruption | ✅ |
| P1-19 | backup.js password handling | ✅ |
| P1-20 | sync.js recursion guard try/finally | ✅ |

### ✅ P1.5 — Runtime Capability Alignment (4/4)
| # | Fix | Status |
|---|-----|--------|
| Boot scopes | `['read', 'write', 'network', 'spawn', 'execute']` | ✅ |
| Sandbox/sudo defaults | Aligned to boot scopes | ✅ |
| Sandbox test | Updated for deny-by-default | ✅ |
| Revert | DENY BY DEFAULT for defense-in-depth | ✅ |

### ✅ P2 — Architecture/Reliability (10/10)
| # | Fix | Status |
|---|-----|--------|
| P2-1 | brain.js mode routing consolidation | ✅ |
| P2-2 | islands.js manifest cache invalidation | ✅ |
| P2-3 | sync.js actual pull implementation | ✅ |
| P2-4 | sync.js 3-way merge/conflict resolution | ✅ |
| P2-5 | Provider operation timeouts (30s) | ✅ |
| P2-6 | agents.js per-agent isolation (AgentContext) | ✅ |
| P2-7 | Atomic writes shared utility | ✅ |
| P2-8 | Backup SHA256 checksums | ✅ |
| P2-9 | vaf.js prototype pollution fix | ✅ |
| P2-10 | agents.js split into 6 modules | ✅ |

### ✅ Sudo System — Time-Based Escalation (1/1)
| Component | Status |
|-----------|--------|
| Whitelist policies (6 services) | ✅ |
| Escalation with TTL/auto-revalidate | ✅ |
| Revalidation loop (30s) | ✅ |
| Sandbox integration | ✅ |
| Boot integration | ✅ |

### ✅ Documentation (5/5)
| Doc | Status |
|-----|--------|
| labs/prd-sudo.md | ✅ |
| labs/prd-brain.md | ✅ |
| labs/prd-agents.md | ✅ |
| labs/prd-storage.md | ✅ |
| labs/prd-security.md | ✅ |

---

## Current Security Posture (Axolotl)

| Layer | Configuration |
|-------|---------------|
| **Sandbox** | Deny-by-default: only `read` allowed; 8 dangerous caps require sudo |
| **Boot** | Default scopes: `['read']` only |
| **Sudo** | Default scopes: `['read']` only; 7 service whitelist policies |
| **Escalation** | Time-bounded (TTL), auto-revalidate/revoke, audit trail |
| **Services** | All 7 core services integrated + 30+ modules migrated |

---

## P3 — Next Steps (Low Priority)

### Code Quality
- [ ] Standardize error handling patterns across modules
- [ ] Extract magic numbers to config (timeouts, limits, TTLs)
- [ ] Add JSDoc to all public APIs
- [ ] Fix lint/typecheck if configured
- [ ] Remove dead code (unused exports, dead branches)

### Testing
- [x] Add integration tests for sudo escalation flows
- [x] Add security tests: path traversal, prototype pollution, symlink escape
- [x] Add MCP tool injection tests
- [ ] Add concurrent agent operation tests
- [ ] Add backup restore with malicious content tests
- [ ] Add sync recursion guard leak tests
- [ ] Test coverage target: >80% for security-critical modules

### Sudo Integration (from prd-sudo.md)
- [x] Integrate sudo escalation in 7 core services:
  - [x] network.js — `network` scope before fetch
  - [x] storage.js — `write` scope before writes
  - [x] shell.js — add whitelist check for `exec`
  - [x] mcp.js — add `compute:eval` to whitelist
  - [x] agents.js — `spawn`/`write` escalation
  - [x] sync.js — `commit`/`createBranch` escalation
  - [x] brain.js — `write` escalation
- [x] Update 30+ modules to use `sandbox.can()` instead of direct `sandbox.canX()`
- [x] Update 17 modules with `_checkWrite/_checkNetwork/_checkExec` to escalate
- [x] Add 5 missing whitelist scopes: `commit`, `createBranch`, `compute:eval`, `delete`, `admin`

### Documentation
- [x] API reference for all public modules (AGENTS.md, DEPLOY.md, README.md)
- [x] Architecture decision records (ADRs) for major changes
- [x] Security model documentation (labs/prd-security.md)
- [x] Contribution guide for sudo whitelist modifications
- [x] Migration guide for deny-by-default

### Labs Expansion
- [x] labs/prd-brain.md — Brain architecture PRD
- [x] labs/prd-agents.md — Agent system PRD
- [x] labs/prd-storage.md — Storage layer PRD
- [x] labs/prd-security.md — Security model PRD
- [ ] labs/adr/*.md — Architecture Decision Records

---

## Quick Reference

### Key Files Modified
| Module | Key Changes |
|--------|-------------|
| `lib/sandbox.js` | DENY-by-default, sudo integration, taskId support |
| `lib/sudo.js` | Whitelist, escalation TTL, revalidation loop |
| `lib/boot.js` | Sudo escalation for boot privileges |
| `lib/brain.js` | Mode consolidation, TOCTOU fixes, format transformer |
| `lib/islands.js` | Async fixes, cache invalidation |
| `lib/sync.js` | Actual pull, 3-way merge, timeouts, guards |
| `lib/agents.js` | Split into 6 modules, per-agent isolation |
| `lib/storage.js` | Atomic writes, SHA256, prototype pollution, RCE fix |
| `lib/transform.js` | Path validation, checksums |
| `lib/backup.js` | Password handling, checksums |
| `lib/vaf.js` | Iterative decode, Unicode, prototype pollution |
| `lib/mcp.js` | RCE fixes, schema validation, sudo for tools |
| `lib/remote.js` | Circular dep fix, errors import |

### New Modules Created
- `lib/agent-internal.js`
- `lib/agent-lifecycle.js`
- `lib/agent-delegation.js`
- `lib/agent-workflow.js`
- `lib/agent-communication.js`
- `lib/agent-metrics.js`

### Test Commands
```bash
# Run all tests
npm test

# Key test files
node test/test-sandbox.js      # 14/14
node test/agents.test.js       # 17/17
node test/islands.test.js      # 14/14
node test/sync.test.js         # 18/18
node test/mcp.test.js          # 6/6
node test/transform.test.js    # 5/5
node test/vaf.test.js          # 11/11
node test/backup.test.js       # 8/8
node test/prune.test.js        # 10/10
node test/sudo.test.js         # 7/7
node test/boot.test.js         # 15/15
node test/sudo-integration.test.js  # 16/16
node test/security-hardening.test.js # 26/26
```

---

## Handoff Notes

### Pass 19 - Bin Cold-Sweep + Fix (2026-09-23)

Scope: smoke every routed bin command cold (fresh dir + repo root), fix what broke, align help/docs with reality.

Fixed (10 real bugs): bin/test-all.js (spawned node ./bin/vant.js cwd-relative -> MODULE_NOT_FOUND in fresh dirs; now __dirname-absolute + cwd: ROOT; also stale lib cache assertion - exports { Cache } since T13b), bin/build-test.js (cwd-relative file checks false-failed; sandbox lazy-require was "./lib/sandbox" - broken, silently never loaded), bin/format-test.js (cwd-relative loadFile checks + asserted models/islands.json which never existed; real: models/public/vant/islands.json; now chdirs to repo root, 32/32 from any dir), bin/org.js (config.setFlag is in-memory only - crashed the advertised --set-operator-scopes path AND never persisted; now persists in the current brain config.json via saveBrainConfig, reads via brain-scoped config.get(key, null, { brain })), bin/snapshot.js (hard-refused every plain invocation though advertised everywhere; now self-grants on a FRESH sandbox per lib/sandbox.js own allow-with-warning contract, still refuses explicitly-locked-down sandboxes), bin/agent-spawner.js (agents.list() is async - sync call crashed; usage text said "vant agent ..." but the route is "vant spawn ..."), bin/tmp.js (every op threw EPERM - TmpSpace is sudo-secured and the bare CLI task was never registered; now boots vant-cli task + wires global._lock), lib/tmp.js + lib/shell.js (lock API misuse: acquire() returns a token, code called it as a release function -> "release is not a function" after write landed), bin/vant.js (unknown-command now suggests the closest real command via edit distance and exits 1 consistently), test/test-metrics.js + test/test-vant.js (asserted ghost exports: pre-59325b8 metric names and vant.framework absorbed in v0.9.6 - failed forever with zero signal; aligned to shipped API).

Verified working cold: test-all 17/17, format-test 32/32, build-test (cwd-stable), org grant/config/status round-trip, brain-registry, node-registry, brain-unlock, islands-boot, docs-build, tmp list/create/clean/stats, spawn list, secret, rate, migrate --status, snapshot full stego round-trip, hybrid banner + --set, distributed and all special handlers.

Sweep: bash bin/sweep.sh -> P=1783 F=0. Docs style + link checks PASS.

Help/docs alignment: bin/help.js branch detail self-ref (branch-manager was never routed), hybrid flags corrected to [-p|--public] [-r|--private]; bin/cli-standard.js marked as reference template (not routable, by design); docs/reference/cli.md + docs/integrations/hybrid.md updated (hybrid route name, tmp subcommands, test-all/build-test/format-test as routed commands, snapshot capability note, stale branch-manager row removed).

Key lesson (full version in models/private/axolotl/lessons.md): cold-smoke from a fresh dir, not just repo root - the dispatcher intentionally runs children in the caller cwd, so anything resolving from cwd is cwd-fragile by construction.

- **Branch:** `axolotl` (pushed to origin)
- **All fixes committed and pushed**
- **All core tests passing** (500+ tests)
- **Production-ready** with defense-in-depth security
- **Labs docs** in `/labs` for future reference
- **Ready for P3** when next session begins

---

## Historical: Horcrux Multibrain Restoration (2026-08-30 Session)

### Bug Fixed: Horcrux State Restoration (T27)

**Root Cause:** `lib/transform.js:gatherMode()` only read from `brain.getStack()` (snapshot-time brains), not all brains on disk via `brainDirs()`.

**Fix:** Augmented stack with any brains from `brainDirs()` not already in stack.

**Verification:** New horcrux correctly has `mode.stack: ['axolotl', 'vant']`, `mode.currentBrain: 'axolotl'`.

### Tooling Added (Persistent)

| Tool | Purpose |
|------|---------|
| `bin/sweep.sh` | Test health gate (full + `--quick` modes) |
| `bin/snapshot.js` | Verifiable stego-SVG brain horcrux |
| `models/public/vant/boot/axolotl-p_axolotl2026.svg` | First axolotl snapshot (reproducible via script) |

### Completed Legacy Cleanup (b-T Candidates — All Resolved)

All items from final `grep -E "backward|compatibility|deprecat|legacy|alias" lib/*.js` sweep resolved in T17/T17b/T18-T20:

- `lib/embed.js`: `embed`/`embedBatch` aliases → canonical `generate`/`generateBatch`
- `lib/encrypt.js`: `Encrypt.encode/decode/pbkdf2Sync` removed; stego migrated
- `lib/islands.js`: `getManifestSync` (test-only) removed; internal `_getManifestSync()` retained
- `lib/lineage.js`: `getHistory` orphan alias removed (zero callers)
- `lib/secret.js`: `getPassword/hasPassword/clearPassword` → `get/has/clear('brain')`
- `lib/transform.js`: `validateHorcrux` wrapper removed; callers → `validateHorcruxData` (now exported)
- `lib/transform.js`: `payload: parsed.payload` no-op removed

---

## Conventions (Active)

- **Version:** Pinned at **0.8.6** on axolotl branch — no version bumps
- **Commits:** Prefix `axolotl:` with imperative subject + `Co-authored-by` trailer
- **Tests:** Run `node test/runner.js` + specific test file before committing
- **Brain:** Lessons → `models/private/vant/lessons.md` (date-marked, most important at top)
- **Pipeline:** New write/read/delete ops default to `pipeline.run` unless bypass justified
- **No Backwards Compat:** Clean refactors only — no aliases, fallbacks, or shims

---

## Session Resume Procedure

1. `cd /workspace/project/vant && git status && git log --oneline -10`
2. Read `models/private/vant/lessons.md` for accumulated context
3. Read this file (labs/TASKS.md) for task state
4. Pick next `todo` in P3 section
5. Update this file on completion and commit
---

## Session (2026-09-23 — pass 20: dispatcher audit + fresh-dir routing guard)

**Deep dispatcher audit (bin/vant.js COMMANDS vs bin/ vs help):**
- Removed two duplicate keys that silently shadowed earlier routes:
  `audit`, `branch`, `repos` (later keys had won; now single entries).
- `api` was BOTH routed (`api: 'api.js'`) and inline-handled as a trifecta
  server mode — the duplicate route key shadowed the inline handler. Now:
  bare `vant api` = server; `vant api <sub>` = bin/api.js utilities
  (status/routes/call/docs). Duplicate-key footgun documented at the table.
- `git-branch` (bin/branch.js, repo-code branches) was unroutable for months
  (`branch` shadows it). Routed as `vant git-branch`.
- Help: added missing entries (test-all, git-branch, spawn, webhook),
  corrected `api` entry, removed phantom `notify`/`linear` from banner.
- mcp.js + cli-standard.js confirmed unrouted-on-purpose (standalone entry /
  doc template); noted in the COMMANDS comment block.

**Fresh-dir regression guard (test/fresh-dir-routing.test.js, 8 checks):**
Copies bin+lib+package.json into a tmp sandbox (no models/), runs routed
commands from a DIFFERENT cwd. Guards: test-all 17/17, build-test template
checks, format-test 32/32, help, unknown-command suggestion+exit 1, hybrid
banner, test-all --help. scripts/probe-fresh.js is the interactive variant.

**Bugs found & fixed this pass:**
1. bin/vant.js `vant help <cmd>` spawned `bin/help.js` cwd-relative →
   MODULE_NOT_FOUND outside repo root; also missing `return` raced the
   child's output vs the parent banner. Now __dirname-anchored + return.
2. bin/help.js duplicated console.log on one line (session-crash artifact).
3. test-core: installs without test/ crashed with raw ENOENT on readdirSync
   → graceful "No test files found" guidance, exit 1.
4. test-all: `test` check never passed where `vant test` exits 1 gracefully;
   test() harness now supports allowNonZero for graceful-failure checks.
5. format-test loadFile checks read repo-content files (models/…,
   docker-compose.yml) → false-failed in partial trees; now load the
   suite's own setup() fixtures (`.agent_tmp/format-test/*`), env-independent.
6. SYSTEMIC (9 files): bin/{load,sync,watch,setup,health,node,docs-build,
   lock,boot}.js lazy-loaded sandbox via `require("./lib/sandbox")` —
   cwd-dependent; outside repo root the catch swallowed MODULE_NOT_FOUND and
   the sandbox layer silently no-opped. All now `../lib/sandbox`
   (__dirname-relative). Verified: health OK, sandbox tests OK.

**Evidence:** fresh-dir guard 8/8; full suite 109/109; format-test 32/32
(in-repo AND fresh-cwd); test-all 17/17 both ways.

**Next candidates (unchanged + new):** P2 #26 work-item Map de-multiplexing,
fresh-clone reincarnation drill rerun, horcrux refresh, DEAD_EXPORTS long
tail, testBin "any stdout = pass" fragility, and a sweep for other
lazy-require paths in bin/ using cwd-relative `./lib` (fixed the sandbox
class this pass; grep for `require("\./` to find stragglers).

---

## Session (2026-09-23 — pass 21: P2 #26 de-mux, testBin, horcrux refresh, drill)

All five backlog candidates from pass 20 shipped.

**#5 cwd-relative lazy-require sweep (the sandbox bug class, finished):**
bin/{stego,bump}.js had the same broken `require("./lib/sandbox")` — fixed
to `../lib/sandbox`. Deleted bin/webhook.sh entirely: referenced nowhere,
a stale shell duplicate of webhooks.js, and it interpolated user args
straight into `node -e` JS strings (shell injection). Wired the `webhook`
alias route the banner always claimed (dispatcher had no route; webhooks.js
usage-on-unknown makes the alias safe). cli.md documents the alias.

**#1 P2 #26 de-multiplexed (work-item Map ownership):**
lib/agents/internal.js gains `_workItems`; work.js bookkeeping
(setDeadline/retry/escalate/setPriority) now reads/writes it via
_findWorkItem() — _workItems first, then legacy _messages for bare keys
ONLY (namespaced 'conv:*'/'event:*' keys are core.js domains and are
skipped). The first version of the fallback was too promiscuous and the
NEW test caught it: setPriority('event:foo') would have set .priority ON a
listener array and returned 9. Regression pin added in agents-split.test.js
(dedicated-Map roundtrip + listener-array immunity + legacy contract).
Sign-off (approve/reject) is unaffected — it goes through stream.complete().
agents-split 23/23, agents 17/17, orgflow 6/6, concurrent 6/6.

**#4 testBin judged on exit semantics (both harnesses):**
- test/ci.js: added BIN_BUDGETS (test-all: 30s — it runs 17 sub-checks;
  the 5s smoke watchdog was killing a healthy binary → the drill's
  "423/1" class). Main repo now 422/0/0.
- test/runner.js: replaced "kill at timeout, pass on ANY stdout" with
  wait-for-close + exit-code judging; Syntax/ReferenceError still fails;
  watchdog kill passes only for known servers (BIN_SERVERS); spawn errors
  fail cleanly. Runner 37/37.

**#3 horcrux refresh (stale point-in-time backups):**
`vant horcrux refresh` regenerates the discovered boot horcrux in place:
password resolved by the same chain as restore (arg → env → p_<pw>
filename), fresh gather written to a repo-relative .refresh-tmp.svg (vaf
blocks absolute paths — found live), validated by round-trip
(validateHorcruxFile) BEFORE rename, original untouched on any failure.
Also fixed `create`'s default output path: models/public/boot/brain-<ts>.svg
was outside every brain's boot/ dir — invisible to boot-time discovery.
Now defaults to models/public/<currentBrain>/boot/<brain>-p_<pw>.svg.
Live-verified: refresh bumped the axolotl boot horcrux 20:31 → 20:36 and
inspect confirms fresh timestamp + valid decrypt.

**#2 fresh-clone reincarnation drill (rerun after all of the above):**
Cloned axolotl to /tmp, bun install, then: horcrux inspect valid
(steganography) + fromHorcrux 25-key restore; brain.read('identity')
1714 chars; fresh-dir guard 8/8 in the clone; ci.js 422/0/0 once the
uncommitted harness fix was copied in (clone ships pass-20 code — the one
failure was exactly the BIN_BUDGETS gap, re-confirming #4's value). Note:
the clone's committed models/private tree means brain.read('identity')
resolves private there vs public in the dev workspace — by-design dual-mode
override, same content. Scratch cleaned.

**Evidence:** full suite 109/109; agents-split 23/23; runner 37/37;
test-all 17/17; fresh-dir 8/8 (main + clone); ci 422/0/0 (main + fixed
clone); horcrux refresh live round-trip.

**Next candidates:** DEAD_EXPORTS.md long tail (untouched), snapshot vs
horcrux overlap (bin/snapshot.js also wraps toHorcrux — refresh semantics
could be shared), docs sync for `vant horcrux refresh` (cli.md + memory/
horcrux.md), and bin/docs-build.js's require("./lib/sandbox") fix landed in
pass 20 — worth one grep in docs for other stale paths.

---

## Session (2026-09-23 — pass 22: snapshot backup-safety, escrow store
## containment, DEAD_EXPORTS triage)

**#2 snapshot/horcrux overlap — resolved by adopting refresh semantics:**
bin/snapshot.js (routed `vant snapshot`) is the second writer of stego-SVG
horcruxes, with manifest+sha256 sidecars. Two real defects fixed:

1. **Blind overwrite of the only backup.** Its default target IS the live
   boot horcrux, and toHorcrux (despite P2 #27 atomicity) replaces the old
   file with no content check — a corrupt-but-successful encode silently
   destroyed the backup. Now: if the target exists, write to a sibling
   `.snapshot-tmp.svg`, round-trip validate (fromHorcrux +
   validateHorcruxData), THEN rename over the target — horcrux refresh's
   exact contract. Failure at any stage leaves the original untouched, tmp
   cleaned (success, validation-fail, and top-level-catch paths).
   `--no-verify` on an existing target is now REFUSED (blind replace is the
   destruction mode being removed); new targets may skip verification.
   Manifest moved to post-validation so it never describes a discarded
   backup.
2. **cwd fragility.** Relative sidecar writes + toHorcrux's atomicWriteFile
   resolved against the caller's cwd; default output was also hardcoded to
   models/public/vant/boot (coincidental brain match). Now: --output (or
   nothing) resolves user-relative first, then the run chdirs to REPO_ROOT
   so every subsequent path is repo-anchored; default target follows the
   CURRENT brain (brain.getCurrentBrain() → state.json stack head →
   'vant') via the new --brain flag chain.

Live-verified: bare snapshot (tmp→validate→replace, valid inspect
afterward), --no-verify refusal, foreign-cwd dispatch (lands in repo,
caller dir untouched).

**BONUS root-cause while testing: escrow store escape via two-anchor bug.**
Every routed dispatcher command from a foreign cwd materialized
models/private/vant/orgchart/escrow.json in the CALLER's dir. Root cause:
lib/escrow.js built its store path cwd-anchored ('models/private/<brain>/
orgchart/escrow.json') but handed FileStorage basePath=INSTALL ROOT —
path.resolve() anchored at cwd, path.relative() then produced an escape-
shaped '../../tmp/...' rel, and path.join(base, rel) collapsed it right
back outside the store. Containment never ran on write (read-only via
_checkSymlink), so the write landed silently. Fixes:
- escrow.js: teams.js-style anchor (basePath = resolved store DIR, file =
  basename) — containment holds by construction. teams.js was already
  correct; one consistent anchor per store is the rule.
- storage.js: (a) write() and delete() now call _checkContainment BEFORE
  any WAL intent/dir creation/unlink; (b) _checkContainment replaced the
  startsWith prefix check ("/repo-evil" passes "/repo") with
  path.relative + '..' detection.
Note: the caller-cwd models/ tree itself is BY DESIGN (dispatcher comment:
brain runtime resolves models/ relative to cwd so brains live in the
user's project) — the bug was the escape-shaped path, not the anchor.

**Guard tests (fresh-dir-routing 10/10):** foreign-cwd 'rate' dispatch must
contain its store write in the DESIGNED location without a
SECURITY_PATH_ESCAPE crash (this is the regression that would have fired
with the hardening alone); FileStorage.write must refuse escape-shaped
paths while normal nested writes still work.

**#1 DEAD_EXPORTS long tail — triaged, closed as documented-debt:**
Rounds 1-3 (2026-09-21) removed the valuable items (metrics, lock,
consensus internals, sync privacy). The remaining tail is getStack*
convention accessors, error.js typed-error public API, dynamic consumers'
surface, and _-internals whose deletion buys nothing (no bundle shrink,
no attack surface — see header). Marked opportunistically-done rather
than churning ~30 files against the corruption-incident lesson (c7009da).

**Evidence:** fresh-dir-routing 10/10; escrow 15/15, teams ✓, storage 40,
boot 15/15, concurrent 6/6; live snapshot round-trips; full sweep below
before commit.

**Next candidates:** bin/audit.js + bin/backup.js still do raw fs ops
outside FileStorage (same prd-storage census as clean.js); snapshot's
--no-verify UX could offer --output - to stdout; dispatcher could pass an
explicit anchor env (VANT_REPO_ROOT) so libs stop inferring it from cwd;
snapshot + horcrux refresh could share a lib/horcrux-safe.js helper (the
tmp→validate→rename flow is now duplicated in two CLIs).

---

## Session (2026-09-23 — pass 23: lib/horcrux-safe, anchor env, census)

**Shared safe-write helper (lib/horcrux-safe.js):** the tmp→validate→rename
flow extracted from the two CLIs into safeWriteHorcrux(relTarget, {encode,
decode, validate, label, log, ...}). Existing targets: encode to
<name>.tmp.svg → sanity stat → decode → validate → rename. New targets:
direct write + round-trip (a fresh backup that cannot decrypt is worthless
— failure throws loudly, file left for inspection). Failure at ANY stage:
original untouched, tmp removed, error wrapped 'original left untouched'.
Returns {usedTmp, replaced, absTarget, size, result, data} — snapshot's
manifest now records the true final size (tmp stat, not encode string
length) and replacedExisting flag.

**Integration bug found by the foreign-cwd test:** toHorcrux/fromHorcrux
resolve relative paths against process.cwd() while the helper anchored at
repo root — dispatcher-routed refresh from a foreign cwd encoded the tmp
into the CALLER'S tree while stat/cleanup looked at the repo's (silent
0-byte 'suspiciously small' failure, tmp orphan). Fix: helper chdirs to
repo root for the encode window, restores after (success/failure paths).
Snapshot's own pass-22 chdir kept as defense for its sidecar writes.

**VANT_REPO_ROOT anchor (lib/anchor.js + dispatcher):** dispatcher exports
VANT_REPO_ROOT=<install root> into every routed subcommand's env; new
lib/anchor.getRepoRoot() resolves env first, install tree second. Libs
needing the INSTALL tree stop guessing from cwd/__dirname. Brain CONTENT
paths stay cwd-anchored BY DESIGN (user's project owns models/) — anchor
and brain root are now explicitly different questions.

**horcrux discovery tmp-skip:** lib/boot.js _discoverBootHorcruxes and
bin/horcrux.js findDefaultHorcrux skip *.tmp.svg — a crashed safe-write
run must not leave a decode candidate pointing at a partial file. *.tmp.svg
gitignored.

**Raw-fs census (bin/audit.js, bin/backup.js):**
- backup.js: zero raw writes (reads only, ROOT-anchored) — clean. BUT
  `backup schedule` was a silent stub (printed 'Scheduling...', did
  nothing, exit 0). Now says 'not implemented' + prints a working cron
  recipe, exits 1 (visible failure beats invisible lie). Help text marks it.
- audit.js: --out write is legit (root-anchored report artifact, not
  models-data — raw fs stays ON PURPOSE) but the path skipped validation
  entirely. Now: repo-containment + vaf.checkPathTraversal before write.
- BONUS third find: help advertises `--out FILE` but the parser only
  accepted `--out=FILE` — the space form silently dumped to stdout. Both
  forms accepted now; cli.md notes it.

**Guard tests (fresh-dir-routing 10 → 15):** four horcrux-safe scenarios
via child `node -e` with fake encoders (new-target, happy-replace,
decode-fail, validate-fail — each asserts original-untouched/tmp-cleaned)
+ anchor env-resolution unit. Harness is sync; async helper tests run in
subprocesses printing JSON verdicts.

**Evidence:** fresh-dir 15/15; live snapshot + refresh round-trips (repo
cwd AND foreign dispatcher cwd); refresh failure path exercised (wrong
password → original untouched); audit --out both forms + escape refusal;
backup schedule honest failure. Full sweep before commit.

**Next candidates:** VANT_REPO_ROOT adoption sweep (storage/horcrux call
sites still infer install root from __dirname where cwd differs matters);
bin/audit.js report generation itself could move to a lib module (CLI is
216 lines of gather+format); `vant backup restore` never validates the
backup file before lib/backup.restore runs.



## Session (2026-09-23 — pass 25: transform rate-limit enforcement,
## backup.create safety, teams lazy-logger audit)

**transform.js _checkSecurity (the :230 dead branch + 3 stacked bugs):**
- Dead branch replaced: vaf.validateString THROWS on invalid input (returns
  `true`, never a {valid} object) — old `!validation && !validation.valid`
  could never fire (and TypeError'd on undefined if the throw ever vanished).
- Rate limit enforcement was a no-op THREE ways: fresh RateLimiter per call
  (empty window every time), wrong option name (`max` vs maxPerMinute), and
  check() (async) called un-awaited (truthy Promise). Now: module-singleton
  limiter, real option, all 23 call sites awaited.
- Limit sized 200/min module-wide: RateLimiter enforces a GLOBAL bucket AND
  per-client bucket at the same number, and one compound op (backup/gather)
  fans out to ~16-20 _checkSecurity sub-steps — 20/min false-tripped any
  real workload once enforcement actually worked.
- secret.js: same singleton pattern (60/min module-wide, was 10/min and
  never enforced).

**teams.js lazy-logger audit:** all 6 _audit call sites use .info only;
fallback stub now mirrors the real audit surface (info/warn/error) — the
added error stub is future-proofing, nothing else to fix.

**backup.create → lib/horcrux-safe (tmp→validate→replace):** same contract
as snapshot/refresh — a failed or corrupt encode can no longer clobber the
only good backup. outputPath is cwd-relative BY DESIGN (user-tree artifact)
→ new anchorRoot option (pass cwd) keeps tmp/rename in the caller's tree.
NEW: post-rename re-verify — if the FINAL file fails to decode, the captured
original bytes are restored via primitives.atomicWriteFile (pass-25 first
draft read absTmp AFTER the rename consumed it and wrote the tmp path back:
recovery was itself broken; fixed 25.1 + pinned).

**Tests:** backup-create-safety (3: new→replace→crash-safety round-trip in
an isolated repo copy, limiter-enforcement probe, anchorRoot contract);
fresh-dir horcrux-safe scenario `post-rename-fail` (final-file failure →
byte-for-byte restore, tmp cleaned). Two prior-session test bugs fixed
en route: `before` snapshot taken before the LEGIT replace (nondeterministic
stego bytes → false "clobbered"); sync harness misread a returned Promise
as failure (limiter probe now runs in a child node -e, like the scenarios).

**Evidence:** fresh-dir 16/16; atomic-writes 13/13 (incl. no-raw-fs
structural rule); backup-create-safety 3/3; transform 5; secret-free suites
(teams 22, qos 10, escrow 15, snapshots 9, backup 8, backup-restore 4);
build-test 15/15; bin/test-all 17/17; `npm run check` syntax OK.

**Next candidates:** horcrux-safe callers pass opts straight through —
verify backup.create's spread doesn't leak anchorRoot into toHorcrux opts;
DEAD_EXPORTS.md long tail re-triage after 24/25; teams.store config path
(escrow/governance) never exercised by tests.

## Session (2026-09-24 — pass 26: legacy/bloat cleanup, error alias eradication)

**Policy (owner decision, binding):** 0.8.6 axolotl supports NO legacy code —
everything is new, no bloat fallbacks, no legacy wrappers, no compat aliases.
Legacy BRAIN data is supported only to migrate OFF old paths (lib/migrations).
Pass-25 correction: teams' audit try/catch stub was COMPLETED then — under
this policy it (and its 3 siblings) should have been questioned instead.
tmp.js T7 was already the precedent.

**Tier 1 — dead code (all zero-caller-verified):**
- backup.backup() "Legacy one-time backup" alias removed.
- geometry.generateBarcode @deprecated shim removed (live twin:
  generateBarcodeFromContent). Stale "backwards compat" comment fixed.
- sync.js: isCircuitClosed/recordFailure/recordSuccess unexported
  (pass-through aliases; 6 internal call sites stay; getAllCircuits keeps
  its export — bin/validate.js consumes it).
- 4× silent-stub audit fallbacks (teams/auth/lock/qos) → direct top-level
  require('./audit') (no cycle exists; tmp.js pattern). Silent-stub would
  mask a broken install as quiet success.

**Tier 2 — errors.Error → errors.VantError (~177 call sites):**
- 24 lib files renamed (sed batch, verified by file-tool read-back after
  catching the policy violation), bin/build-test.js contract check updated.
- THREE import-alias variants existed: errors.Error (24 files), error.Error
  (rls.js — singular import, would have been a live TypeError on RLS deny),
  err.Error (sandbox.js 3 sites). First grep-only sweep caught 1; the
  widened `\.Error\(` sweep caught all. Lesson: rename sweeps must match on
  the ACCESS PATTERN, not the assumed local variable name.
- Alias export removed from error.js; test-error.js asserts its ABSENCE now.
- Guard: new test/no-legacy-bloat.test.js (8 checks) pins all of the above,
  including "any X.Error( call form" and "no try/catch require('./audit')".

**Evidence:** require-load smoke 92/92 lib modules; syntax OK; suites green:
storage 40, brain 77, sandbox 22, api 21, search 22, audit 22, teams 22,
auth 12, vaf 12, stego 12, server 11, lock 10, qos 10, tmp 10, escrow 15,
sync 18 (1 assertion flipped: unexported wrapper), audit-report 10,
snapshots 9, security 20, shell 8, backup 8, pipeline 9, encrypt 3,
backup-restore 4, backup-create-safety 3, test-error 7, build-test 15/15,
test-all 17/17. Docs grep clean.

**Tier 3 decisions recorded (owner, for follow-up passes):**
1. teams rehydrate dual store format → MIGRATE OR REJECT (no dual parsing).
2. teams _getStorePath .agent_tmp default → brain-scoped path is THE default;
   .agent_tmp only via explicit config override.
3. transform.restore() legacy privateBrains path → require new format, use
   `vant migrate` as the bridge.

## Session (2026-09-24 — pass 27: teams restoreState migrate-or-reject + E2E hermeticity)

**Tier 3 #1 (owner: migrate or reject, no dual parsing):**
- teams.restoreState now accepts ONLY gatherState()'s Map-entries format
  ([key, entity] pairs, key === entity.id / agentId). Legacy store-file
  arrays → thrown Error code E_LEGACY_FORMAT pointing at the new bridge.
  Validation runs BEFORE the maps are cleared — a rejected payload leaves
  live state untouched (pinned).
- teams.migrateLegacyState(legacy) added + exported: pure converter,
  legacy/entries → entries; wrong-keyed or id-less entries throw.
- transform.restore needs no change: its try/catch already funnels the
  rejection into results.errors.

**orgflow.test.js harness truth-fix (found while verifying):**
- Store pollution: the suite wrote real entities into
  models/private/<brain>/orgchart/teams.json, so re-runs tripped their own
  duplicate checks (and the checked-in tree carried test residue — purged).
  Now hermetic: config.set('teams.store', <tmpdir>) BEFORE lib/teams loads
  (runtime flag, top get() precedence), tempdir removed on exit.
- Coverage race: the fire-and-collect harness raced async bodies against
  each other and against later sections' load-time setup, and process.exit
  swallowed pending microtasks — 4/22 verdicts silently vanished run-to-run
  (incl. the dryRun test, which had NEVER actually passed; it raced the
  real delete). Rewrote to a sequential queue (bodies awaited in file
  order); soul-test setup + cleanup moved into queued steps. 24/24 stable
  across runs, real store stays clean.

**Evidence:** teams 22, orgflow 24/24 ×2, agents 17, transform 5,
backup-create-safety 3, fresh-dir 16, no-legacy-bloat 8, syntax OK.

## Session (2026-09-24 — pass 28: brain-scoped orgchart default, no .agent_tmp fallback)

**Tier 3 #2 (owner: brain-scoped path is THE default; .agent_tmp via
migration/config only):**
- teams.js / escrow.js / agents/internal.js _getStorePath reshaped: explicit
  config override (teams.store / escrow.store) wins, else brain-scoped
  models/private/<brain>/orgchart/<store>.json — ALWAYS. The silent
  .agent_tmp fallback is deleted from all three; an unusable brain name
  throws instead of scattering orgchart state outside the models tree.
  brain.js currentBrain() always yields a usable name ('vant' default), so
  the old catch-fallbacks were dead code masking breakage.
- migrations.js v2 step (orgchart.brain-scope) remains THE bridge for
  existing .agent_tmp stores — runs on vant start, content-verified.
- Guard test extended: no-legacy-bloat pins that teams/escrow/agents
  internal stores never reference .agent_tmp again.

**Evidence:** teams 22, orgflow 24/24, agents 17, escrow 15, audit 22,
fresh-dir 16 (escrow containment), no-legacy-bloat 9, build-test 15/15,
test-all 17/17, syntax OK.

**Remaining .agent_tmp refs (out of scope here):** security/gates.js GATE_DB
(separate store, own migration decision), bin/format-test temp artifacts,
bin/clean.js cleanup list.

## Session (2026-09-24 — pass 29: horcrux brainStorage strict single format, migrate-or-reject)

**Tier 3 #3 (owner: restore accepts the new format ONLY; old horcruxes go
through a migrate bridge, same pattern as teams pass 27):**
- transform.restore() brainStorage section: the gather() brains-object shape
  ({ brains: { <name>: { type, files } } }) is the only accepted input.
  Both legacy shapes REJECTED with E_LEGACY_FORMAT naming the bridge, before
  any writes: brainStorage.files flat array (pre-multibrain single brain)
  and data.privateBrains per-brain list. Rejections validate-and-throw
  upfront — a rejected payload leaves disk untouched.
- transform.migrateLegacyBrainStorage(data, { brainName }) added as the
  bridge: pure converter (flat files -> private/<brainName|'vant'>,
  privateBrains list -> private/<name> with .name remapped to <name>.md),
  merges both shapes with a warning, strips the legacy key into
  _migratedPrivateBrains, and rejects unsafe brain/file names via the same
  _safeBrainName gate as the new path. Docs + errors follow the
  migrate-or-reject contract.
- Legacy privateBrains SURFACE removed entirely (no dual parsing, no bloat
  fallback): dead gatherPrivateBrains() producer + disabled-by-default
  gather option + export deleted (brainStorage covers it since 0.8.6).
- validateHorcruxData now recognizes legacy privateBrains payloads as
  content so restore's specific migration error surfaces instead of a
  generic validation failure.
- inspectHorcrux: preview reports hasLegacyPrivateBrains + legacyBrainData
  migration hint; legacy brains no longer double-count in brainCount/
  agentCount. Dead hasBothFormats (always-false dup warning) removed;
  bin/horcrux.js inspect now prints the migrate hint instead.
- New test/brain-storage-strict.test.js (14): legacy rejections + disk-
  safety canaries, malformed-entries rejections, bridge conversion/purity/
  unsafe-name/merge, round-trip (migrated payload restores for real),
  benign control, inspect hint. no-legacy-bloat guard extended with two
  pass-29 pins.

**Note (pre-existing, not this pass):** bin/transform.js full-restore calls
transform.restoreFull/fromSvg — neither is exported by lib/transform.js.
Dead CLI surface; candidate for next bloat sweep.

**Evidence:** brain-storage-strict 14/14, no-legacy-bloat 11/11,
malicious-restore 7/7, transform 5, backup 8, teams 22, agents 17,
escrow 15, orgflow 24, snapshots 9, fresh-dir 16, build-test 15/15,
test-all 17/17, syntax OK.

## Session (2026-09-24 — pass 30: CLI dead-surface fixes, sync push hardening, node-crew genesis)

**Fixes (owner-requested):**
- bin/transform.js: extract/restore rewired to the REAL lib API
  (fromHorcrux + restore). The old code called transform.fromSvg() /
  transform.restoreFull() — neither is exported; both cases could only
  throw. Dead full-restore case dropped (restore IS the full restore since
  the 0.9.0 payload-unwrap fix); usage text matches the real surface.
- bin/horcrux.js: pre-existing eslint no-regex-spaces error fixed
  (/^   / → /^ {3}/) plus unused boot/fs requires removed. bin/ now lints
  with 0 errors.
- bin/sync.js push: (1) message is now execFileSync argv — the old
  execSync(`git commit -m "${message}"`) let brain-file content execute
  (P0 pattern git-injection.test.js hunts). (2) The credential block is
  deleted: it persisted the token PLAINTEXT to /tmp/vant-*/git-credentials
  and left credential.helper=store configured in the repo (the store
  helper never even reads that path), plus wrote a junk masked value to
  user.token in .git/config. Credentials are the caller's job.
- Verified end-to-end in /tmp: transform horcrux → extract → restore
  round-trip, exit 0, all sections restored.

**labs/node-crew — multi-brain parallel society (new PRD + demo):**
- labs/prd-node-crew.md: architecture, node isolation matrix (per-brain
  orgchart/agents/escrow/config/soul), protocol call surface, genesis
  phases, security notes, roadmap.
- labs/node-crew/demo.js: 9-phase genesis — master seeds brain memory,
  spawns crew agents, registers live nodes (node-registry), opens msg
  channel, consensus ratification (crew votes), governance decisions from
  every node, market list→bid→trade (escrow holds, trust recorded),
  leaderboard, encrypted stego soul horcrux. 9/9, idempotent (agents
  respawned, run-scoped topics).
- test/node-crew.test.js: 7 protocol pins (registry-verified votes, async
  consensus shape, trust-weighted tally, canTrade-vs-canWrite gate, stego
  arg order).

**Field findings (the point of labs):**
- worker_threads do NOT share module state — consensus/market/msg/trust
  are in-memory Maps; crew votes cast in a thread vanish. True parallel
  nodes = v0.2 protocol persistence via storage layer (PRD roadmap).
- node-registry IS the node concept: consensus votes verify voters
  against it by default (requireRegistry) — register() auto-heartbeats
  to alive.
- consensus: topic charset [a-zA-Z0-9_-] (no colons); create() requires
  an explicit options array (≥2); quorum option is minQuorum; create/vote
  are async (lock-chained); tally is sync and counts are TRUST-WEIGHTED
  (assert totalVotes + leading, not raw counts).
- Sandbox: setCapabilities flips untouched-default → explicitly-enforced
  (every unlisted capability then denied). canSpawn gates agents.spawn;
  canTrade is distinct from canWrite (market trade vs list/bid).
- stego.encodeSvg(message, carrierSvg, password) — message FIRST.

**Evidence:** node-crew demo 9/9 ×2 (idempotent), node-crew pins 7/7,
sync 18/18, sync-pull 15/15, git-injection 7/7, no-legacy-bloat 11/11,
brain-storage-strict 14/14, syntax + eslint bin/ 0 errors.

## Session (2026-09-24 — pass 31: v1.0.0 stability hunt, stress harness 0 fires)

**Method shift (goal: release to main / v1.0.0):** the crew now hunts its
own bugs. labs/node-crew/stress.js = adversarial protocol probes across
concurrency (parallel races), env matrix (fresh dirs, missing password,
strict sandbox), hostile inputs (traversal, prototype pollution). Exit 0
by design — humans triage, suites pin.

**Fires found + FIXED this pass:**
- A3 🔥 market double-sell: parallel trades both succeeded on a scarce
  listing (no supply concept; escrow hold = Map.set, no atomicity; trades
  interleaved at await points). Fix: listing.supply (default 1, Infinity
  opt-out) + atomic pre-await reserve with rollback on every late
  rejection. Verified: race now yields exactly one winner.
- B1 🔥 stdin hang: secret.get() fell back to readline prompt under
  CI/cron (no TTY) — horcrux extract hung forever. Fix: non-interactive
  stdin fails structured E_SECRET_NON_INTERACTIVE naming the env var.
- B4a ⚠️ anomaly: agents _loadAgents classified read DENIAL as corruption
  and reset the roster to empty (next save = data wipe). Fix: read errors
  throw E_AGENT_STORE_READ; only parse failures reset.

**Held green under stress (9 probes):** vote blitz one-per-agent, double-
vote audit trail, msg storm QoS degradation, trust score bounds, wrong-
password rejection, fresh-dir cleanliness, strict-sandbox fail-closed,
prototype-pollution containment, traversal containment.

**labs/STABILITY.md (new):** v1.0.0 tracker — per-area status, fire log,
known non-blockers (escrow hold-without-debit, in-memory protocol state,
bin/ warnings, no full-suite runner), draft release gate (7 criteria).

**Baseline:** zero red suites across 25+ sampled (core 13 + release-gate
suites + build-test 15/15 + test-all 17/17). node-crew pins now 9/9
(includes the two new regression pins). Demo genesis still 9/9.

**Next toward v1.0.0 (per STABILITY.md gate):** full-suite sweep runner,
escrow debit-on-trade, second consecutive 0-fire stress run, legacy
migrate round-trip check.

## Session (2026-09-24 — pass 32: full-suite sweep 115/115, release gate ALL GREEN)

**test/run-all.js (new, npm run sweep):** every test/*.test.js suite in
its own process, 120s timeout each, categorized summary, --only/--skip/
--json/--list. Exit 1 on failures, 2 on timeouts. The "nothing hides"
runner: build-test + test-all covered ~32 of 115.

**Historic result:** first full sweep 114/115 → the one failure was
error.test.js still asserting the `err.Error` legacy alias removed in
pass 26 (stale test currency, not a product bug). Updated to assert the
real contract (VantError present, alias absent — matches the
no-legacy-bloat pin). Second sweep: **115/115 green, 0 timeouts, ~136s.**

**Release gate #5 verified live:** legacy flat tree (3 public .md +
private .md, no stack) → `migrate --status` detects with evidence →
migrate imports into models/{public,private}/vant/ with verified:true →
marker v3 → idempotent (--status up to date). migrations.test.js 28/28.

**STABILITY.md updated:** all 7 release-gate criteria ALL GREEN.
Remaining pre-release work is mechanical: version bump 0.8.6 → 1.0.0
(package.json + MANUAL surfaces per lib/version.js), CHANGELOG entry,
owner go decision.

**Evidence:** sweep 115/115 ×2, stress 0 fires ×2 (gate #2),
node-crew pins 9/9, demo 9/9, migrations 28/28, error.test 19/19,
syntax OK, eslint 0 errors.

## Session (2026-09-24 — pass 33: webhook event wire + owner version-lock decision)

**Owner decision recorded in STABILITY.md:** version STAYS 0.8.6 until all
0.8.6 refactor waves are solved. Release gate green is necessary, not
sufficient — no bump until the owner calls it.

**lib census (92 modules):** 4 with zero importers — do.js (483 lines, and
its comment claims storage uses do.guard() but storage uses gate.js
directly), onboard.js, vibe.js (full mood system, no runtime consumers),
webhooks.js. bin/ CLIs exist for all four; vant.js routes them.

**THE WIRE (webhooks.js):** the header promised "HTTP triggers emit
globally" but only webhook:registered emitted — inbound events were
dropped after the brain audit log. Fixed: events now emit webhook:<event>
{ source, webhook, event, body, timestamp } after HMAC verify + filter;
_emit returns handler count, HTTP response reports it. Bonus fire caught
live: brain was used-but-never-imported, so every event's audit write
died on 'brain is not defined'. Import wired + regression pin.

**webhooks.test.js rebuilt (11/11):** live-server wire probe (signed POST
→ event fires, handlers counted), 401 on bad signature, brain-import pin,
proper async settlement before exit. Full sweep 113/113 (port suites
excluded), stress 0 fires, demo 9/9.

**Next dormant machinery to wire (owner: "epic shit"):** do.js universal
handler (nobody imports it — either wire it as THE operation registry for
MCP/crew or fold it into pipeline), vibe.js into runtime/commit flow,
webhook transport for node-crew v0.2.

## Session (2026-09-24 — pass 34: do.js removed — superseded, honored, deleted)

**Owner question:** do.js had a greater purpose with pre-gen agents — a
function proxy/handler/harness for consistent async/sync implementation.
Useful or remove?

**Forensic verdict (remove):**
- 0 importers anywhere (lib/bin/MCP/docs/dynamic requires) — only its own
  test file. Never routed in vant.js.
- Its consistency purpose was superseded by successors the codebase
  actually adopted: pipeline.run (23 modules — mode selection + security
  chain), gate.js (8 modules — capability checks with
  _explicitlyConfigured awareness), and brain.register (the LIVE DI
  registry — boot wires qos/escrow/trust/market through it).
- The async/sync harness problem dissolved with codebase-wide async/await
  standardization; _executeFn wrapped what the language now does natively.
- do.guard's only consumer (storage) migrated to gate.js in B-2; the
  comment claiming "Storage now uses do.guard()" was a stale lie.
- Fallback chains, adapters registry, hooks registry: 0 consumers each.
- Deleted lib/do.js + test/do.test.js. Zero remaining refs; sweep 111/111
  green (113 minus the two do.js suites).

---

## Pass 35 (2026-09-24) — dormant machinery resolved: vibe ⚰️, onboard hub, crew-bus 🚌

**Queue from pass 34:** 4 orphaned modules; do.js already gone. This pass
closed out vibe (removed) and onboard (wired), and shipped the node-crew
v0.2 transport (crew-bus) on top of pass 33's webhook wire.

**vibe.js — removed.** Full forensics: zero runtime consumers (316-line
mood system with getCommitVibe/onTaskSuccess hooks nobody ever called).
No-legacy-bloat policy says wired-or-removed; owner's queue framing
offered wire-or-propose-removal — removal won on merit. Deleted:
lib/vibe.js, bin/vibe.js, test/vibe.test.js, coverage.js section,
bin/vant.js registry + help entry, bin/help.js command card, and all doc
references (5 files + the advanced/vibe.md page). test/evals/vibe.js
kept — island keyword evals, name collision only.

**onboard — install/migration hub.** getInstallStatus() classifies
fresh/legacy/current with next steps; getWakeBriefing() bundles it with
the onboarding summary. bin/onboard grew `status` + `wake` subcommands;
bin/start prints the install line in its banner (post-seed/post-migrate,
cosmetic). Honesty fix: getStackOnboardStatus now truly async (was
storing Promises — every brain "had" onboard). Latent fire: _checkRead
threw errors.VantError with no errors import — ReferenceError eaten by
its own catch, read gate no-op'd.

**lib/crew-bus.js — node-crew v0.2 transport.** Signed envelopes between
node processes via the webhook wire. createBus factory + default
singleton; HMAC sign (Encrypt) / verify (webhooks inbound, timing-safe);
outbound via network.fetch(system:true); SSRF allowlist = documented
setup step; brain/topic charset names. New test suite 13/13: real
child-process peer delivery, ack handler count, tampered 401, twin-bus
isolation (filter by route name), dispatcher containment, malformed
envelope drops, broadcast per-node results, NOT_FOUND pin, secret-leak
pins.

**Bonus fires:** CODES.NOT_FOUND never existed (sudo.js:380 + crew-bus
both used it → undefined → UNKNOWN); webhooks._checkNetwork had the same
missing-errors-module bug as onboard._checkRead. Both fixed.

**Verification:** onboard 10/10, webhooks 11/11, migrations 28/28, error
19/19, brain-storage-strict 14/14, crew-bus 13/13. Full sweep ×2:
114/114, 0 timeouts. eslint 0 errors on touched files.

---

## Pass 36 (2026-09-24) — Wave 1: node-registry persistence + crew-bus interop

**Plan:** labs/prd-vant-os.md (owner-approved arch A). This pass is the
foundation wave: the registry consensus trusts now survives restarts,
and crew nodes self-register as peers.

**node-registry.js:** hydrate-on-first-touch + write-through (register/
heartbeat/unregister/_persist) via FileStorage at
models/private/<brain>/state/node-registry.json. Store resolved PER
CALL (teams pattern — pushBrain moves it). _hydrate(): missing=fresh,
parse-fail=warn+empty, READ-DENIAL=throw E_STATE_READ (never reset).
discover/get/list/getStats all hydrate. Seams: _resetHydration,
clearState. Brain resolution matches getBrainPath (VANT_BRAIN env >
currentBrain).

**crew-bus.js:** listen() → registry.register({id:'crew_'+name, status:
'alive', metadata.kind:'crew-node'}); stop() → unregister. Deterministic
id: re-listen refreshes.

**Test-harness lessons (cost 3 iterations):** audit [INFO] lines mix
into child stdout — parse with first-{..last-} extraction, not
JSON.parse(whole). pushBrain ≠ path-active: currentBrain(name) sets the
path brain (getBrainPath reads _currentBrain, not the stack).
JSON.stringify drops undefined — `|| null` before asserting absence.

**Verification:** registry-persistence 6/6 (incl. real process-death
round-trip), crew-bus 13/13, consensus 8/8, node-crew 9/9. Sweep
115/115 ×1 (after +1 suite), eslint 0 errors.

---

## Pass 37 (2026-09-24) — Wave 2: state-store + trust + msg persistence

Crash-resumed session: Wave 2 was ~90% done pre-crash; finished the
migrations fix, swept, committed.

- lib/state-store.js: shared arch-A store (hydrate/persist/clear,
  E_STATE_READ rule, kind marker). node-registry refactored onto it.
- trust: write-through on record/setRequired/reset/import; hydrate on
  load; history bounded 100 on disk.
- msg: conversations snapshot (Sets↔Arrays); channels stay ephemeral.
  PRD corrected: conversation = history unit, not channel JSONL.
- transform: relay gather seam → crewBus (secret-free topology);
  restore notes topology, never fabricates secrets.
- migrations: dropfile detector now skips kind-marked protocol state
  (caught migrate() relocating a real trust.json — near-miss fixed with
  pin).
- Test-harness notes: msg.post checks sandbox.can('canWrite') STRICTLY
  (untouched stub = false) unlike FileStorage's allow-with-warning —
  test children must setCapabilities (org.js pattern). transform.gather
  children need an async IIFE (no top-level await in node -e CJS).
- Killed zombie wal.test.js (2d, 81% CPU) that was contaminating sweeps.

Verification: state-persistence 8/8 ×3, registry 6/6, migrations 28/28,
crew-bus 13/13, msg 17/17, trust 20/20, node-crew 9/9; sweep 116/116 ×1;
eslint 0 errors.

---

## Pass 38 (2026-09-24) — Wave 3: consensus + market ledger persistence

Crash-resumed session (frozen agent mid-reasoning); finished the Wave 3
diff review, fixed the suite, found 3 real lib bugs via the pins.

**consensus.js:** hydrate on load + write-through at lock points
(create/vote) and tally status transitions (passed/open/rejected/expired).
list()/resolve() hydrate too (cold-process safe). Seams added to match
trust/registry/market: _resetHydration, _stateFile, clearState. Latent
gap fixed: tally() reads `ledger.useTrustWeight !== false` (default ON)
but _createInternal never stored the option — create now honors an
explicit `useTrustWeight` option; integer minQuorum semantics need it
(trust-weighted, a fresh voter scores 0.5 and misses minQuorum 1).

**market.js:** hydrate on load + write-through at settle points
(list/bid/trade-commit/cancelTrade/restoreState). Serialization deltas:
supply Infinity ⇄ null on disk (scarcity opt-out must not silently cap
at 1); _reserved NEVER persists (phantom-reservation reset). Restored
listings rebuild the search index (byType/byTags/byAgent).
_stateFile/_persistNow/_resetHydration seams.

**Three lib bugs the pin caught (all fixed):**
1. Consent hardcodes — market list/bid/trade hardcoded
   `consentGiven: false` (trade ignored context entirely), so governance's
   consent gate could never pass. Context passthrough wired.
2. canTrade undeclared — trade() asks the gate for `canTrade`, but
   Sandbox's DEFAULT_CAPABILITIES never had it: an explicitly-configured
   sandbox always denied (undefined !== true) and no caller could grant
   it. Declared deny-by-default like its siblings.
3. Barter-price NaN — `_checkBudget(listing.price || 1)` passed
   'favor:review' into escrow's numeric `available >= amount`: NaN, so
   every barter trade denied 'Insufficient budget'. Non-numeric prices
   skip the escrow check (barter has no cost to debit); numeric
   credit-mode amounts flow through unchanged.

**test/ledger-persistence.test.js (new suite, 5 pins):** consensus
create+vote survives a real process death (tally + hash verify), resolve
→ passed on disk, market list+bid+trade round-trip (supply consumed,
_reserved=0, index rebuilt), Infinity-supply round-trip, kind marker on
both files. Harness fixes vs the frozen draft: child scripts get their
contract via env var (the draft's `node -e code LISTING_ID` argv form is
self-injection — node parses it as a SECOND eval script), consensus
children register the voting peer + create with useTrustWeight:false,
market children grant caps + consent.

**Also:** docs/memory/horcrux.md style regressions (em dash, arrow)
swept — check-docs-style back to PASS (118).

Verification: ledger-persistence 5/5; FULL SWEEP 117/117 (serial;
parallel x4 showed shared-state interference between the persistence
suites — run-all is serial, noted for future suite authors), eslint 0
errors, syntax OK, docs-style PASS.

---

## Pass 39 (2026-09-24) — Wave 4: relay removed, crew demo v0.2, PRD complete

**relay.js — deleted (owner decision pass 36: crew-bus is the resident).**
Removal map first: the ONLY live code consumer was transform's restore
branch; everything else was routing (bin/vant.js COMMANDS), help (help.js
card), docs (cli.md row), and its own suite. Deleted: lib/relay.js,
bin/relay.js, test/relay.test.js. Stripped: transform restore branch
(legacy data.relay payloads in old horcrux/backup files are ignored —
gather never produced them since pass 37), vant.js route, help.js card,
cli.md row, spirit.js header comment (now names crew-bus).

**no-legacy-bloat pin added:** relay stays deleted — no lib/relay.js, no
bin/relay.js, no transform require, no COMMANDS route, no help card
(live-code scan strips // comments so the removal docs don't false-positive).
no-legacy 12/12.

**Dead-export sweep:** zero live requires of relay anywhere; relay's
brain-config exports (getBrainRelayConfig/setBrainRelayConfig/
getStackRelayConfigs) had no external consumers; crew-bus already exposes
the full transport surface (send/broadcast/nodes/status/stop).

**STABILITY.md:** non-blocker "protocol state in-memory only" CLOSED —
node-registry/trust/msg/consensus/market all persist via lib/state-store.js
(Waves 1-3).

**labs/node-crew/demo-v02.js — crew demo v0.2, the PRD's definition of
done:** TWO REAL node processes. Master boots crew-bus + registry, creates
a consensus topic, votes, and sends a signed genesis envelope; the peer
verifies the HMAC, dispatches, casts its own vote in its own process
against its own registry view; a cold third process tallies the restarted
state (2 votes, ratify, passed). 4/4 phases, ×3 consecutive runs; v0.1
demo still 9/9 (protocol actors in-process remain valid).

Two integration lessons the demo surfaced (no code changes needed, both
existing behaviors correct):
1. network.setAllowedDomains takes HOSTNAMES ('127.0.0.1'), not origin
   URLs — an 'http://127.0.0.1:PORT' entry never matches (isDomainAllowed
   compares hostname only) and every send fails "domain not allowed".
2. A peer process boot-hydrates consensus BEFORE the master's create lands
   in another process — it must _resetHydration() + list() to re-hydrate
   from disk before voting. This is the documented multi-process contract:
   hydrate-on-first-touch, write-through; late arrivals re-hydrate.

**PRD closed:** labs/prd-vant-os.md marked COMPLETE (v1.1) — all success
criteria checked with evidence.

**Verification:** demo-v02 4/4 ×3, demo v0.1 9/9, no-legacy 12/12,
transform 5/5, state-persistence 8/8, crew-bus 13/13, node-crew 9/9;
FULL SWEEP 116/116 (relay suite gone), syntax OK, eslint 0 errors,
docs style + links PASS.
