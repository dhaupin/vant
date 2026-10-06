# The Agora — Protocol Loop with Scope — Product Requirements Document

**Version:** 1.2
**Branch:** axolotl
**Date:** 2026-09-24 (v1.2 2026-09-25: federation wave, passes 47-51)
**Status:** SHIPPED — Waves 5-6 (passes 40-41), hardening 42-46 (live-fire
round 2, restart-durable return path, durable forum log, the other
"trifecta" retired, agora MCP surface). Wave 8 federation (passes 47-51):
escrow debit-on-trade, cross-machine state sync, the DISTRIBUTED AGORA
(remote voting over the crew-bus) + pass-51 live-fire hardening with the
live 2-process wire demo. See labs/TASKS.md.

---

## 1. Naming (owner decision)

"Trifecta" is retired — it implies exactly three participants and more
systems will join the loop. The loop is **the Agora**: the marketplace and
the civic assembly in one space. Systems participate by carrying `scope`;
membership in the loop is defined by that contract, not by a headcount.

Envelopes: `crew.forum`, `crew.market`, `crew.decision` (open set — a
future system adds `crew.<name>` with the same envelope rules).

## 2. Owner decisions (2026-09-24, pass 40)

1. **realm.js — DELETE.** Its ownership vision (org/dept/team/agent-owned
   spaces, private-or-visible) was never implemented beyond a 12-line
   orgId gate; the rest is a SECOND voting state machine duplicating
   consensus, with a swapped-arg seam. The concept moves into the agora
   as first-class `scope` on every entity.
2. **encounter.js — DELETE.** Discovery is node-registry (identity,
   persistence, consensus's vote anchor) + crew-bus (presence via signed
   envelopes). One identity system, zero aliases.
3. **spirit.js — FOLD into trust, then DELETE.** Verification +
   quarantine are trust-ledger concerns; trust is the persisted system.
   registry.js's spirit dependency migrates.

## 3. Scope contract (the agora membership rule)

One shared implementation, `lib/scope.js`, backed by teams.js (the real
org model: orgs ⊃ depts ⊃ teams, assignments with multibrain awareness).

```js
// Every agora entity carries:
scope: {
    owner: 'team:backend',   // 'org:acme' | 'dept:infra' | 'team:x' | 'agent:aria' | null (unscoped)
    visibility: 'scope'      // 'private' (owner entity only) | 'scope' (owner + members) | 'public'
}

// Rules (fail-closed, lenient-read):
// - owner 'agent:x'      -> members are just x
// - owner 'team:x'       -> members = team x's assigned agents
// - owner 'dept:x'       -> members = assignments with dept x (any team/org)
// - owner 'org:x'        -> members = assignments with org x
// - owner null           -> public-equivalent (unscoped entity, backwards compat)
// - unknown owner kind / unknown entity   -> DENY (fail-closed)
// - missing/legacy scope field -> treated as { owner: null, visibility: 'public' }
```

API: `scope.normalize(input)`, `scope.resolveMembers(ownerRef)`,
`scope.canAccess(entity, agentId)`, `scope.assertOwner(entity, agentId)`.
Fail-closed everywhere; teams.js stays the single source of org truth.

## 4. The loop (owner's vision, wired)

Discuss in forum -> trade knowledge in market -> decide via consensus ->
decision flows back to the thread. Concretely:

1. forum thread/publication carries scope; a proposal is born in-thread.
2. consensus ledger carries the same scope (team vote stays team-private
   by default); votes registry-anchored as today.
3. market listings carry scope (a team's barter offer can be
   scope-invisible; public listings anyone can trade).
4. On `vote:consensus` (passed/rejected), the decision record posts back
   to the originating thread — the return path that never existed.
   (Passes 43+44: the return path now SURVIVES restarts — proposal/author
   ride the persisted consensus ledger metadata, and forum's own decision
   log writes through to `state/forum.json`, FIFO-capped, hydrated at
   module load. All three legs of the loop are restart-durable.)
5. crew-bus envelope types `crew.forum` / `crew.market` / `crew.decision`
   carry scope so cross-node visibility matches local rules (a peer node
   must pass canAccess before it sees/dispatches the payload).

