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
TTL leg (gap 6). **Decisions recorded (owner-approved):** the group
pattern (corporate-group shape = standing JV on a dedicated steward
install; org-model sync PROMOTED to planned Wave J as a resolution
cache — steward stays authority of record; `group:` scope kind set
aside) and the steward install (no new code needed: fail-closed gates,
claims-not-cash, merge-only sync, re-key-free rite admission all
pinned; election/standby/rotation deliberately deferred). Open
candidates: Wave J org-model sync (teams re-hydration seam + signed
org.replicate leg; live-fire = 3 real nodes), msg TTL leg, genesis CLI
parity, OSS-D/OSS-E, prd-world intake (waiting on the synmergia
backwards-PR).
**Owner context:** "vant is a source of truth model; world-building
exercise; the world needs state and interaction." Owner greenlit all
three §5 gaps this pass ("#1, #2a, and this #3"). Post-pass direction:
"enterprise grade — over-built plumbing NOW to avoid integration pain
later; defense in depth." The Acme/Beta/Theta triple-company group is
the owner's reference scenario for Wave J. Synmergia access still via
the backwards-PR flow (Freebuff app scope: dhaupin/vant only; owner to
revisit from desktop).
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
