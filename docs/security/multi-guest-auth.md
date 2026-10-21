---
version: 0.8.6
permalink: /security/multi-guest-auth
layout: default
title: Multi-Guest Auth
nav_order: 70
description: Per-identity multi-guest access to the MCP door - issuance, roles on the capability vocabulary, revocation, and the single-use pairing voucher
---

# Multi-Guest Auth (H1, #185)

Per-identity guest access to the MCP door. Not a fourth permission system: the
model is issued ON TOP of the trio that already exists - `lib/scope.js` owner
kinds (org/dept/team/agent), `lib/sandbox.js` capability vocabulary
(canRead/canWrite/canNetwork/canExec/canSpawn -> sudo scopes), and `lib/trust.js`
trust levels. One authenticated boot, many concurrent guests.

---

## Why guests are not habitat tokens

Habitat tokens (`vant_...`) mint per *agent* identity and resolve to that
agent's registry-verified RLS subject - holding one makes you BE that agent.
A guest dashboard holding an agent's token is impersonation, not multi-tenancy.

Guest tokens solve the other problem: external clients (a human operator, a
second dashboard, an observer) that act WITH their own identity. Same install,
many non-interfering clients.

| | Habitat token | Guest token |
|---|---|---|
| Resolves to | an existing agent's RLS subject | its own `guest:<id>` identity |
| Format | `vant_...` HMAC pair | `vguest_<id>_<secret>` random |
| Revocable | yes (delete) | yes (denylist record) |
| Carries | the agent's workspace roles | role -> capability map + scope owner + trust level |

---

## The record (lib/guests.js)

Ledger: `models/private/<brain>/.guests.json` - the `.audit.json` precedent
(brain-scoped, dotted, runtime JSON); rides the gitignored private tree.
Crash-safe atomic writes, path-safe brain scoping (hostile brain names cannot
escape `models/private/<cleaned>/`).

```json
{
  "id": "k3f9p2",
  "name": "rook-dashboard",
  "role": "human",
  "scopeOwner": "team:backend",
  "trustLevel": "medium",
  "tokenHash": "c41d…<sha256>",
  "createdAt": 1760000000000,
  "expiresAt": 1760600000000,
  "lastSeenAt": 1760000100000,
  "revokedAt": null
}
```

- Tokens are hashed at rest (SHA-256); the raw secret exists only at issue
  time, on the caller's console. Verification recomputes and compares
  timing-safely.
- Expiry optional (`--expires 7d` style specs); `revokedAt` denies immediately
  and permanently; `lastSeenAt` updates on every verified call.

---

## Roles ride the capability vocabulary

| Role | Capabilities (sandbox vocabulary) | Meant for |
|---|---|---|
| `observer` | read, load, list | read-only watcher; a malicious client cannot mutate |
| `human` | read, load, list, write, spawn | the operator's dashboard UI (the #185 acceptance: the dashboard assigns and SPAWNS work) |
| `agent` | read, load, list, write, exec, spawn | a working peer agent |

- `scopeOwner` is a `lib/scope.js` owner ref (`org:`/`dept:`/`team:`/`agent:`,
  validated by the same parser, fail-closed on unknown kinds) - the tenancy
  anchor for era-scoped listing (per-tenant filtering of org-wide lists
  landed in pass 213, see MVP boundary below).
