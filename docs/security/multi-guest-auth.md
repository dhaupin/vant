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
| `human` | read, load, list, write | the operator's dashboard UI |
| `agent` | read, load, list, write, exec, spawn | a working peer agent |

- `scopeOwner` is a `lib/scope.js` owner ref (`org:`/`dept:`/`team:`/`agent:`,
  validated by the same parser, fail-closed on unknown kinds) - the tenancy
  anchor for era-scoped listing (full per-tenant filtering of org-wide lists
  is the #185 remaining item, see MVP boundary below).
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

## MVP boundary (stated, not hidden)

- Shipped: issuance, verification, per-role door gating, revocation, pairing
  redemption, brain-scoped durable ledgers, guest-scoped calling identity.
- NOT yet shipped (tracked as #185's remaining runway): full per-tenant
  filtering of org-wide list surfaces (the era-scoped tenancy in the issue's
  acceptance), SSE taps (H2), cross-tenant enumeration throttling beyond the
  guest-management block. Until then, treat org-wide lists behind the door as
  operator-trust surfaces - guests must be issued knowing that.

*Transport-level security (loopback binds, TLS, requireKey) is unchanged and
removes nothing: [MCP Server](/vant/runtime/mcp) covers running and
tightening the door itself.*
