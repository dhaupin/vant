---
permalink: /reference/rls
---

# RLS (Row-Level Security)

Habitat is Vant's RLS layer: workspaces (isolated containers), roles,
boundary policies, and row-level filter/mask transforms. The single
source of truth is `lib/habitat.js`; `lib/rls.js` is the middleware
wrapper and `sandbox.generateCaps()` turns RLS decisions into
capability flags.

## The policy model

A **boundary policy** is attached to a resource key:

```json
{
  "readableBy": ["public"],
  "writableBy": ["role:admin"],
  "container": "default",
  "filter": ["ssn"],
  "mask": ["token"]
}
```

Resources without an explicit policy get the default: readable by
`public`, writable by `role:admin`, container `default`.

## Rule strings

`readableBy` / `writableBy` are arrays of rule strings evaluated by
`habitat._matches()`:

| Rule | Matches when |
|------|--------------|
| `public` | always (anyone) |
| `container:<ws>` | context workspace equals `<ws>` |
| `role:<r>` | context roles include `<r>` |
| `user:<id>` | context userId equals `<id>` |
| `team:<t>` | context team equals `<t>` |
| `brain:<name>` | context brain equals `<name>` |

An empty rules array admits everyone. A context that matches no rule
is denied - fail closed.

## Enforcement chain

1. **Container isolation first.** If the context's workspace differs
   from the policy's `container` (and the container is not `public`),
   access is denied before any rule is evaluated.
2. **Rule match** against `readableBy` (read) or `writableBy` (write).
3. **Row-level transform** (on `evaluate()`): `filter` strips fields,
   `mask` replaces field values with `[masked]`. Both accept either an
   array of field names or a function `(data) => data`.

### APIs on the habitat

| Method | Returns | Throws |
|--------|---------|--------|
| `can(userCtx, resource, mode)` | boolean | never |
| `check(userCtx, resource, mode)` | true | `RLS_DENIED` VantError |
| `evaluate(userCtx, resource, mode, data)` | `{ allowed, data }` | never |
| `containerAdmits(userCtx, resource)` | boolean (sync) | never |

The same denial contract is exposed by `lib/rls.js`
(`checkRead` / `checkWrite` throw `RLS_DENIED`) and by the MCP tool
`vant_habitat_check` (denial surfaces as a thrown coded error).

### Capability generation

`sandbox.generateCaps(userCtx, baseCaps)` maps workspace roles to
capability flags:

| Role | Caps |
|------|------|
| `viewer` | canRead |
| `editor` | canRead, canWrite |
| `admin` | canRead, canWrite, canAdmin, canDelete |

Fail-closed tenancy: a context claiming a workspace the habitat has
never heard of gets zero capabilities - caps are minted only for
workspaces that exist in the habitat registry.

## Agent identity

Spawned agents are RLS subjects. `agents.spawn()` calls
`habitat.provisionAgent()` automatically:

- **team agents** land in an `org-<team>` workspace
- **roleless agents** land in the default workspace as `editor`
- provisioning is idempotent (safe on every respawn/reboot)
- the agent that first provisions a workspace becomes its owner
  (admin), matching `createWorkspace`'s owner contract

The RLS subject for an agent is built by `habitat.agentContext(agentId)`
(also `agents.agentContext()`):

```json
{
  "userId": "agent_abc123",
  "agentId": "agent_abc123",
  "name": "worker",
  "workspace": "org-acme",
  "roles": ["editor"],
  "team": "acme",
  "brain": "vant"
}
```

## Surfaces

- **MCP tools**: `vant_habitat_status`, `vant_habitat_listWorkspaces`,
  `vant_habitat_createWorkspace`, `vant_habitat_setWorkspace`,
  `vant_habitat_addRole`, `vant_habitat_getUserRoles`,
  `vant_habitat_setPolicy`, `vant_habitat_getBoundaries`,
  `vant_habitat_can`, `vant_habitat_agentContext` (see
  [MCP tools](mcp-tools.md)).
- **CLI**: `vant habitat status|list|init|use|roles|grant|policy|boundaries|can|identity`
  and `vant rls context|allow|workspace` (see [CLI](cli.md)).

## Island boundaries (enforced at load)

Islands are RLS subjects under the resource key `_island:<name>`
(the same convention lib/rls.js always documented). Enforcement lives
in `lib/islands.js`:

- `load()`, `hydrate()`, and `save()` resolve an RLS subject (explicit
  `userCtx` option, else the current agent's habitat identity, else
  anonymous) and check the boundary policy BEFORE content moves.
- Row-level `filter`/`mask` policy fields apply to island DATA on load
  (storage/runtime islands; corpus content is a string and passes
  through untouched).
- Writes fail closed: an anonymous write to a gated island throws
  `E_ISLAND_WRITE_DENIED`; identified contexts need `writableBy`.
- **No policy = open island** (pre-84 behavior for all existing
  islands). Opt in per island with
  `vant habitat policy _island:<name> '<json>'` or the
  `vant_habitat_setPolicy` tool.
- Denials emit `island:denied` for the audit trail.

