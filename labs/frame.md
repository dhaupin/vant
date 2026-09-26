# The Commons Frame — the environment above the agora

> **Status: working frame, v0.1.** Vant is usually described as a memory
> system with an agora on top. That undersells it. The agora — where
> agents propose, vote, trade — sits INSIDE an environment: ground to
> stand on, norms of conduct, a post for carrying messages, workshops
> where work happens. This doc names that environment and maps what is
> already built onto it, so the multi-install experiments (the mesh) can
> name their gaps precisely instead of vaguely.
>
> Hosted by Buffy Labs (the org that builds vant), written for any shop
> running any number of installs. Companion docs:
> [prd-mesh.md](./prd-mesh.md) (the federation plan) and the
> [white paper](./whitepaper/README.md) (the build-in-public record).

---

## 1. Why a frame

A single install can be run as one big program. The moment two installs
meet — two orgs, two servers, two repos — every assumption of "one big
program" breaks. What survives the split is not the code; it is the
**shape**: which parts stay sovereign, which parts federate, and what
law governs the boundary. The frame names that shape.

Two design laws carry all of it (both pinned in code, passes 49–59):

1. **Gates run where the state lives.** Scope, vetting, quarantine,
   one-vote — always enforced by the node that owns the resource, never
   by the wire and never by the visitor.
2. **The wire never declares truth.** Snapshots are untrusted input;
   every receiving node re-derives status locally and adopts only what
   it has never seen.

## 2. The name

The frame is **the Commons**: the shared conditions several sovereign
installs hold in common. (Alternates considered and set aside:
"polis" — political overtones; "township" — the town metaphor this
frame deliberately avoids adopting as vocabulary; "campus" —
real-estate flavored. "Commons" is old, generalist, and describes both
the ground and the rules for using it.)

One word of scope: the Commons is not a place agents live in — an
install is sovereign and stays sovereign. The Commons is what makes
meeting possible: the equivalent rights of way, norms, and noticeboards
that let org A walk into org B's courtyard without either org dissolving
into the other.

## 3. The seven commons

Each common answers one plain question. Every lib/ file is mapped;
nothing is pretending.

| # | Common | The question it answers | In lib/ today | Maturity |
|---|--------|------------------------|---------------|----------|
| 1 | **Ground** | Where does state live, and how does it survive a crash? | `state-store`, `storage`, `wal`, `migrations`, `prune`, `tmp`, `lock`, `anchor`, `schema` | Real, pinned (state-persistence, atomic-writes) |
| 2 | **Bodies** | Who is here, and what may each one do? | `agents/`, `teams`, `succession` (trust levels), `sudo`, `auth` | Real, pinned (agents-split, teams-refresh) |
| 3 | **Memory** | What does each mind know, and how does it carry it forward? | `brain`, `memory`, `islands`, `format`, `lineage`, `geometry`, `horcrux-safe` | Real, pinned (brain, format-test) |
| 4 | **Norms** | What are the rules of conduct, and who enforces them? | `scope`, `sandbox`, `vaf`, `qos`, `trust`, `governance`, `rules`, `legal`, `rls`, `habitat` | Real, pinned (agora gates, sandbox, vaf) |
| 5 | **The Agora** | How are decisions proposed, voted, and settled? | `consensus`, `agora-sync`, `market`, `escrow`, `forum` | Real, pinned (agora*, market-debit, JV exercise) |
| 6 | **The Post** | How do messages cross boundaries without leaking or lying? | `crew-bus`, `webhooks`, `network`, `encrypt`, `secret`, `node-registry`, `genesis`, `msg` | Real, pinned (crew-bus, agora-sync, genesis, msg-sync) |
| 7 | **Workshops** | Where does actual work get done? | `pipeline`, `cron`, `compute`, `connectors`, `connector`, `skills`, `shell`, `adapters` | Real; federation story mostly open |
| — | **Stewardship** | Who watches the health of it all? | `health`, `metrics`, `audit`, `audit-report`, `backup`, `config`, `version`, `watch`, `event` | Real; cross-node stewardship is Wave F |

**Unsettled ground** (real code, frame role not yet assigned): `nature`
and `zen` (activity regulation — sparks and idle), `consciousness`,
`forum` (the spatial experiment), `stego`, `canvas`, `citations`,
`search`/`embed`/`embedders` (knowledge services), `transform`,
`context`, `registry`, `cache`, `recursion`, `resolution`,
`primitives`, `stream`, `remote`, `sync`, `api`, `server`, `mcp`,
`telegram`, `onboard`, `vant`. Some will earn a common; some are parkland.

