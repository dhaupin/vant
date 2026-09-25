# Mesh White Paper — Build Log

> The dated ride log. One entry per pass that touches the mesh. Honest
> mode: failures, gaps, and re-runs are part of the record. Newest
> first.

---

## Pass 57 — 2026-09-25 — Wave B: the genesis ceremony is a product

- `vant genesis create|join|status` (lib/genesis.js + bin/genesis.js):
  the hand-rolled handshake from the JV/demo harnesses becomes the
  productized flow. Pair secret generated host-side, returned ONCE,
  handed to the joiner OUT-OF-BAND (the wire never carries the secret
  that signs the wire); secrets stay in process memory or env — only the
  non-secret topology persists to state/genesis.json (kind-marked via
  state-store). The joiner's hello is signed with the pair secret and
  RETRIES with backoff (the host may still be booting — a lottery is
  not a ceremony); the host acks by vetting the joiner into ITS registry
  and JV team (host-side writes). A failed join never persists topology.
  Re-running create/join re-keys the pair (rotation in one command).
- **Found by the test suite before it shipped:** the ack carried the
  REQUESTED JV labels, not the RESOLVED record — the hello dispatcher
  was installed before the org model was built and captured `opts.jv`,
  so the joiner persisted a topology whose scope.owner pointed at a
  team id that did not exist. Every JV-scoped decision would have been
  fail-closed at the owner's gates. Fixed: JV built FIRST (with
  `{ error }` refusal handling on every teams.* call — a half-built JV
  fails the genesis loudly, never acks), dispatcher gets the resolved
  record (generated ids + scope), and E_DUPLICATE on re-genesis is
  rotation-reuse, not an error.
- Pins: test/genesis-ceremony.test.js 5/5 — two REAL processes (secret
  printed once → out-of-band handoff → acked with resolved JV ids →
  agora vote through the pair → joint tally PASSED), secret hygiene,
  host-side vetting, wrong-secret fail-closed, status surface (scope
  owner === resolved team id). JV exercise re-run 8/8; agora surfaces
  8+6+7 green.

## Pass 55 — 2026-09-25 — the paper goes public-first

- labs/prd-mesh.md generalized to v1.1 for the public repo: the host
  org's deployment becomes a labeled worked example behind a host note;
  N-install framing; "Adopting the pattern (any shop)" recipe.
- This white paper directory started (README + BUILD-LOG) so the mesh
  build has a public running record from the first wave onward.

## Pass 54 — 2026-09-25 — the mesh plan exists

- labs/prd-mesh.md v1.0: 4-install topology, gap list → wave plan A–F
  (MCP surface, genesis ceremony, TTL reaper + gossip, cross-node msg,
  envelope versions, observability; org-model sync leg standing).
  Every backlog item from passes 51–52 placed; nothing forgotten.
- Owner decisions: brain rides the repo / protocol state does not;
  Wave A first; dogfood a real 2-node mesh after A+B.

## Pass 53 — 2026-09-25 — scope consistency by design (the JV gap closed)

**Found by:** the pass-52 exercise (the gap was the product).

**Shipped:** teams refresh seam — merge-only `_hydrateTeams` +
throttled `refresh()`/`_refreshSync` + `_resetHydration`; scope.js
stale-view rescue (miss → throttled sync refresh → retry; fail-closed
preserved); teams+escrow brain resolution through state-store (a
VANT_BRAIN-scoped process no longer split-brains org model/budgets away
from protocol state).

**Pins:** test/teams-refresh.test.js 6/6. JV exercise re-run: 8/8
phases, 0 gaps — scoped decision delivery correct by design, not by
hydration-timing luck.

## Pass 52 — 2026-09-25 — the joint venture, live

**The moment the mesh became real:** two actual vant stacks (host org
+ partner org, 2 agents each) formed a JV end to end — genesis
handshake over the HMAC bus, JV org model with BOTH orgs assigned,
plan proposed under JV scope, partner votes REMOTELY through the
owner-side gate stack (acks show quorum at 3 ballots, passed at 4),
one joint ledger of 4 ballots from 2 orgs, decisions + scoped listing
+ payment crossing the boundary, cold third process proving
persistence.

**Result:** 8/8 phases ×2 consecutive runs. One gap recorded honestly:
teams.js hydrated its org model once at boot — receiving-side scope
gates were boot-race-dependent (correct by luck of timing on the
good branch; permanently blind on the bad one).

**Architecture lesson:** voting was immune the whole time — the
pass-50 rule "scope resolves where the team registry lives" carried
the cross-org decision with zero org-model replication. The remaining
work was delivery-side visibility, not a new vote mechanism.

## Pass 51 — 2026-09-25 — live-fire round 3: the wire fights back

**Two security bugs found in our own pass-49/50 wire code, both fixed
and pinned:**

1. **Ballot injection via sync:** the envelope VOTE path gated scope,
   but the SYNC path did not — a pushed snapshot could stuff
   non-member ballots into a scoped topic. mergeTopic now filters
   adopted AND wire-born ballots through the owner's own
   resolveMembers; unresolvable scope rejects fail-closed.
2. **reqId spoofing on reply legs:** vote.ack / crew.state dispatchers
   resolved any pending reqId from any origin. Pending round-trips now
   bind to the addressed node; forged verdicts and ledger replies from
   other origins are dropped.

**Also:** escrow edge probes clean (zero-price costs default 1,
consumed listings cannot double-debit, barter stays free); the
distributed-agora live wire demo (demo v0.3) passed 4/4 ×3.

## Pass 50 — 2026-09-25 — the distributed agora

Remote voting over the crew-bus: agora-sync.vote() carries only
{topic, outcome, agentId}; the OWNER applies its full local gate stack
(scope where the team model lives, registry vetting, quarantine, one
vote) and acks the verdict. Unknown peers get silence. Hardening:
scope gate runs BEFORE any state read ("scoped means unseen" — a
non-member can no longer distinguish open/closed/expired, nor flip a
scoped ledger to expired via a denied ballot).

## Pass 49 — 2026-09-25 — cross-machine state sync

The pull/push seam (crew.state.request → crew.state reply →
crew.state.push return leg). THE WIRE CAN NEVER DECLARE A TOPIC
PASSED: mergeTopic re-derives status/outcomes/hash locally. Adopt-only-
unknown ballots, syncedFrom provenance, sanitized wire fields. Live
2-process probe: node A creates + votes, node B pulls/votes/pushes,
both tally PASSED.

## Pass 48 — 2026-09-25 — the economic loop closes

**Found:** trades "paid" nothing — the hold/release dance never moved
budget; credit was reserved, never spent. **Fixed:** the settle point
debits the buyer (escrow.recordSpend; numeric prices debit, missing/
zero costs the default 1, barter strings stay free); debit refusal
unwinds reservation + hold BEFORE settlement. Pinned test/
market-debit.test.js 4/4.