Persistence: free on consensus/market (state-store write-through, Waves
1-3); forum gains scope in its existing brain-backed publications.

## 5. Bug fixes riding this wave

- **forum.castVote swapped args:** calls `consensus.vote(voteId, name,
  choice)` — consensus's contract is `vote(topic, outcome, agentId)`.
  Voter name was recorded as the OUTCOME; choice as the AGENT. Fix +
  regression pin.
- **forum.vote ledger shape:** passes `{ proposal, author, duration }`
  into consensus.create, which ignores them (topic charset, options
  array required). Align with the real contract.
- **realm removed:** its swapped-arg `consensus.vote(proposalId, agentId,
  choice)` seam dies with the module.

## 6. Wave plan

### Wave 5 — agora foundation (pass ~40)
- lib/scope.js + suite (normalize/resolve/canAccess, fail-closed pins).
- Scope on consensus (create/vote enforcement + serialize/deserialize via
  state-store) + market (list/trade/search filters) + forum
  (publish/message).
- Fix forum↔consensus arg bugs; decision return path (consensus events →
  forum thread record); agora loop test (two-process: forum → vote →
  decision back in thread, scoped).
- crew-bus agora envelope types carrying scope.

### Wave 6 — retirements (pass ~41)
- spirit: quarantine(agent)/verify → trust (persisted via state-store);
  registry.js's spirit use migrated; delete lib/spirit.js.
- encounter deleted (its registry overlap + MCP tools mapped to
  node-registry equivalents first).
- realm deleted (+ transform gather/restore seams, registry wiring if
  any, vant/help/cli.md rows, docs).
- no-legacy pin: realm/encounter/spirit stay deleted.
- Full sweep + docs + TASKS entries + PRD closeout.

### Wave 7 — surface + naming closeout (2026-09-25, passes 45-46)
- The OTHER "trifecta" retired: the combined MCP+API server mode (`vant
  all`) also carried the name; live-tree mentions swept to "all mode"
  (pass 45). Historical records keep original wording.
- Agora MCP surface (pass 46): the 4 forum_* tools were mis-wired to the
  pre-agora API (forum_vote's (forumId,userId,topic,vote) into
  vote(proposal,options) — an MCP "up vote" silently CREATED a vote) —
  re-wired + forum_castVote added; consensus had NO tools —
  consensus_create/vote/tally/get/list added (scope-aware, schema-gated).
  Pinned via the real mcp.execute door (test/mcp-agora.test.js 5/5).

### Wave 8 — federation: the distributed agora (2026-09-25, passes 47-51)

The agora loop crossed machines. The vant-os PRD's next-wave shortlist,
shipped in dependency order — the economic loop closes before the
federation work begins:

- **Pass 47**: PRD closeout + the next-wave shortlist (this file's v1.1,
  vant-os v1.2).
- **Pass 48 — escrow debit-on-trade:** trades now DEBIT the buyer at the
  settle point (escrow.recordSpend — the old hold/release dance never
  moved budget; credit was reserved, never spent). Missing/zero price
  costs the default 1 (mirrors _checkBudget); barter strings stay free;
  debit refusal unwinds reservation + hold before settlement;
  trade.debit records the settlement. Pinned test/market-debit.test.js.
- **Pass 49 — cross-machine state sync:** lib/agora-sync.js, a pull/push
  seam over the crew-bus (crew.state.request → crew.state reply,
  crew.state.push return leg), NOT replication — state stays per-node.
  consensus exportTopic/mergeTopic re-derive ALL derived fields locally:
  THE WIRE CAN NEVER DECLARE A TOPIC PASSED. Adopt-only-unknown ballots,
  syncedFrom provenance, sanitized wire fields. Live 2-process probe.
