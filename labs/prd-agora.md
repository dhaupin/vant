# The Agora — Protocol Loop with Scope — Product Requirements Document

**Version:** 1.1
**Branch:** axolotl
**Date:** 2026-09-24 (v1.1 2026-09-25: closeout + passes 42-46)
**Status:** SHIPPED — Wave 5 (pass 40), Wave 6 (pass 41). Hardening: 42
(live-fire round 2), 43 (decision return path survives restart via ledger
metadata), 44 (forum decision log durable, state/forum.json), 45 (the
other "trifecta" name retired), 46 (agora MCP surface). See labs/TASKS.md.

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

## 8. Success criteria

1. A scoped decision loop works end to end: team-private thread →
   team-scoped vote → team-scoped barter → decision recorded back in
   thread, invisible to non-members, visible when 'public'.
2. Zero swapped-arg calls into consensus anywhere in lib/ (pin).
3. realm/encounter/spirit deleted with zero live references (pin).
4. Full sweep green; trust gains persisted quarantine/verify; no second
   voting state machine remains.
