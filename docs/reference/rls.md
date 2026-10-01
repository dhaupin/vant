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

## Persistence

Workspaces, roles, and boundaries persist to the brain state store
(`state/_habitat.json` under the active brain). Mutations auto-persist
and restore serializes behind the instance's `_readyPromise` so a
restore can never clobber fresher state. `setWorkspace` is
deliberately session-scoped and not persisted.