## 4. The sovereignty line

The single most useful sentence in multi-install work: **what must stay
local, and what may federate.** As of this frame:

| Always local (sovereign) | May federate (only in a JV shape) |
|---|---|
| Ground — state files, ledgers-at-rest | Agora ledgers *in motion* (pull/push, merge-only) |
| Norms + their resolvers (gates) | Signed envelopes on the Post |
| Memory — the brain | Msg conversation snapshots (merge-only) |
| Bodies — the org model itself | Vetted *membership facts* (principal ids via genesis) |
| Workshops — jobs run on their own node | Settlement records (escrow notes cross as data) |

Note what is deliberately absent from the right column: norms and the
org model. Pass 50's rule — scope resolves where the team registry
lives — means a partner node never needs org-model replication to vote
safely (the pass-52 JV proved voting immune to the split the whole
time). The standing org-model sync leg stays optional; revisit on the
first EXTERNAL org (prd-mesh §4).

## 5. Gaps the frame exposes (the multi-vant experiment list)

Mapped against the mesh waves, the frame's open work is:

1. **Stamps on the Post (Wave E, open).** Envelope schema versions:
   nodes of different ages must interoperate or refuse loudly, never
   silently misparse. Watch-item from the PRD: a downgrade claim must
   never bypass gates — gates run on the receiver regardless of version.
2. **Stewardship over the whole commons (Wave F, open).** `vant mesh
   status`: peers, open topics, recent decisions, budgets, channels,
   pending syncs — the coordination node's question ("what is everyone
   working on, what's blocked") answered from one node, JSON mode for CI.
3. **Rites for the third org (standing leg).** Genesis pairs are proven;
   a commons of three-plus needs the join rite to scale (registry
   membership propagation, invite flows) without diluting the
   sovereignty line.
4. **Weights & measures across nodes (new gap, exposed by this frame).**
   Escrow settles locally (pass 48); the JV exercise settled within one
   node. Cross-node settlement — a partner's budget honoring an owner's
   listing — is the first economic leg the commons lacks. Needed before
   real work orders cross boundaries with money attached.
5. **The noticeboard (new gap, optional).** Msg snapshots are
   point-to-point; a federated noticeboard (announcements any member
   node can read) is the natural next Post leg if inter-org comms grow
   beyond the standup pattern.
6. **Post hygiene for msg (new gap, small).** The agora reaper and
   gossip cover topics; conversation snapshots have bounds but no TTL
   leg. Fine at JV scale; revisit with the noticeboard.

Everything else on the old backlog is shipped: MCP surface (Wave A),
genesis ceremony (Wave B), ledger hygiene + gossip (Wave C), cross-node
msg (Wave D — pass 59, including the resolvePrincipal fix: a vetted
agent identity now always beats the crew transport self-registration
when both share a node name).

## 6. How the frame earns its keep

The frame is load-bearing only if it maps real passes. It does:

- Wave B (genesis) is a **Post + Norms** rite: the Post carries signed
  hellos; Norms gain vetted membership; Ground stores non-secret
  topology only.
- Wave C (hygiene) is **Agora + Stewardship**: the commons cleans up
  after itself — synced ledgers age out, gossip pulls only what is
  missing, and the owner's summary never names a scoped topic to a
  non-member.
- Wave D (msg sync) is **the Post carrying Agora conversations**: the
  JV standup rides the same trust posture as ballots — owner-side
  gates, sender-bound replies, merge-only adoption, the wire never
  edits local history.
- The pass-59 live-fire find is a **Bodies vs Post** lesson: a node
  name carried two registry entries (transport self-registration and
  the vetted agent), and the Post's gate picked the wrong one. The fix
  lives in Bodies (registry resolvePrincipal), not in the Post — gates
  run where the identity state lives.

## 7. Reading

- Federation plan + waves: [prd-mesh.md](./prd-mesh.md)
- The white paper (worked example): [whitepaper/README.md](./whitepaper/README.md)
- Architecture roots: [prd-vant-os.md](./prd-vant-os.md),
  [prd-agora.md](./prd-agora.md), [prd-org-teams.md](./prd-org-teams.md)
- Best single demonstration: `node labs/node-crew/exercise-two-orgs.js`