- `trustLevel` is a `lib/trust.js` level (`high`/`medium`/`low`/`none`) and can
  only RESTRICT, never grant beyond the role map: `medium`/`high` keep the role
  grants (the #185 acceptance - a remote browser must be able to spawn work),
  `low` also strips `canExec`/`canSpawn`, and `none` caps the guest to read.

---

## The door gate (lib/mcp.js)

On every `POST /mcp/exec`:

1. Bearer token starting `vguest_` -> `guests.verify(token)` -> guest context
   (`userId: 'guest:<id>'`) carried for the whole execution via the existing
   request ALS. Unknown/expired/revoked token -> 401 with an honest reason.
2. `guests.authorize(tool, guest)` runs BEFORE execute:
   - **guest management tools** (`guest_issue`, `guest_list`, `guest_revoke`)
     are admin-only - a guest can NEVER manage guests (the #185 enumeration
     lesson: any guest-callable list-of-clients surface is an enumeration
     vector).
   - **unknown tool class counts as write**: denied to `observer`, allowed to
     writer roles. The classification is explicit and small (read patterns
     such as `*_load`, `*_list`, `*_status`, `*_state`, `*_get`, `*_read`),
     not a 300-entry mirror of the catalog.
3. The `mcp.requireKey` boundary accepts a valid guest token exactly like it
   accepts a habitat token: token auth IS the auth.
4. Plain `x-api-key` shared-key auth is unchanged and outranks guests.

---

## Pairing interplay

`vant headless` prints a pairing code and now also persists its hash in the
guest ledger (`pendingPairing: { hash, createdAt, expiresAt }`), so a
dashboard can redeem it from ANY process:

```bash
vant guest pair --code vhpair-...   # single-use; creates a `human` guest
```

Redemption consumes the code (hard fail on a second use), marks the pod's
pairing spent, and hands back the only copy of the raw `vguest_` token.
This keeps the gistory pattern honest: the code is a bootstrapping voucher,
not a standing credential.

---

## CLI and MCP surface

```bash
vant guest issue --name <name> --role human|agent|observer
                 [--scope org:acme|team:backend|...] [--trust medium]
                 [--expires 7d]
vant guest list                  # never shows raw tokens or full secrets
vant guest revoke <id>           # denylist: dead at once, in every future process
vant guest pair --code <code>    # redeem the headless pairing code
```

MCP tools (admin-only, invisible to guest tokens): `guest_issue`,
`guest_list`, `guest_revoke`.

---

## Revocation truth (the auth.js seam)

`Auth.revokeToken()` previously admitted (honestly) that stateless HMAC
tokens could not be revoked server-side and named H1 as the seam. That seam
is now real for `vguest_` tokens: `auth.revokeToken(token)` routes to
`guests.revoke()`. Habitat and shared keys keep their existing semantics.
`auth.checkPermission(key, perm)` answers truthfully for guest keys via the
same routing - the documented no-op note now applies only to non-guest keys.

---

## MVP boundary (stated, then closed in pass 213)

- Shipped: issuance, verification, per-role door gating, revocation, pairing
  redemption, brain-scoped durable ledgers, guest-scoped calling identity.
- Shipped pass 213 (H5, #185): PER-TENANT LIST FILTERING. The org-wide crew
  roster (`agent_list`) answers a guest with ONLY its tenant's rows:
  membership truth via `scope.resolveMembers` over the guest's `scopeOwner`; an
  unscoped guest sees an empty roster (fail-closed); another tenant's agents are
  withheld. A general matcher (`guests.tenantVisible`) applies the same rule to
  any record carrying an owner ref: unscoped record = public; scoped row is
  visible only to its own tenant or an ancestor container (org sees its depts
  and chained teams; dept sees its teams; an agent member sees its container).
- Shipped pass 214 (channel scope): msg channels carry a claim-once OWNER
  ref. `msg_list` withholds another tenant's scoped channel entirely
  (honest empty tail, no existence leak) and `msg_send` refuses it typed
  (`E_TENANT_CHANNEL`) BEFORE the write; a first guest write to an unowned
  channel stamps the guest's `scopeOwner` (claim-once). Unscoped channels
  stay public (the legacy read rule) - a scopeOwner-less guest IS the
  default tenant. The two bugs the story uncovered are fixed too: the
  handler passed STRING content into `msg.send` (garbage spread shape) and
  called `Msg.list()` with ignored arguments (every msg_list answered the
  conversation roster).
- Shipped pass 215 (enumeration throttle): guest read-class verbs carry a
  per-IDENTITY fixed-window read budget at the door (default 120 per 60s -
  a dashboard cadence, not a crawler; env `VANT_GUESTS_READ_BUDGET` to
  change, `0` disables; `VANT_GUESTS_READ_WINDOW_MS` is the tuning seam for
  tests). Exhaustion answers typed `429 E_GUEST_THROTTLED` with
  `retryAfterMs`; identity-keyed means two guests behind one NAT keep
  independent budgets and one burned budget never throttles a neighbor.
- Shipped (spawn-leg closure): the spawn leg of `work_assign` resolves
  through the FULL sandbox chain end-to-end - the door's guest gate
  classifies spawn-class verbs (`agents.spawn/delegate/kill/terminate/
  work_assign`, tested in `test/guests.test.js`), `lib/agents/core.js`
  spawn runs `sandbox.can('canSpawn')` (sudo-aware via CAP_TO_SCOPE,
  pass-118 connected, #162 persistent-grants aware), and the P2
dashboard renders the typed refusal verbatim when a guest's trust
  floor strips spawn. The knobs a HOST turns to answer TRUE are
  operator, pod-level, not guest-facing: `vant org grant` (persisted,
  boot hydrates widen-only), `sudo_grant`/escalation, or issuing the
  guest with an `agent`-grade role at `medium`/`high` trust. The pod
  NEVER widens canSpawn for a guest connection by default - deny-by-
  default stands; the refusal is the honest answer, not a missing
  feature.
- H6 QR pairing FYI: LANDED (pass-237-arc) - the pairing voucher is on
  the door (`pairing_offer`/`pairing_redeem`) and the dashboard's
  pairing module renders the scannable QR; `vant guest pair` remains
  the CLI door. What stays deliberate is the P6b e2e key-binding rung
  (prd-relay.md), not H6 itself.

*Transport-level security (loopback binds, TLS, requireKey) is unchanged and
removes nothing: [MCP Server](/vant/runtime/mcp) covers running and
tightening the door itself.*

---

## Related

- [MCP Server](/vant/runtime/mcp) - the door the guest auth rides on
- [VAF](/vant/security/vaf) - input validation at the door