- **Pass 50 — the distributed agora:** agora-sync.vote() casts a ballot
  on a PEER's topic by envelope. The OWNER runs its full local gate
  stack — scope resolves where the team registry lives, requireRegistry
  verifies the voter against the OWNER's registry, quarantine + one vote
  — and acks the verdict. The wire carries only {topic, outcome,
  agentId}; remote agents must be pre-registered (vetted) in the owner's
  node-registry. Unknown peers get silence (no vote oracle).
  Consensus hardening: the scope gate now runs BEFORE any state read —
  "scoped means unseen": a non-member cannot distinguish
  open/closed/expired on a topic it cannot see, nor flip a scoped ledger
  to 'expired' via a denied ballot. crew-bus.status() exposes the node's
  configured agentId for ballot attribution.
- **Pass 51 — live-fire hardening** (the adversarial round against 48-50):
  - **Merge scope-filter:** the envelope VOTE path gated scope, but the
    SYNC path did not — a registered peer could push a scoped snapshot
    with its own pre-stuffed ballot and the owner would tally it.
    mergeTopic now filters every adopted/born ballot through the owner's
    own scope.resolveMembers; an unresolvable scope rejects the merge
    (fail-closed, no partial state).
  - **Sender-bound reply legs:** vote.ack and crew.state replies resolve
    a pending round-trip ONLY when env.from matches the node that was
    addressed. An observed reqId can no longer forge a "vote accepted"
    verdict or feed the merge path a snapshot of its choosing.
  - **Edge probes (clean):** escrow debit — zero-price costs the default
    1, a consumed listing cannot double-debit, barter stays free.
  - **Live wire demo v0.3** (labs/node-crew/demo-v03-agora-wire.js): the
    pass-50 promised probe, on TWO REAL node processes — owner builds
    team + scope + topic owner-side; the peer casts a REMOTE ballot by
    envelope over the signed bus; the owner's gate stack runs; the ack
    carries the live tally (2 votes, passed); a cold third process
    tallies the persisted state. 4/4 phases ×3 consecutive runs.
  - Pins: test/agora-sync.test.js 7/7 (+2 live-fire),
    test/agora-distributed.test.js 6/6.

## 7. Files

- New: lib/scope.js, labs/prd-agora.md (this file), test/scope.test.js,
  agora loop pins.
- Wave 5 touched: lib/consensus.js, lib/market.js, lib/forum.js,
  lib/crew-bus.js.
- Wave 6 touched: lib/trust.js, lib/registry.js, lib/transform.js,
  lib/mcp.js (encounter/forum tools), bin/vant.js, bin/help.js,
  docs/reference/cli.md; deleted: lib/realm.js, lib/encounter.js,
  lib/spirit.js.
- Wave 7 touched: bin/help.js, bin/vant.js, lib/api.js,
  docs/operations/testing.md (pass 45); lib/mcp.js (agora tools),
  test/mcp-agora.test.js, test/forum-decisions-persistence.test.js
  (pass 46, plus 43/44 pins).
- Wave 8 touched: lib/market.js, lib/escrow.js, test/market-debit.test.js
  (pass 48); lib/agora-sync.js, lib/consensus.js (exportTopic/mergeTopic),
  test/agora-sync.test.js, labs/node-crew probe (pass 49); lib/agora-sync.js
  (vote + dispatchers), lib/consensus.js (scope-gate-first), lib/crew-bus.js
  (agentId in status), test/agora-distributed.test.js (pass 50); pass 51
  hardening: lib/consensus.js (merge scope-filter), lib/agora-sync.js
  (sender binding), labs/node-crew/demo-v03-agora-wire.js.

## 8. Success criteria

1. A scoped decision loop works end to end: team-private thread →
   team-scoped vote → team-scoped barter → decision recorded back in
   thread, invisible to non-members, visible when 'public'.
2. Zero swapped-arg calls into consensus anywhere in lib/ (pin).
3. realm/encounter/spirit deleted with zero live references (pin).
4. Full sweep green; trust gains persisted quarantine/verify; no second
   voting state machine remains.
5. (Wave 8) A team-scoped decision owned on node A can be voted on by a
   vetted peer on node B over the signed wire, with the full
   scope + registry chain enforced OWNER-side and every wire-born tally
   re-derived locally (demo v0.3 4/4 ×3; agora-sync 7/7,
   agora-distributed 6/6).
