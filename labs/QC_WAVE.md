# QC Wave — axolotl (2026-09-22)

Scope: code shipped in the metrics/WAL/mirror/health-check wave + repo-wide
automated sweeps (syntax, lint, exploit patterns, router wiring, PRD gaps).
Prior findings live in AUDIT_FINDINGS.md (2026-09-18) and COHESION_AUDIT.md
(2026-09-20); nothing re-triaged there unless it resurfaced.

## Fixed this wave

| Commit | Finding | Severity | Detail |
|--------|---------|----------|--------|
| `5a28829` | **WAL replay path escape** | 🔴 critical | `replay()` fed `rec.file` straight from journal JSON into `path.resolve` — a crafted `wal.log` line (`{"op":"write","file":"../../.ssh/authorized_keys"}`) applied writes OUTSIDE the store basePath on next open. Now re-validated through `_resolveRel()`; also `rec.blob` must be bare sha256 hex (was an arbitrary-file-read-as-payload primitive). |
| `5a28829` | **WAL fsync was dead code** | 🟠 high | `fdForAppend()` opened+fsynced+closed a fd, returned the stale fd, then `_append` fsynced the CLOSED fd → EBADF swallowed every time. The journal was never durably flushed (the entire point of a WAL). `_append` now write+fsync+closes one fd properly. |
| `ce246ea` | **sudo env tunables → NaN** | 🟠 high | `parseInt(env \|\| 'default')` yields NaN on garbage values: `VANT_SUDO_HEALTH_TIMEOUT=abc` made the health-check timeout fire at 0ms (every probe "times out" → revalidatable grants wrongly revoked); NaN revalidate interval would tight-loop; NaN audit/rate caps silently disabled guards. All 5 knobs now fall back to defaults via `_envInt()`. |
| `ce246ea` | **bin/branch.js shell interpolation** | 🟡 medium | Branch names interpolated into `execSync` strings unvalidated (locally-trusted input, but injection + option-args like `--all` gave confusing behavior). Ref-name charset validation added to create/switch/delete. |
| `7039827` | lint warnings in wave code | 🟢 low | Unused `fs` import in sudo.js + 3 unused test vars. 0 errors / 0 warnings on all wave files. |
| `bdf2025` | **`npm run check` checked only 1 file** | 🟠 high (tooling) | `node --check f1 f2 ...` silently validates only f1 (probed: valid + broken file pair exits 0). Every check run since the script was added was a no-op. Now a real loop over lib/bin/test (261 files). |

## Checked and clean

- **Syntax sweep**: all `git ls-files lib/bin/test` files `node --check` clean.
- **Full test loop**: every `test/*.test.js` suite re-run after fixes — 0 failures (2 halves, 15s/suite timeout). `npm test` 15/15.
- **mcp.js RCE (old audit Critical #1)**: `vant_call` is safe-by-construction (registered-tools only, comment at :2671); `compute_eval` requires sudo `compute:eval` + language whitelist; shell tools gated on sudo `exec`; autoWire's dynamic require uses a hardcoded array, not user input. No RCE found.
- **Mirror replication**: fan-out goes through the mirror's own validated `write()`/`delete()` (no raw paths); internal dirs (`.wal`, `.snapshots`) excluded; CLI mirrors are explicit operator flags.
- **`bin/wal.js`**: `--status` is side-effect-free (does NOT construct a FileStorage → no implicit replay); destructive `--reset` gated behind `--yes`.
- **CLI router**: all 92 command→file targets exist (0 dead routes).
- **Metric naming**: all `vant_*` series follow `vant_<layer>_<thing>_<unit>` consistently.
- **Version literals**: remaining `0.8.6` strings are CLI banners/fixture data only (same category COHESION_AUDIT B-5 already triaged as acceptable).

## Gaps noted (not fixed — decisions needed)

1. **`bin/branch-manager.js`** builds all git invocations via shell-parsed strings (`git(\`checkout -b ${branchName}\`)`, `commit -m "${message}"`). A full refactor to `execFileSync`/args-array is warranted but touches an untested 279-line file — schedule as its own slice with tests first.
2. **AUDIT_FINDINGS.md module criticals** (brain/islands/sandbox/agents/sync/backup/remote) were fixed in earlier waves per their docs but lack per-item verification notes; a verification-only pass (repro each finding, confirm closed) would turn those docs into a trustworthy ledger.
3. **DEAD_EXPORTS.md ~150 exports** still pending a careful removal pass (process documented there; keep per-file review discipline — see c7009da corruption incident).
4. **COHESION_AUDIT B-2**: 7 divergent security-chain implementations still consolidated nowhere (biggest structural lift; pairs with sudo PRD work).
5. **Open PRD items**: prd-sudo → Web UI, external auth; prd-storage → remote connectors (S3/GCS/Azure).
