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

## Persistence

Workspaces, roles, and boundaries persist to the brain state store
(`state/_habitat.json` under the active brain). Mutations auto-persist
and restore serializes behind the instance's `_readyPromise` so a
restore can never clobber fresher state. `setWorkspace` is
deliberately session-scoped and not persisted.
