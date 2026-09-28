# The Steward Runbook — standing up a group's router install

> **Audience:** the team operating a corporate group of separate orgs
> on vant (the Acme engineering / Beta datacenters / Theta design
> shape — separate companies, one knowledge and decision chain).
>
> **What this encodes:** the pass-68/69 recorded decisions (frame.md §4
> addendum) and the proven live-fire (labs/node-crew/exercise-group.js,
> 11/11 phases, 0 gaps). Every mechanism named here is shipped and
> pinned — nothing in this runbook asks you to trust a claim the test
> suite doesn't back.

---

## 0. The model in one paragraph

A **group** of separate orgs sharing decision chains is modeled as a
**standing JV on a dedicated steward install** — the "router" node.
The steward hosts the group's org model and the group's agora topics;
it runs **no production work**. Member nodes stay fully sovereign:
their own org model, their own brains, their own budgets, their own
gates. Cross-org traffic is exactly the same signed, registered-peers-
only wire every other leg uses — the steward adds no new trust path.

The two rules that make it safe (both pinned):

- **Pass-50:** scope resolves where the model lives. Group topics live
  on the steward; the steward's gates admit ballots; members vote
  *remotely*.
- **Wave J (pass 69):** members hold a **resolution cache** (the
  org-sync replica) so they can *read* group topics locally without a
  round-trip. The steward stays the authority of record; the cache can
  only widen resolution to members the steward's signed model actually
  contains — never bypass a local denial.

---

## 1. Before you start: the trust inventory

| Thing | Where it lives | Who may write it |
|---|---|---|
| Group org model (org/dept/team/roles) | steward's `orgchart/teams.json` | the steward only |
| Group topics (scoped ledgers) | steward's `state/consensus.json` | the steward's gates |
| Member org models (local) | each member's own orgchart | each member only — the replica never touches it |
| Org-sync replicas | each member's `state/org-sync.json` | replaced only by a NEWER steward-signed generation |
| Budgets | each member's own escrow | the member (claims-not-cash: the steward records claims, never money) |
| Ring secret per pair | memory / `VANT_MESH_SECRET` env | genesis/rite only — never files, never the repo |

Sizing: the steward is **tiny** — a webhook receiver and JSON state.
No agent loops, no workshops, no brain pressure. A small VM is plenty
for a group of dozens of agents.

---

## 2. Stand up the steward (the router install)

Provision a clean vant install that will do nothing but steward. Then:

```bash
# On the steward (env or secrets manager — never committed):
export VANT_MESH_SECRET="$(openssl rand -hex 32)"   # the RING secret
export VANT_NODE_NAME=group-steward
export VANT_NODE_PORT=4890
```

Boot the bus the same way the exercise does (see
`labs/node-crew/exercise-group.js` CHILD_STEWARD for the canonical
shape):

1. `crewBus.configure({ name, port, secret, agentId })` — the secret is
   the ring secret.
2. `agoraSync.install(crewBus)` — the vote/status/pull legs.
3. `settlement.install(crewBus)` — the claims ledger legs.
4. `orgSync.install(crewBus)` — the replicate leg (as a receiver it is
   inert on the steward, but keep the surface symmetric).
5. **`orgSync.configureStewards(['group-steward'])`** — the steward
   never accepts foreign org models. This is the defense-in-depth
   allowlist; pin it.
6. `await crewBus.listen(port)`.

Create the **group org model** (the steward is the only writer):

```js
const teams = require('./lib/teams');
const org  = teams.createOrg('group-commons');
const dept = teams.createDept('group-ops', { org: org.id });
const team = teams.createTeam('group-chain', { dept: dept.id });
// Assign EVERY principal that will act in the group chain — members'
// agents included. These assignments are what group scopes resolve to.
for (const a of ['steward-lead', 'acme-1', 'beta-1' /*, 'theta-1', … */]) {
    teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
}
```

Register **vetting anchors** for every voter principal — `name` must be
the agent's **node name** so `resolvePrincipal` (pass-59) maps transport
ids for the settlement leg:

```js
const registry = require('./lib/node-registry');
registry.register({ id: 'steward-lead', name: 'group-steward', host: '127.0.0.1', port: PORT });
registry.register({ id: 'acme-1',       name: 'acme-node',    host: …, port: … });
registry.register({ id: 'beta-1',       name: 'beta-node',    host: …, port: … });
```

---

## 3. Rite the members into the ring

Each member boots its own sovereign stack, then joins. Two shapes:

**Pair (first member):** steward runs `genesis.create({ name:
'group-steward', joiner: { name: 'acme-node' } })`; hand the returned
secret to Acme out-of-band; Acme runs `genesis.join({ host:
'group-steward', secret, name: 'acme-node' })`.

**Ring (every member after):** the steward runs
`genesis.admit({ member: { name: 'beta-node', agentId: 'beta-1', port } })`
— this **reuses the ring secret, never re-keys** — and Beta runs
`genesis.accept({ host: 'group-steward', secret: <the same ring secret>,
name: 'beta-node' })`. The ack is the live proof of membership.

After each admission the steward broadcasts `member.intro`; standing
members adopt the new principal merge-only (unknown ids only,
provenance stamped, no secret on the wire).

Member-side boot requirements (from the live-fire):

```js
orgSync.install(crewBus);
orgSync.setProvider();     // activate the resolution cache
notices.install(crewBus);  // if the member posts to the board
```

