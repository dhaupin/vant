# Multibrain Census — where the stacks convention reached, and where it didn't

**Pass 73, 2026-09-29.** Owner framing: 0.8.6 was a dirtbike-wheelie release —
mesh runtime shipped without the rest of the OS around it; multibrain + stacks
is a new convention and parts of Vant predate it. This census makes that
**known and consistent**: which subsystems resolve through the active brain,
which are flat pre-0.9, and which are global by design.

Method: grep-driven survey of every `models/` reference in `lib/` + `bin/`,
followed by live probes of the suspicious ones. Claims marked **VERIFIED**
were probed, not inferred.

---

## The convention (what "stack-aware" means here)

1. Persistence resolves through the **active brain per call** —
   `brain.getBrainPath()` / `brain.getPublicPath()` — never a hardcoded
   `models/private/...` prefix.
2. Path-active resolution honors **VANT_BRAIN env > currentBrain**
   (`state-store.currentBrain()` semantics — same rule pass 70 gave reads).
3. Long-lived services keep resolving across **pushBrain/switchBrain** moves
   (store-relative paths re-resolved per call, not captured at require time).

---

## Tier A — stack-aware (the convention holds)

| Subsystem | How it scopes |
|---|---|
| `lib/brain.js` | The convention itself: getBrainPath/getPublicPath, stack, pushBrain/loadStack/switchBrain |
| `lib/storage.js` | BrainStorage anchored to `getBrainPath()` per call; stack-walk helpers (L2158+) |
| `lib/state-store.js` | The resolver: `VANT_BRAIN env > currentBrain`, per-call, brain-scoped store files |
| consensus, forum, market, msg | All persist via state-store → brain-scoped |
| teams, escrow, agents/internal | orgchart trio — per-brain `orgchart/*.json` via the same resolver |
| cron | Via BrainStorage (brain-scoped) |
| memory, search, islands, audit, citations, schema, prune, security | `getBrainPath()` per call; several use `pushBrain()` for stack walks (audit, citations, schema, prune, security, vaf) |
| context, canvas, anchor | Scoped through brain paths (canvas code is scoped — its *comments* still say `models/private/canvas`, doc-rot only). anchor is cwd-anchored by design |
| `lib/transform.js` | Pass 72: horcrux payloads carry activeStack (identity) beside stack (inventory) |
| `lib/succession.js` | Reads `_succession.json` through `getPublicPath()` (brain-scoped) |

Net: the **core persistence spine** (brain → storage → state-store → every
stateful subsystem) migrated. The mesh layers sitting on it inherited
scoping for free.

## Tier B — flat / unmigrated seams

1. **`lib/mcp.js` brain_write handler (L277) — VERIFIED BUG.**
   `brain.saveFile('./models/private/' + name, ...)` bypasses brain scoping:
   a live probe wrote to `models/private/` **root** (outside any brain dir)
   with **no extension appended** — a file `read()` can never see. The
   documented MCP brain API silently breaks its own semantics. Fix is small:
   route through the same active-brain + extension-if-absent rules as
   BrainStorage/memory writes.
2. **`bin/succession.js` — VERIFIED divergence.** Reads
   `models/public/_succession.json` from the public **root** while
   `lib/succession.js` correctly reads via `getPublicPath()`. On any
   multibrain install the CLI can miss the config the library finds.
3. **`bin/node.js`** — the persistent node runner loads brain **flat** from
   `models/private` (MODEL_PATH env), no multibrain, no stack, and
   `saveBrain()` writes back flat. The most user-facing unmigrated surface.
4. **`bin/health.js`, `bin/load.js`** — flat `MODEL_PATH` defaults;
   `vant load <name>` even resolves `models/<name>` (pre-0.9 convention,
   outside private/public entirely).
5. **`lib/sudo.js`** — `models/private/sudo/{escalations.jsonl,templates.json,policies.json}`
   shared across **all** brains. Needs a design call, not a mechanical fix:
   policies arguably *should* be platform-global; the escalation audit trail
   arguably should be per-brain.
6. **`bin/brain-unlock.js`** — hardcoded `models/public/vant/boot/...`
   default (template-coupled; breaks if the default brain is renamed).
7. **`lib/config.js:174`** — `storage.path` default is flat `models/private`.
8. **Doc-rot:** `lib/version.js` header instructions reference flat
   `models/private/*.md` / `meta.json`; canvas comments (above).

## Tier C — global by design (leave; named so nobody "fixes" them)

- `models/state.json` — the stack itself. Global by definition.
- `lib/lock.js` — basePath `getBrainPath()/..` = `models/` — a lock server is
  cross-brain by nature.
- snapshot / compress (`models/` sidecars, `models/latent`) — tool-level
  artifact dirs, not brain-level memory.
- `lib/migrations.js` — crosses layouts by definition.
- `models/public/vant/` — the OS template / pub-baseline. Global input, not
  per-agent state.

---

## Suggested migration order

1. **mcp brain_write** (real semantic bug, small diff, restores documented
   behavior)
2. **bin/succession.js** (diverges from its own library — real miss risk)
3. **bin/node.js** (flagship flat surface → loadStack/switchBrain
   integration; also gets the horcrux restore path for free)
4. health/load defaults (cheap consistency pass)
5. **sudo.js** (design decision first: split per-brain audit from global
   policy)
6. doc-rot sweep (version.js header, canvas comments)

**Verification protocol per migration** (per learnings): fresh /tmp harness
with package.json + index.js copied (or the chain FATALs into silent nulls),
VANT_BRAIN pins for both sides of every read/write pair, and a negative
control (pre-fix behavior demonstrated) before believing the post-fix pass.
