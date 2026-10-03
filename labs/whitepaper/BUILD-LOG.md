# Mesh White Paper — Build Log

> The dated ride log. One entry per pass that touches the mesh. Honest
> mode: failures, gaps, and re-runs are part of the record. Newest
> first.

---

## Pass 62 — 2026-09-26 — Wave F: the commons becomes observable

- **`vant mesh status`** — the coordinator's question ("what are my
  agents working on, what's voted, what's blocked") answered from ONE
  node. Peers with stale detection, agora topics + the decision feed,
  market counts, budget aggregates, channel summaries, pending syncs,
  the genesis role, and the wire version (pass 61's stamp) in one
  read-only report. JSON mode for CI renders from the same object the
  human mode prints — one source of truth, two surfaces.
- **The posture is the pin.** Read-only: the suite builds reports
  against real state and proves before === after. No secrets. Scope
  stays owner-side — the market section uses the ANONYMOUS stats call
  (live-verified: a scoped listing shows as "1 listing, visible 0"
  — counted, never exposed), msg sections carry counts and ids but
  never content, and scoped agora topics stay filtered to members.
  DEGRADED NOT DEAD: poison one subsystem's require and only its own
  section carries the error — the rest of the report stands. The mesh
  is observable even when a leg is down.
- Live-verified against the real JV state from the test runs: 6 peers
  (stale ones flagged), the passed 4-ballot topic, the decision feed
  showing "ratify", the 8-credit JV payment in the budget aggregates.
- Pins: test/mesh-status.test.js 7/7. Full mesh regression green.

## Pass 61 — 2026-09-26 — Wave E: the stamps on the Post

- **Envelope version stamps (pass 61).** Every crew-bus envelope now
  carries `v: {major, minor}`; the receiver gates the stamp BEFORE the
  scope gate (refuse what cannot be parsed before interpreting it).
  Malformed stamps are dropped, not guessed; a MAJOR mismatch in either
  direction is refused loudly with a `crew:version:mismatch` event;
  MINOR differences are tolerated (additive); and unstamped envelopes
  flow as v1.0 — the current shape IS v1.0, so pre-Wave-E senders keep
  working.
- **The Wave-E watch-item is now a pin:** a version claim never widens
  acceptance. A forged future-major stamp dies at the version gate; a
  same-major stamp changes nothing downstream — the scope gate still
  refuses on the receiver's own resolvers. major 0 is malformed by
  design: no v0 wire shape ever existed to parse leniently.
- **One wrinkle, honestly:** a v1 receiver cannot meet a v1 sender as
  "the older one" — so the matrix test stages the receiver to v2 via a
  guarded seam (`_setReceiverVersion`) and the exported `ENVELOPE_V`
  getters read the LIVE receiver version. What we sign and what we
  accept cannot desync.
- Pins: test/crew-bus.test.js 20/20 (full cross-version matrix, both
  directions, v0 malformed, six malformed-stamp shapes, scope-gate
  precedence, live getters). Regression: every envelope-riding suite
  green, JV exercise 8/8.

## Pass 59 — 2026-09-26 — Wave D: the JV standup crosses the wire

- **The Post learns to carry conversations.** msg.js exports bounded,
  kind-marked snapshots; mergeSnapshot adopts only what the receiving
  conversation has never seen (in-memory wins, the wire never edits,
  reorders, or deletes local history) and records scope without ever
  REWRITING a local boundary. agora-sync gains the three legs — request
  (owner-side scope gate), reply (sender-bound), push (receiver-side
  gate) — the same posture ballots travel under.
- **The find of the pass: one node name, two identities.** The
  two-process JV standup leg failed 8/8→7/8 for a whole session. The
  break was invisible until the test recorded per-attempt reasons (the
  loop used to overwrite its result, so every mid-run failure hid
  behind the final ECONNREFUSED): the joiner was ALIVE and answering —
  replying not_found to the host's ask, then ECONNREFUSED after exit.
  Cause: a node name carries TWO registry entries (the crew-bus
  transport self-registration `crew_<name>` and the genesis-vetted
  agent identity), and the request leg's first-match name scan picked
  whichever hydrated first — the transport id — so the owner-side gate
  fail-closed a MEMBER's request. The fix is a registry-level
  `resolvePrincipal`: vetted identity beats transport id,
  deterministically, both insertion orders pinned. Gates run where
  identity state lives — Bodies, not the Post.
- **Also shipped:** labs/frame.md v0.1 — the Commons frame naming the
  environment above the agora (seven commons + stewardship, the
  sovereignty line, the gap list the mesh experiments feed).
- Pins: test/msg-sync.test.js 9/9, including the two-process standup
  (host posts under JV scope → joiner pulls through the vetted
  principal → joiner posts locally → the host's return pull converges
  BOTH orgs). Full mesh regression green in one sweep.

## Pass 58 — 2026-09-25 — Wave C: the mesh learns to clean up after itself

- **The reaper, and the bug the test suite caught before it could
  eat real data:** my first "hard guard" refused ledgers without a
  syncedFrom stamp — and a probe against real state immediately showed
  a LOCALLY created topic carrying the stamp. mergeTopic had been
  stamping syncedFrom onto existing local ledgers since pass 49 (the
  adopt path); pass-49's own test pinned that stamping as provenance.
  Reaping by that stamp alone would have eaten every local ledger that
  ever adopted a remote ballot. The fix is structural: `localOrigin` is
  a birth flag set ONLY by consensus.create; the adopt path now records
  `lastSyncFrom` (provenance survives for audit) WITHOUT branding the
  ledger synced; `consensus.reapSynced` requires BOTH marks, inside
  consensus, so no caller predicate can ever leak local state.
- **Hygiene rules:** synced ledgers age out at 24h; terminal ones reap
  when unreferenced — where "referenced" means a msg conversation named
  for the topic (the JV-standup pattern). Throttled 1/min per bus
  (pass-53 precedent). Reaped topics re-pullable by design; the round-
  trip pin proves a reaped ledger re-adopts cleanly via the pull seam.
- **Gossip:** the summary leg asks peers what topics they hold; the
  OWNER filters its own summary by the asker's member set — a scoped
  topic is never NAMED to a non-member (pass-50 rule now on the summary
  leg; the wire carries names only, details ride the gated pulls).
  Rounds pull details only for topics below local quorum, back off ×2
  on fully-failed rounds (30-min cap), enforce a per-peer pull floor
  shared by standalone rounds (a direct-gossipRound caller cannot
  bypass the miss-flood guard), and reply legs stay sender-bound
  (pass-51 rule).
- Pins: test/agora-hygiene.test.js 6/6. Full regression: agora-sync 7,
  agora-distributed 6, mcp-agora-sync 8, genesis 5, JV exercise 8/8 —
  all green in one sweep.

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
