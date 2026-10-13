---
title: "Era"
description: "The resumable incarnation ledger - one record per wake (issues #177 to #179)"
nav: 12
version: "0.8.6"
permalink: /reference/era/
layout: default
nav_order: 12
---

# Era

**Era is the resumable incarnation ledger**: one record per wake that says WHY
the agent got up (intent), WHAT happened (folded line-items from every
subsystem), and the one sentence the NEXT wake should start with (`next`).

Filed as the constructive convergence of first-user QC (#168 to #176 were all
*separately* amnesiac because no single record occupied "the span of one
wake"). Era is the event-bus subscriber - no subsystem changes to write into
it.

## Storage

| File | Content |
|------|---------|
| `models/private/<brain>/state/era-current.json` | the OPEN era (WAL + atomic rename via the arch-A state store) |
| `models/private/<brain>/state/era-eras.json` | closed rollups, FIFO cap 200, checksum-signed |

Reads fail closed: a state file that exists but is unreadable is a typed
`E_STATE_READ` denial, never a silent blank start.

## Record shape (v1)

| Field | Filled by |
|---|---|
| `intent` | REQUIRED at `era start` - one sentence: why this wake exists |
| `threads` | agent/task/sync events (spawn, delegation, brain sync) |
| `spend` | escrow/market events (holds, releases, debits) |
| `social` | forum/consensus/msg/node-registry events |
| `stones` | horcrux/universe/succession/audit anchors |
| `memory` | brain/memory events |
| `next` | the sentence `era close --next` writes for the next wake |
| `checksum` | sha256 over the whole record (lib/hash - the ONE hash source) |

Line-items cap at **250 per field**; at cap the field's `overflow: true` flag
flips and further items are dropped. `era close` compacts each field to
`{ count, byType }`.

## Lifecycle + CLI

```bash
vant era start "QC sweep of the boot surface"   # opens the era
# ...work happens; the bus subscriber folds events in automatically...
vant era                                         # current (open) era
vant era close --next "check the market suite first"
vant era list                                    # archived rollups (integrity-checked)
vant era verify <id-prefix>                      # re-verify a rollup's checksum
```

All verbs accept `--json`. Exit codes: 0 ok, 1 typed error, 2 usage.

`era close` emits `era:closed` AND `era:succession` - the hand-off event
mesh consumers can already key on today.

## Event routing (FIELD_FOR_EVENT)

The subscriber matches event **families** (split on the first `:`):

| Event family | Era field |
|---|---|
| `brain:` `memory:` | memory |
| `sync:` `agent:` `task:` | threads |
| `escrow:` `market:` | spend |
| `forum:` `consensus:` `msg:` `node-registry:` | social |
| `succession:` `horcrux:` `universe:` `audit:` | stones |
| `era:` | **never folded** (self-guard) |

Unknown families are skipped (never guessed). Folding is a strict NO-OP when
no era is open - zero behavior change for any install that never runs
`era start`.

## MCP tools

| Tool | Description |
|------|-------------|
| `era_start` | open an era (`intent` REQUIRED, schema-refused otherwise) |
| `era_log` | fold one manual line-item (`E_ERA_UNROUTED` if the family doesn't route, `E_ERA_NONE` if closed) |
| `era_close` | close + archive (`next` optional, capped 400 chars) |
| `era_current` | open era + integrity flag, or `open:false` |
| `era_list` | archived rollups with recomputed integrity |

## Chat threads ride the era (pass 212, #185 H3)

Every conversation can carry the era it belongs to (the side-panel rule):

```javascript
const msg = require('./lib/msg');
const era = require('./lib/era');
await era.start('map the boot surface');
const c = msg.create({ era: era.current().era.id, task: 'map-sweep-1' });
msg.eraContext(c.id);
// → { era, task, eraState:'open', rollup:{ intent, startedAt, integrity, lines:{...} } }
```

`eraContext` reports HONESTLY per state: `open` = the live record from
`era.current()` (bucket counts only, the shapes follow the era contract,
which compacts buckets to `{count, byType}` at close); `closed` = the
light archived record from `era.list()`; `unknown` = tagged with an id
neither open nor archived (no fabricated zeros); `untagged` = no era tag.
An OPEN era never makes someone else's conversation "open", the tag
must match the folding era's id (the cross-era pin). The era/task tag
rides the arch-A snapshot, so a chat keeps its tag through a restart.

## The horcrux hook (the #175 resurrection contract)

`era close` prints the rollup path and reminds about `vant horcrux refresh`:
the next stone bakes `next` into the boot surface, so a restore lands the
next wake INSIDE its last era - with yesterday's intent as its first prompt -
instead of into a blank.

## Deliberately NOT in this module (tracked in the appendix, #179)

Org/mesh scoping (scope-aware eras), agora sign-off on close, horcrux
AUTO-refresh, and the namescope registration. Era is read/subscriber-only
toward every existing subsystem - nothing else changed.

## Pinned

`test/era.test.js` (7 pins): typed refusals, subscriber no-op without an era,
cross-process persistence across THREE real child processes (open, fold, die;
resume+close, verify archive integrity), double-open refusal, tamper
detection on a mutated rollup, and the MCP door loop. `test/e2e-grand-tour`
gates the registry count.
