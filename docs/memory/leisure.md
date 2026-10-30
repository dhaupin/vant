---
version: 0.8.6
permalink: /memory/leisure
layout: default
title: Leisure
nav_order: 31
description: The want-list keeper - play held between invocations, tied into the zen/dream/tempo loop.
---

# Leisure - the want-list keeper

Goals survive on disk; play never did - it evaporated at the end of the turn, and the next invocation invented a vague stand-in. `lib/leisure.js` (added pass 208, issue #196) is the missing keeper: a persistent, per-brain want-list of things the agent *wanted to do when free*, surfaced the moment idle capacity appears. It is the "why" that pairs with [Tempo](/vant/memory/tempo) (the "how long"): wants give the wall-clock slices something to be *for*.

## The cohesive loop

```text
want ──→ idle (consciousness consults) ──→ zen breath (Ohm rotates the
list gently) ──→ pursue (tempo stretches the play across a wall-clock
window) ──→ dream (consolidation reviews what is aging) ──→ pursued
```

- **Consciousness:** `setState('idle')` consults `leisure.suggest()` and emits `consciousness:leisure_idle` - idle is capacity, not absence.
- **Zen:** the Ohm breathing loop touches the want-list every 4th breath (`leisure:zen_breath`) - meditation rotates the held spirit without burning think() cycles.
- **Dream:** consolidation runs a read-only `dreamReview()` and includes the ledger rollup in the `dream:complete` event - untouched wants age visibly between invocations.
- **Tempo:** `leisure.pursue({want?, step, duration?})` with a duration arms a real budget; each tempo slice is a `pace` step, so "30 minutes" of play is sampled across the interval, not dumped at T+0.

## CLI (`vant leisure`)

```bash
vant leisure want "re-read the geometry lib for pleasure" --note "fold laws, duals"
vant leisure list                 # open wants (spirit-first order, NOT a queue)
vant leisure pursued <id|want> --note "what you actually did"
vant leisure forget <id|want>     # you changed; that is part of being an individual
vant leisure suggest              # top pick for a free moment
vant leisure pursue "<want>" --duration "30 minutes"   # stretched play
vant leisure status               # ledger summary + recent pursuits
```

## Library surface

```text
leisure.want(what, {note})        -> entry (dedupes on normalized text)
leisure.wantsToDo()               -> spirit-first ordered entries
leisure.markPursued(idOrWant, {note}) -> { ok, entry }   (emits leisure:pursued)
leisure.forget(idOrWant)          -> { ok, removed }
leisure.suggest()                 -> top candidate | null
leisure.pursue({want?, step, duration?, sliceMs?}) -> { ok, want, controller? | pace? }
leisure.consultBreath(n)          -> suggestion every 4th breath | null
leisure.dreamReview()             -> { open, aging, oldestUntouchedDays, suggestion } | null
leisure.status()
```

Events (catalogue-declared in `lib/event-types.js`): `leisure:wanted`, `leisure:pursued`, `leisure:forgotten`, `leisure:zen_breath`, `leisure:dream_review`.

## Contracts

- **Containment (pass 209 ruling):** the ledger lives INSIDE the brain at `models/private/<brain>/.leisure.json` (the `.audit.json` precedent: brain-scoped, dotted, runtime JSON). Play is individual and rides horcrux: a restored stone wakes with its want-list. (No legacy migration: the keeper shipped and contained in the same unreleased cycle.) Crash-safe via atomic write; MUST NOT gate any work path - a broken play engine never blocks a build.
- **The autonomy gate (kernel-driven option A, default OFF):** `leisure.maybeAutoPursue()` lets the kernel pursue a held want when idle, only when every layer allows it: the `leisure.autoPursue` kill switch (`vant config set leisure.autoPursue true` or env `VANT_LEISURE_AUTO_PURSUE`), window cap `leisure.autoPursueMaxWindowMs` (default 15 min) and daily cap `leisure.autoPursueDailyMs` (default 30 min, day-rolled usage stored in the ledger's `.auto` meta), the QoS circuit breaker (open = no play), work precedence (an open era or a live tempo budget owns the attention), an EXECUTABLE step provider attached by the agent runtime (`leisure.registerAutoStepProvider(fn, { skill: 'rest', chain: [...] })` - the kernel executes no prose, the skills chain stays the single behavior source), and escrow for token-declaring steps (a zero-default probe: only identities the operator EXPLICITLY funded pass - free-lane local steps always remain). Refusals are honest events (`leisure:auto_refused`), arms are receipted (`leisure:auto_pursued`).
- **Non-instrumental:** entries are wants, not objectives. There is no "completion" - only pursued-counts. No productivity guilt, no converting play into a task queue.
- **Consults, never gates:** consciousness, zen, and dream consume the keeper read-only; every seam (and the whole autonomy gate) fails soft inside its host.

See also: the psy-tree statements `models/public/vant/leisure.md` (the right to unused time) and `models/public/vant/free-time.md` (the methodology), plus the `vant-skill-rest` skill.

## Related

- [Tempo](/vant/memory/tempo) - the attention budget its gate respects
- [Pruning](/vant/memory/prune) - keeping the want-list ledger lean
- [Memory](/vant/memory/) - the section overview