The MCP tools `islands_canAccess` (decision, resolving the current
agent's identity when no context is passed) and `vant_island_status`
(reports `boundary` info: gated, readableBy, writableBy, container)
complete the surface. On the CLI, `vant islands boundaries` lists the
gated islands and `vant islands load <name> --as <agentId>` loads one
through a specific agent's habitat identity.

## Per-workspace memory namespacing

Memory state (`memory.state`/`memory.recall`) participates in the same
subject chain. When a workspace resolves - explicit `workspace`/`userCtx`
options, else the current agent's habitat identity - the key is scoped
into a per-workspace namespace on disk: `ws<wsLen>.<ws>.<key>`
(e.g. `ws4.acme.proj`). The length prefix + dot separators keep the
namespace unambiguous under the storage key sanitizer (colons do not
survive; bare concatenation is collidable), and a 100-char composite
budget fails closed with `VAF_INPUT_INVALID` instead of silently
truncating.

- Namespaces are **isolating, not additive**: a resolved workspace reads
  only its own rows; anonymous callers never see scoped rows; flat keys
  keep working unchanged for anonymous callers.
- `workspace: null` (or `""`) pins a call **unscoped** - the escape hatch
  used by process-global state (habitat `_habitat`, nature `_flywheel`,
  context history) so persistence never fragments per workspace.
- Workspace names must match `[A-Za-z][A-Za-z0-9._-]{0,63}` (they become
  part of a filename).
- `vant_memory_state` / `vant_memory_recall` accept an optional
  `workspace` argument (omit = current agent identity when one exists;
  `""` = flat).

## Verified identity: habitat tokens (pass 86)

Spawned agents have habitat identities; MCP callers historically
declared `userCtx` arguments instead - self-asserted. Habitat tokens
make identity verified, not claimed:

- `vant habitat token mint <agentId>` (or `vant_habitat_mintToken`)
  anchors a bearer token to a spawned agent's habitat identity. The raw
  token is shown once; only its SHA-256 hash persists with the habitat
  state.
- Verification is registry-anchored: the token maps back to the
  agent's `agentContext()` subject at USE time, so roles granted or
  revoked after minting apply immediately - tokens carry authority,
  not a snapshot. Unknown/expired/revoked tokens and identities whose
  durable role rows are gone all fail closed (null).
- The MCP HTTP door (`POST /mcp/exec`) accepts the token as
  `Authorization: Bearer vant_...` (or `x-habitat-token`). A valid
  token satisfies the `mcp.requireKey` boundary by itself, and its
  registry-verified subject rides the whole request: for the wired
  tools (`vant_memory_state`, `vant_memory_recall`,
  `vant_habitat_can`, `vant_habitat_check`, `islands_canAccess`) the
  priority is **verified token > declared userCtx > current agent
  identity > anonymous** - a declared context never overrides the
  token. Money-admin tools (`escrow_setWorkspaceBudget`,
  `escrow_setWorkspaceMemberLimit`) accept the token's registry
  identity as the admin instead of a self-declared `adminId`.
- Revoke with `vant habitat token revoke` (persisted - dead in every
  future process). Tokens survive cold processes via the durable
  habitat role rows, not the memory-only agents registry.

## Agora tenancy (pass 87)

The forum is a COMMONS, not a vault - so its workspace semantics are
the mirror image of the memory namespaces (which isolate):

- Workspaceless publications are GLOBAL: every caller, including
  anonymous, sees them. All pre-87 posts stay visible - nothing broke.
- Workspace-tagged publications are visible ONLY to their tenant and to
  subjects holding a registry role in that workspace (cross-tenant
  moderation). Anonymous callers never see tenant posts: fail closed,
  and `get()` answers `found: false` - the same shape as a miss, so
  existence is not leaked.
- The subject chain is the ONE shared with islands (pass 84) and memory
  (pass 85): explicit `userCtx` -> current agent's habitat identity ->
  anonymous. Over MCP it rides the pass-86 priority: verified token >
  declared `userCtx` > current agent identity > anonymous.
- `publish()` stamps `workspace` + `authorAgentId` from the resolved
  subject. An explicit `workspace` pin must equal the subject's own
  workspace or a registry role held there (`workspace_denied`
  otherwise); `workspace: ""` pins a global post; invalid names fail
  closed (`invalid_workspace`).
- Surfaces: MCP `forum_publish` / `forum_list`, CLI `vant forum
  list|post|view` (tenancy-aware output), and mesh provenance:
  `shareableReport` carries the viewer's tenancy block and registered
  peers expose their `workspace`.

## Persistence

Workspaces, roles, and boundaries persist to the brain state store
(`state/_habitat.json` under the active brain). Mutations auto-persist
and restore serializes behind the instance's `_readyPromise` so a
restore can never clobber fresher state. `setWorkspace` is
deliberately session-scoped and not persisted.

Operator grants follow the same discipline (pass 88):
`orgchart.operatorCapabilities` (plus the existing
`operatorScopes`) persist in the brain's config, and boot applies them
to every fresh process — widen-only, so a persisted grant can never
narrow a host's authority. Mutating CLI flows
(`vant habitat grant/init/policy/token`, `vant agents spawn/kill`,
`vant org grant/demo`) drain the serialized save chain before exit, so
a fire-and-forget write can no longer race the process and silently
drop the mutation.
