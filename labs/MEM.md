# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 68 — the three frame §5 gaps closed.
Waves G/H/I shipped: (G, 4b9486c) ask-peers — agora-sync status legs +
`askStatus`, mesh-status shareable/federated reports, `vant mesh status
--peers`; pins 8/8. (H, 5f6494d) third-org rites — `genesis.admit`/
`accept`, the commons key ring that grows WITHOUT re-keying,
member.intro merge-only adoption; THREE latent secret.js bugs fixed
(get-after-set shape mismatch, shapeless-expiry delete, dead colon-key
VAF path — genesis now stores `mesh-<a>-<b>`); pins 8/8 incl. a live
two-process round-trip. (I, ab5806d) the noticeboard — lib/notices.js
board + wire legs + scoped-topic-refusing decision bridge + `vant
notices` CLI; pins 8/8.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 68.
**Status:** UNBLOCKED. Frame §5 is CLOSED except the small msg-snapshot
TTL leg (gap 6). Open candidates: N-node soak (prd-mesh §8 item 6),
msg TTL leg, bin/genesis.js admit/accept parity (optional), OSS-D/OSS-E
(community depth, agent-contributor chapter), prd-world intake (waiting
on the synmergia backwards-PR).
**Owner context:** "vant is a source of truth model; world-building
exercise; the world needs state and interaction." Owner greenlit all
three §5 gaps this pass ("#1, #2a, and this #3"). Synmergia access
still via the backwards-PR flow (Freebuff app scope: dhaupin/vant
only; owner to revisit from desktop).
**BLOCKER:** none.

---

## CURRENT DUMP

(nothing in flight — Waves G/H/I shipped, verified, committed, pushed.
Next agent wakes to a closed §5 and an unblocked board.)

---

## Crash-Restore Procedure

1. `git status && git log --oneline -10` — confirm branch `axolotl`
2. Read `labs/TASKS.md` top session block — current state + next steps
3. Read `models/private/buffy/learnings.md` — hard-won patterns
4. Check this dump section for anything in flight
5. `node test/runner.js` — verify baseline before touching anything

---

## Session End Checklist

1. Update `labs/TASKS.md` — new top session block (what shipped, next steps)
2. Write brain learnings (models/private/buffy/)
3. Update this file — wipe CURRENT DUMP to "(nothing in flight)", set Handoff
4. Commit: `axolotl: pass NN — <one-liner>`
