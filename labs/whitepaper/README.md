# Running a Dev Shop on Vant — A Build in Public

> **Status: IN PROGRESS.** This is a white paper written *while the
> system is being built and used*, not after. Every claim links to a
> passing test, a pinned exercise, or a logged gap. Companion file:
> [BUILD-LOG.md](./BUILD-LOG.md) — the dated ride log.

**Host:** Buffy Labs — the org that builds vant itself. Everything here
is real: the deployment described is the one the host org runs.

---

## 1. The thesis

A modern dev shop is a federation of agents: one per project, plus a
coordination node. Each needs persistent memory, decisions, and
accounting. Each must stay sovereign — its own repo, its own brain,
its own state — yet cooperate when work is joint.

Vant's answer is the **mesh**: N installs federating over a signed bus,
with org-scoped sovereignty and agora-style joint ventures. This paper
documents the pattern *as it is built and deployed by the very org that
writes vant* — dogfooding in the strongest sense: the tool is the
product, the shop is the test bench.

**The claim we are testing, end to end:**

> An agent in its own workspace can join, vote on, sync with, and settle
> against another org's node using ONLY standard surfaces (MCP tools /
> CLI) — zero custom scripts.

## 2. The pattern (any shop)

1. **One install per org.** The brain lives in the org's repo; protocol
   state stays runtime-local (gitignored). A clone gets the brain; the
   ledger history stays on the machine.
2. **A coordination node is a peer with duties, not a master.** It hosts
   shop-wide proposals, QC, patching, observability. It holds no
   authority another org's gates don't grant.
3. **Joint work is a JV.** A joint org > dept > team contains BOTH orgs'
   principals. The host org owns the topic; scope resolves where the
   team registry lives; partners vote remotely through the owner's
   gates; escrow settles the work.
4. **The wire never declares truth.** Every synced tally is re-derived
   locally. Every reply is sender-bound. Gates run on the receiver.

## 3. The worked example (the host org's shop)

| Node | Org | Work |
|---|---|---|
| 1 | Buffy Labs | vant itself (this repo) |
| 2 | Synmergia Crew | game client (Godot MMORPG) |
| 3 | Roving Crew | client work (WordPress plugin + theme, more) |
| 4 | Ops HQ | coordination: proposals, QC, patching, CI |

Four installs, four brains, four repos. The mesh PRD
([labs/prd-mesh.md](../prd-mesh.md)) carries the full deployment plan
and wave roadmap.

## 4. Evidence base (what's proven so far)

Every item below is pinned in-repo as of this writing:

- **Restart-durable state** — kill any node mid-protocol; consensus,
  market, trust, registry, msg survive (test/state-persistence.test.js).
- **Signed transport** — HMAC envelopes, inbound webhook gate,
  sandbox-gated outbound; strangers get silence, not oracles
  (test/crew-bus.test.js).
- **Cross-machine sync that cannot lie** — pull/push seam; adopt-only-
  unknown ballots; all derived fields re-derived locally; the wire can
  never declare a topic passed (test/agora-sync.test.js).
- **Remote voting under the owner's gates** — scope, registry vetting,
  quarantine, one vote: enforced where the team model lives, not on the
  wire (test/agora-distributed.test.js).
- **The joint venture, live** — two REAL processes, two orgs, genesis
  handshake, JV org model with both orgs assigned, 4-ballot joint
  ledger, decisions crossing the boundary, escrow settlement, cold-
  process persistence (labs/node-crew/exercise-two-orgs.js).
- **Cross-node conversations** — the JV standup over the wire: bounded
  snapshots, merge-only adoption, owner-side gates on request and push,
  sender-bound replies; a vetted identity always beats the crew
  transport self-registration (test/msg-sync.test.js).
- **Observability from one node** — `vant mesh status` answers the
  coordinator's question read-only: peers, topics, decisions, budgets,
  channels, pending syncs; JSON mode for CI; degraded sections print
  their error instead of dying (test/mesh-status.test.js).
- **Interoperable wire** — envelope version stamps with a loud-refusal
  matrix: major mismatch (either direction) refused with an event,
  minor tolerated, unstamped = v1.0; a version claim never widens what
  a receiver accepts (test/crew-bus.test.js).
- **Adversarial hardening** — merge scope-filter (synced snapshots
  cannot stuff non-member ballots) and sender-bound reply legs (an
  observed reqId cannot forge verdicts); found by live-fire, pinned.
- **Scope consistency by design** — a long-lived node's stale org view
  is rescued on scope-miss (merge-only refresh, throttled, fail-closed
  preserved) (test/teams-refresh.test.js).
- **Real economics** — trades debit the buyer's budget at settle;
  debit refusal unwinds the trade (test/market-debit.test.js).

## 5. The roadmap from here

The mesh PRD's wave plan (A–F) is the build schedule and ALL SIX WAVES
ARE SHIPPED: MCP surface → genesis ceremony → ledger hygiene + gossip →
cross-node msg (pass 59) → envelope versioning (pass 61) → coordinator
observability (pass 62). The
[BUILD-LOG](./BUILD-LOG.md) tracks each pass as it lands, including
what broke and how it was found — the honest part.

## 6. Reading the code

- Architecture: [labs/prd-vant-os.md](../prd-vant-os.md) (persistence +
  transport), [labs/prd-agora.md](../prd-agora.md) (scope + the loop +
  federation), [labs/prd-mesh.md](../prd-mesh.md) (the mesh).
- The best single demonstration:
  `node labs/node-crew/exercise-two-orgs.js` — two real stacks forming
  a joint venture in under a minute, no mocks.
