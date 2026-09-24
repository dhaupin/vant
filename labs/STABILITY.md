# Vant Stability Tracker — Road to v1.0.0

**Branch:** axolotl
**Started:** 2026-09-24 (pass 31)
**Method:** adversarial crew stress harness (`labs/node-crew/stress.js`)
+ full-suite baselines. Fires found by the harness get triaged here:
fix in-pass when cheap, tracked when structural. Nothing hides.

---

## Current Status

**PASS 32 — FIRST FULL SUITE SWEEP: 115/115 GREEN.** The v1.0.0 release
gate (below) is now demonstrably satisfied on every criterion.

| Area | Status | Evidence (pass 32) |
|------|--------|--------------------|
| Full suite (ALL of test/) | 🟢 115/115 | `npm run sweep` (test/run-all.js), 2 consecutive clean runs |
| Protocol stress | 🟢 0 fires ×2 runs | stress.js 11/11 probes (gate #2 ✓) |
| Crew genesis demo | 🟢 9/9 idempotent | demo.js ×3 runs (incl. pass 30/31) |
| Legacy migrate round-trip | 🟢 verified | fixture CLI e2e: detect → import → verify → marker v3 → idempotent (gate #5 ✓) |
| Credential hygiene | 🟢 clean | plaintext persistence removed pass 30 (gate #7 ✓) |
| Syntax + lint | 🟢 clean | npm run check; eslint 0 errors (gate #4 ✓) |

Sweep history:
- pass 32, run 1: 114/115 — error.test.js still asserted the `err.Error`
  legacy alias removed in pass 26 (stale test currency, not a product
  bug). Updated to assert the real contract: VantError present, alias
  absent (no-legacy-bloat guard pins the absence).
- pass 32, run 2: **115/115 green, 0 timeouts** (~136s wall).

---

## Fire Log (from stress.js)

### PASS 31

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A3 | 🔥 fire | **Market double-sell**: two parallel trades both succeeded on a scarce listing. Listings had no supply concept; escrow `hold()` is a plain Map.set (no deduction, no atomicity), so trades interleaved at their await points. | ✅ FIXED — `supply` field on listings (default 1, `Infinity` opt-out), atomic pre-await reserve + rollback on every late rejection. Stress A3 now: exactly one winner. |
| B1 | 🔥 fire | **Stdin prompt hang**: `secret.get('brain')` fell back to a readline prompt when no password was configured — horcrux extract hung forever under CI/cron (stdin closed). | ✅ FIXED — non-TTY stdin now fails structured with `E_SECRET_NON_INTERACTIVE` naming the env var; prompts only when interactive. |
| B4a | ⚠️ anomaly | `[agents] Agent store corrupted, resetting: Read permission required` — read DENIAL was classified as corruption; the roster would silently reset to empty and the next save would wipe it. | ✅ FIXED — read errors throw `E_AGENT_STORE_READ` (no reset); only parse failures reset. |
| A1/A2/A4/A5, B2/B3/B4, C1/C2 | ✓ held | Vote blitz integrity, double-vote audit trail, msg storm QoS degradation, trust bounds, wrong-password rejection, fresh-dir cleanliness, strict-sandbox fail-closed, prototype-pollution containment, traversal containment. | 🟢 pinned by the harness |

---

## Known Non-Blockers (tracked, not fixed)

| Item | Risk | Notes |
|------|------|-------|
| Escrow holds don't debit budgets | medium | `hold()`/`release()` track reservations only; `canSpend` checks a running total that only `recordSpend` moves. Market trade releases the hold immediately (trade completes synchronously). Real debit-on-trade is a v1.0.0-rc candidate; harness A3 keeps watch. |
| protocol state in-memory only | structural | consensus/market/msg/trust Maps die with the process — the v0.2 node-crew PRD item (persistence via storage layer). Fine for single-process v1.0.0; blocks true parallel nodes. |
| 108 pre-existing eslint warnings in bin/ | low | unused vars, zero errors. Cleanup candidate, not stability. |
| `test/` count gap | low | ✅ CLOSED pass 32 — `test/run-all.js` (`npm run sweep`) runs all 115 suites in own processes with 120s timeouts; exit 1 on failures, 2 on timeouts. |

---

## Release Gate (draft, v1.0.0)

| # | Criterion | Status (pass 32) |
|---|-----------|------------------|
| 1 | Full suite green (all suites that exist) | ✅ 115/115 via `npm run sweep` |
| 2 | Stress harness 0 fires across 2 consecutive runs | ✅ passes 31 + 32 |
| 3 | Demo genesis 9/9 ×2 (idempotency) | ✅ ×3 across passes 30–32 |
| 4 | `npm run check` syntax clean + eslint 0 errors | ✅ bin/ 0 errors |
| 5 | `vant migrate` on a legacy tree round-trips | ✅ fixture CLI e2e verified (detect → import → marker v3 → idempotent; migrations suite 28/28) |
| 6 | Horcrux create → extract → restore round-trip in a fresh dir | ✅ verified pass 30 (tmp dir, exit 0) |
| 7 | No plaintext credential persistence anywhere in lib/ + bin/ | ✅ sync.js block removed pass 30; git-injection 7/7 |

**Gate status: ALL GREEN.** Remaining pre-release work is mechanical:
version bump to 1.0.0 (package.json + the MANUAL surfaces version.js
lists), CHANGELOG entry, and the owner's go decision.
