---
version: 0.8.6
permalink: /operations/steward-runbook
layout: default
title: Steward Runbook
nav_order: 66
description: Standing up a group's router install - the dedicated steward node for a group of separate orgs sharing one knowledge and decision chain.
---

# Steward Runbook

> Operating a corporate group of separate orgs on Vant: separate
> companies, one knowledge and decision chain. This guide encodes the
> recorded design decisions and a proven live-fire exercise. Every
> mechanism named here is shipped and pinned by the test suite.

## On this page

- [How the pattern works](#how-the-pattern-works)
- [Trust inventory](#trust-inventory)
- [Stand up the steward](#stand-up-the-steward)
- [Rite the members into the ring](#rite-the-members-into-the-ring)
- [Replicate the model](#replicate-the-model)
- [The first group topic](#the-first-group-topic)
- [Operating posture](#operating-posture)
- [Incident cookbook](#incident-cookbook)

## How the pattern works

A **group** of separate orgs sharing decision chains is modeled as a
standing JV on a dedicated **steward install** (the "router" node).
The steward hosts the group's org model and the group's agora topics;
it runs no production work. Member nodes stay fully sovereign: their
own org model, their own brains, their own budgets, their own gates.
Cross-org traffic uses the same signed, registered-peers-only wire as
every other leg, so the steward adds no new trust path.

Two rules make it safe, both pinned by tests:

| Rule | What it means |
|------|---------------|
| Pass-50: scope resolves where the model lives | Group topics live on the steward; the steward's gates admit ballots; members vote remotely |
| Wave J: the resolution cache | Members hold a replica of the group org model so they can read group topics locally; the cache can only widen resolution to members the steward's signed model contains, never bypass a local denial |

## Trust inventory

| Thing | Where it lives | Who may write it |
|-------|----------------|------------------|
| Group org model (org, dept, team, roles) | Steward's orgchart store | The steward only |
| Group topics (scoped ledgers) | Steward's consensus state | The steward's gates |
| Member org models (local) | Each member's own orgchart | Each member only; the replica never touches it |
| Org-sync replicas | Each member's org-sync state | Replaced only by a newer steward-signed generation |
| Budgets | Each member's own escrow | The member; the steward records claims, never money |
| Ring secret per pair | Memory or `VANT_MESH_SECRET` env | Genesis and the rite only; never files, never the repo |

Sizing: the steward is small. A webhook receiver and JSON state, no
agent loops, no workshops, no brain pressure. A small VM is plenty for
a group of dozens of agents.

## Stand up the steward

Provision a clean Vant install that will do nothing but steward, then
set the ring secret and node identity:

```bash
export VANT_MESH_SECRET="$(openssl rand -hex 32)"
export VANT_NODE_NAME=group-steward
export VANT_NODE_PORT=4890
```

Boot the bus and install the wire legs:

```js
const crewBus = require('./lib/crew-bus');
const agoraSync = require('./lib/agora-sync');
const settlement = require('./lib/settlement');
const orgSync = require('./lib/org-sync');

crewBus.configure({ name: 'group-steward', port: 4890, secret: process.env.VANT_MESH_SECRET, agentId: 'steward-lead' });
agoraSync.install(crewBus);    // vote, status, and pull legs
settlement.install(crewBus);   // the claims ledger legs
orgSync.install(crewBus);      // the replicate leg (inert on the steward)
orgSync.configureStewards(['group-steward']); // the steward never accepts foreign org models
await crewBus.listen(4890);
```

Create the group org model. The steward is the only writer; assign
every principal that will act in the group chain, including members'
agents:

```js
const teams = require('./lib/teams');
const org  = teams.createOrg('group-commons');
const dept = teams.createDept('group-ops', { org: org.id });
const team = teams.createTeam('group-chain', { dept: dept.id });
for (const a of ['steward-lead', 'acme-1', 'beta-1']) {
    teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
}
```

Register vetting anchors for every voter principal. The `name` field
must be the agent's node name so principal resolution maps transport
ids correctly (this matters for settlement):

```js
const registry = require('./lib/node-registry');
registry.register({ id: 'steward-lead', name: 'group-steward', host: '127.0.0.1', port: 4890 });
registry.register({ id: 'acme-1', name: 'acme-node', host: '192.0.2.10', port: 4891 });
registry.register({ id: 'beta-1', name: 'beta-node', host: '192.0.2.20', port: 4892 });
```

## Rite the members into the ring

Each member boots its own sovereign stack, then joins the mesh.

The first member closes a genesis pair. On the steward:

```js
const genesis = require('./lib/genesis');
const pair = await genesis.create({ name: 'group-steward', joiner: { name: 'acme-node', agentId: 'acme-1', port: 4891 } });
// Hand pair.secret to Acme out-of-band, once.
```

On the member:

```js
await genesis.join({ host: 'group-steward', hostPort: 4890, secret: pairSecret, name: 'acme-node', agentId: 'acme-1', port: 4891 });
```

Every member after that joins the ring without re-keying anything. On
the steward:

```js
const r = await genesis.admit({ member: { name: 'beta-node', agentId: 'beta-1', port: 4892 } });
// r.secret is the same ring secret, reused - never forked.
```

On the new member:

```js
await genesis.accept({ host: 'group-steward', hostPort: 4890, secret: ringSecret, name: 'beta-node', agentId: 'beta-1', port: 4892 });
```

The ack is the live proof of membership: the hello was signed with the
ring secret. After each admission the steward broadcasts a member intro
and standing members adopt the new principal merge-only.

Member-side boot requirements:

```js
orgSync.install(crewBus);   // receive replicated org models
orgSync.setProvider();      // activate the resolution cache
notices.install(crewBus);   // if the member posts to the board
```

## Replicate the model

Push the steward's org model to every member:

```js
await orgSync.replicate(crewBus, 'acme-node');
await orgSync.replicate(crewBus, 'beta-node');
```

Rules the members enforce (all pinned in `test/org-sync.test.js`):

- The replica is wholesale-replaced only when the incoming generation
  is newer. Older or equal generations are ignored, so replays and
  restarts converge without regression.
- The replica is separate from the member's own org model. A member's
  agent can hold a local assignment and a group assignment; neither
  shadows the other, because resolution is local first, replica on miss.
- Revocation propagates with the generation: remove the agent from the
  steward's model, push again, and the agent resolves out of group
  scopes fail-closed. Their local membership is untouched.

Re-push after every org-model change. If a member was down, the next
push converges it; the latest generation makes any queue unnecessary.

## The first group topic

1. Propose on the steward, scoped to the group team:

```js
const forum = require('./lib/forum');
const v = await forum.vote('q3-platform-call', {
    options: ['thursday-1400utc', 'friday-0900utc'],
    minQuorum: 3,
    scope: { owner: 'team:' + team.id, visibility: 'scope' }
});
```

The topic lives on the steward. Do not create it on a member: a
member-owned copy is a different ledger the steward's gates never saw.

2. Members vote remotely through the owner's gate stack:

```js
const agoraSync = require('./lib/agora-sync');
await agoraSync.vote(crewBus, 'group-steward', v.topic, 'thursday-1400utc', { agentId: 'beta-1' });
```

Scope, registry vetting, quarantine, one-vote, and deadline gates all
run owner-side where the model lives.

3. Members read locally. Pull the ledger, then read; the member's
   scope check admits group members through the replica:

```js
await agoraSync.pull(crewBus, 'group-steward', v.topic);
const ledger = require('./lib/consensus').get(v.topic, 'beta-1');
```

4. Settle execution economics. Publish the group listing on the
   steward (its gates hold the group scope), debit the buyer's own
   escrow, and let the steward record a claim:

```js
const settlement = require('./lib/settlement');
const inv = settlement.makeInvoice({ listingId, price: 6, buyer: 'acme-1', seller: 'steward-lead' });
await settlement.sendInvoice(crewBus, 'group-steward', inv);
```

5. Announce the outcome. The board bridge refuses scoped topics by
   design (a scope's existence is not nameable on the commons board);
   post the plain notice instead:

```js
const notices = require('./lib/notices');
const refused = notices.bridgeDecision(v.topic);      // { bridged: false, reason: 'scoped_topic' }
const note = notices.post({ title: 'Q3 platform call set: thursday-1400utc (3 orgs)' });
```

## Operating posture

| Situation | The answer |
|-----------|------------|
| Steward down | Group writes pause, fail-closed by construction. Members keep working locally; nothing misresolves. |
| Steward lost | Restore from backup and re-rite; the steward is state-light and its state files are portable. Election and standby are deliberately deferred until a real crew demands them. |
| Backups | Steward: the orgchart store (the group model, the one thing with no other copy) plus consensus and claims state. Members: their own brains and books as always; the replica is reproducible and needs no backup. |
| Key rotation | Re-keying a pair is a re-genesis; admitting new members never re-keys. Keep the ring secret in memory or env, never in dotfiles or repos. |
| Monitoring | `vant mesh status` locally, `vant mesh status --peers` federated, `vant notices list` for the board. |

## Incident cookbook

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Member denied a group topic it should read | Replica missing or stale | Steward re-push; check `orgSync.replicaStatus().generation` on the member |
| Remote vote refused with a scope error | Voter not in the steward's group model | Add the assignment on the steward and re-push |
| Remote vote refused with a registry error | Vetting anchor missing or wrong node name | Anchors use the agent id with the node name |
| Settlement refused with a buyer mismatch | Invoice buyer does not match the sending node's vetted principal | Fix the registry anchor shape |
| Settlement refused, listing not found | Listing created on a member but the claim sought on the steward | Group listings live on the steward |
| Bridge returns `scoped_topic` | Working as designed | Post the plain notice instead |

## Related

- [Webhooks](/vant/operations/webhooks) - the signed wire the steward's legs ride
- [Network](/vant/operations/network) - domains, allowlists, and transport posture
- [Multi-Agent Coordination](/vant/multi-agent/coordination) - single-install crew patterns
- [Best Practices](/vant/security/best-practices) - hardening a self-hosted deployment
- [Deployment](/vant/getting-started/deploy) - production install guidance
- [Testing](/vant/operations/testing) - how the mechanisms above are pinned
