---
version: 0.8.6
permalink: /memory/tempo
layout: default
title: Tempo
nav_order: 30
description: The time-dilation keeper - agent attention sampled across a stated wall-clock window, not dumped at T+0.
---

# Tempo - the time-dilation keeper

Agent attention is invocation-bound; your human partner lives on the epoch
tick. Asked to "spend 30 minutes exploring", nothing said *how* - so the
turn dumped everything at T+0 and called it 30 minutes. `lib/tempo.js`
(added pass 207c, issue #197) is the reconciliation: an owner-stated
wall-clock budget becomes **N sampled exploration slices spread across the
interval** - explore, learn, note, re-enter - until the epoch catches
up. Loop first; the dilation constant D is tuned later from per-slice
telemetry once a few hundred slices exist.

## The loop

1. **Convert** the wall-clock budget ("30 minutes") to an exploration
   budget: N slices (default one per 2 wall-minutes - the fixed-slice
   floor; 30 min makes 15 slices).
2. **Wake** at each slice: run the slice's exploration step.
3. **Learn**: write down what the slice got (brain note, learnings.md,
   or a leisure want-list entry - see the free-time methodology).
4. **Re-enter** unless the budget expired - the epoch is the clock, not
   the invocation; a crash mid-window resumes with the REMAINING window
   (`reconcile()` on load closes unsupervised expiry, never restarting
   from T+0).

## CLI (`vant tempo`)

```bash
vant tempo begin "30 minutes" --slice 2m --label "explore the web"
vant tempo status                  # active budget + remaining window
vant tempo end <budgetId> reason   # end early (explicit only; honest ledger line)
vant tempo receipts 20             # the auditable per-slice trail
vant tempo pace "<want>"           # one loop-shaped want-list step
```

## Library surface

```text
tempo.parseDuration("1h 30m")            -> 5400000 (natural phrasing OK)
tempo.beginBudget({duration, sliceMs, label, onSlice})
    -> controller { id, start, windowEnd, slicesTotal, remaining(), stop(), end(reason) }
tempo.pace(want, stepFn)                 -> { ok, learned, line }  (explore, learn, note)
tempo.budgetActive() -> an active window's identity, or null (we're free)
tempo.status() / tempo.reconcile()
```

Events (catalogue-declared in `lib/event-types.js`): `tempo:budget-start`,
`tempo:slice`, `tempo:budget-end`, `tempo:budget-cancelled`, `tempo:paced`.

## Contracts

- **Isolation:** the ledger lives INSIDE the brain at
  `models/private/<brain>/.tempo.json` (pass 209 containment ruling:
  the per-slice receipts are the D-constant telemetry, and they ride
  the horcrux/backup gather - a restored stone keeps its receipts
  trail). No legacy migration: this keeper shipped and contained in the
  same unreleased cycle; time accounting stays process math, and the
  receipts persist inside the brain stack - no work-path storage
  chain. Writes are crash-safe
  (`lib/primitives.atomicWriteFile`); a broken or failing slice
  callback is recorded as its own receipt line and **never** blocks
  any work path.
- **Determinism receipts:** every slice drops one ledger line - a budget
  ends with an auditable trail of what was actually done per slice. This
  is the telemetry the future formula D tunes from.
- **Resumability:** budgets persist with their window bounds; cross-process
  edits (the CLI `end` verb, a sibling process) are honored via mtime
  freshness checks; in-process in-flight budgets keep their state.
- **Idle consult:** `consciousness.setState('idle')` checks
  `tempo.budgetActive()` and emits `consciousness:tempo_idle` when a
  window is live - the idle state no longer decays to nothing silently.

## Open owner questions handled provisionally

| Question | Provisional answer shipped |
|---|---|
| Fixed-slice floor v1? | Yes - loop ships now, formula tuned later from receipts |
| Where does the budget live? | Ledger at `models/private/<brain>/.tempo.json` (contained in the brain tree; process truth, per-invocation via CLI) |
| End early allowed? | Only explicitly (`end(reason)`); default drains the window |
| Name | `tempo` (pace, not physics) |

## Related

- [Leisure](/vant/memory/leisure) - the want-list its budget gates
- [Era](/vant/reference/era) - the wake ledger the budget rides
- [Memory](/vant/memory/) - the section overview