Optionally narrow the receiver gate on members:
`orgSync.configureStewards(['group-steward'])`.

---

## 4. Replicate the model (Wave J)

The steward pushes its org model to every member:

```js
const orgSync = require('./lib/org-sync');
await orgSync.replicate(crewBus, 'acme-node');
await orgSync.replicate(crewBus, 'beta-node');
```

Rules the members enforce (all pinned in test/org-sync.test.js):

- The replica is **wholesale-replaced only when the generation is
  newer**; older/equal generations are ignored (replays and restarts
  converge, never regress).
- The replica is **separate** from the member's own org model. A
  member's agents can hold a local assignment AND a group assignment;
  neither shadows the other (resolution is local-first, replica-on-miss).
- **Revocation:** remove the agent from the steward's model, push with
  a bumped generation; the member's replica replaces wholesale and the
  agent resolves out of group scopes — fail-closed. Their LOCAL
  membership is untouched by construction.

Re-push after every org-model change. If a member was down, the next
push converges it; there is no queue to reconcile (the generation
monotone makes the latest push the only one that matters).

---

## 5. First group topic (the day-to-day loop)

1. **Propose on the steward** (forum/consensus, scoped to the group
   team): `scope: { owner: 'team:<group-team-id>', visibility: 'scope' }`.
   The topic lives on the steward — do not create it on a member; a
   member-owned copy is a different ledger the steward's gates never
   saw (this exact mistake is what the live-fire's first draft caught).
2. **Members vote remotely:** `agoraSync.vote(crewBus,
   'group-steward', topic, outcome, { agentId })` — the steward's
   owner-side gates (scope, registry, quarantine, one-vote, deadline)
   decide. The live-fire ran 3 ballots from 3 orgs into ONE passed
   ledger.
3. **Members read locally:** `agoraSync.pull(bus, 'group-steward',
   topic)` brings the ledger over; `consensus.get(topic, viewerId)` and
   `scope.canAccess(...)` admit members **through the replica** — no
   round-trip. Non-members stay denied (fail-closed).
4. **Execution economics:** publish the group listing **on the
   steward** (its gates hold the group scope — market has no cross-node
   sync leg by recorded design). The buyer's escrow debits on the
   buyer's own node; the steward records a **claim** (claims-not-cash).
5. **Announce:** `notices.bridgeDecision(topic)` **refuses** scoped
   topics by design (a scope's existence is not nameable on the commons
   board). Post the plain notice with outcome facts instead — that is
   the pass-52 broadcast pattern, one call.

---

## 6. Operating posture

- **Steward down = group writes pause.** Fail-closed by construction:
  nothing misresolves, nothing silently passes. Members keep working
  locally; remote votes/bids wait. This is the correct default — do not
  "fix" it with a second writable authority.
- **Restore, don't fail over.** The steward is state-light and its
  state files are portable (Ground). A dead steward is re-provisioned
  from backup and re-rited in minutes. Election/standby/rotation are
  deliberately deferred (frame.md §4 addendum) until a real crew
  demands them — recorded upgrade path, not speculative machinery.
- **Backups:** the steward's `orgchart/` (the group model — the one
  thing with no other copy) plus `state/` (ledgers, claims). Members
  back up their own brains/books as they always do; the replica is
  reproducible from the steward and needs no backup.
- **Rotation of the ring secret:** re-keying a pair is a re-genesis
  (rotation story, Wave B); admitting new members never re-keys
  (pass-68 rite). Keep `VANT_MESH_SECRET` out of dotfiles, shells, and
  repos — memory types and env only.
- **Monitoring:** `vant mesh status` locally, `vant mesh status
  --peers` federated (each peer serves a scope-filtered shareable
  report), `vant notices list` for the board.

---

## 7. Incident cookbook

| Symptom | Likely cause | Action |
|---|---|---|
| Member denied a group topic it should read | replica missing/stale | steward re-push; check `orgSync.replicaStatus().generation` on the member |
| Remote vote refused `scope_unresolved`/`E_SCOPE` | voter not in the steward's group model | add assignment on the steward, re-push |
| Remote vote refused registry error | vetting anchor missing or wrong `name` | anchors: `{ id: principal, name: nodeName }` |
| Settlement refused `E_BUYER_MISMATCH` | invoice buyer ≠ sending node's vetted principal | fix the registry anchor shape (pass-59) |
| Settlement refused `E_NO_LISTING` | listing created on a member, claim sought on steward | group listings live on the steward |
| Bridge returns `scoped_topic` | working as designed | post the plain notice instead |
| Member's local org model looks "merged" with the group's | you are on a shared-disk harness, not real deployment | separate brains/disks per node (`VANT_BRAIN`); in production this shape cannot occur |

---

## 8. Provenance

- Decisions: `labs/frame.md` §4 addendum (pass 68, owner-approved).
- Plan + scope: `labs/prd-mesh.md` Wave J.
- Mechanism: `lib/org-sync.js`, `lib/scope.js` (local → refresh →
  replica), pins `test/org-sync.test.js` 9/9.
- Live-fire: `labs/node-crew/exercise-group.js` — 11/11 phases, 0 gaps
  (the N-node soak), pass 69.
- Precedents honored: pass-50 owner-side gates, pass-51 sender binding,
  pass-53 stale-view rescue, pass-59 principal resolution, pass-65
  read-scope filtering, pass-67 claims-not-cash, pass-68 rite + board.
