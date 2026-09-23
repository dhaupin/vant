# Session (2026-09-23 — pass 24: audit-report extraction, backup restore un-broken, secret.js VAF/QoS contract fixes)

> Merge target: this block belongs at the END of `labs/TASKS.md`
> (immediately after pass 23's "Next candidates"). TASKS.md edits were
> refused by the workspace sync layer this session (needles verified on
> disk via grep/od still reported not-found), so it landed here instead.

Carried over from pass 23's next-candidates, plus the anchor adoption
sweep. Session opened on UNCOMMITTED partial work from a crashed prior
attempt that had **overwritten lib/audit.js** (the shared audit/logger
used by ~30 modules) with the report generator — caught by caller census
before commit, logger restored from HEAD, extraction re-landed correctly.

## VANT_REPO_ROOT adoption (anchor sweep)

- lib/auth.js, lib/vaf.js: circuit-breaker/ip stores → anchor basePath
  (was `path.join(__dirname, '..')`).
- lib/sudo.js: store + policies resolution → anchor; also de-duped three
  separate FileStorage constructions into `_sudoStore()`.
- lib/boot.js `_discoverBootHorcruxes`, lib/transform.js horcrux
  template: install-tree assets → anchor.
- lib/search.js `getCurrentCommit` (.git), lib/geometry/quasicrystal.js
  DEFAULT_DATA_PATH (also kills a fragile `../../../` count).
- bin/backup.js ROOT → anchor (bin/audit.js already was).

## lib/audit-report.js (new)

Report gather+format extracted out of bin/audit.js (216-line CLI → thin
arg/containment/output shell). Pure functions, install-tree-anchored,
`opts.root` override for isolation. lib/audit.js UNTOUCHED — pinned by
negative assertions in the new test.

## backup restore — three stacked bugs, all found in one pass

1. lib/backup.js `restore()`: `data` was block-scoped inside the
   validation `if` but referenced after it → EVERY restore threw
   ReferenceError before touching anything.
2. `restore` was never EXPORTED → bin/backup.js's `if (mod.restore)` was
   always false → `vant backup restore <file>` printed "Restoring from:
   X", exited 0, did nothing. Exported (delegates to scheduler).
3. No validation before restore. Now decode + validateHorcruxData ALWAYS
   gate the restore: wrong password / corrupt SVG / missing file fail
   before any brain state changes. `_transform` is lazily loaded too
   (was only initialized by `start()` — CLI restore crashed on a
   non-started scheduler).

bin/backup.js restore branch is honest now: fails loudly if the module
lacks restore, reports AFTER success, lets main().catch surface
validation failures with exit 1.

## BONUS root-cause (blocked the CLI restore fix)

lib/secret.js `_checkSecurity` read `.valid` off `vaf.validateString`'s
return — but validateString THROWS on invalid and returns true on valid,
never a `{valid}` object. Every secret.get()/set()/clear() threw
"VAF: invalid secret type" the moment VAF was present, so the
VANT_BRAIN_PASSWORD env fallback in horcrux password resolution has been
DEAD. Same file: `RateLimiter.tryConsume` never existed (real API: async
`check(clientId, operation)`; `max` → `maxPerMinute`) — that throw was
unreachable. `_checkSecurity` is now async and awaited at all five call
sites; set/clear/clearAll async; bin/secret.js + bin/brain-unlock.js
await their calls.

(lib/transform.js:230 has the same `.valid`-on-true shape —
`!validation && !validation.valid` only throws on falsy, so it is
dead-but-harmless; left for a future pass.)

## Tests

- test/audit-report.test.js (10): report contract, opts.root isolation,
  + the clobber guard (lib/audit.js must keep logger exports, must NOT
  export the generator).
- test/backup-restore.test.js (4): export shape, full create→restore
  round trip in an isolated repo copy, wrong-password rejection,
  missing-file rejection, CLI restore exit semantics.

## Evidence

Full sweep 111/111 test files green (109 prior + 2 new); `npm run check`
syntax OK; audit CLI stdout/--json from foreign cwd; backup CLI restore
exit 0 (real restore) / exit 1 (missing file) in an isolated copy;
secret set/clear/list round trip through the CLI.

## Next candidates

- transform.js:230 validateString dead-branch cleanup.
- Same-audit pass over lib/governance.js + lib/teams.js lazy-logger shapes.
- horcrux-safe adoption for backup.create's SVG write
  (tmp→validate→rename).
- Fold this block into labs/TASKS.md when its sync un-wedges.
