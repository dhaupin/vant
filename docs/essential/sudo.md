---
version: 0.9.0-axolotl
permalink: /essential/sudo
layout: default
title: Sudo & Escalation
nav_order: 9
---

# Sudo & Escalation

Vant is deny-by-default. Dangerous capabilities (write, network, exec, spawn)
are refused until a **time-bounded, audited escalation** grants them.
Sandbox capability checks (`sandbox.can('canWrite')`, or the equivalent
`canWrite()` helpers) consult sudo when a task exists, so grants apply
everywhere consistently — lib and CLI alike.

## The model

```
sandbox.can(cap) ──task exists in sudo?──► sudo.can(taskId, scope)   (TTL verdict)
        │                                        │
        └─ no task ──► static capabilities map   └─ expires automatically
```

- **Static capabilities** are the floor (deny-by-default).
- **Escalations** are TTL grants recorded per task, per scope, with the
  requesting service attached. They expire exactly at `expiresAt` — no
  grace window — and can be revalidated only if the service policy allows.

## Service-tagged escalation

Every escalation names the service requesting it. The service determines the
policy: which scopes may be requested, the max TTL, and whether a human
callback is required.

| Service | Allowed scopes | Max TTL | Auto-approve | Callback required |
|---------|----------------|---------|--------------|-------------------|
| `boot`    | write, network, spawn, exec | 5 min | write, network | exec, spawn |
| `network` | network                     | 10 min | network        | — |
| `storage` | write                       | 5 min | write          | — |
| `mcp`     | read, write, network, exec  | 3 min | read           | write, network, exec |
| `agents`  | spawn, write                | 5 min | —              | spawn, write |
| `trust`   | write                       | 5 min | write          | — |

Untagged requests fall to the `default` policy: no scopes, 1 minute max.
**Always pass `service`.** Example from the storage layer:

```js
await sudo.escalate(taskId, 'write', { service: 'storage', reason: 'brain write' });
```

## Operator grant (CLI)

Scripted and CLI flows need a standing grant, not a per-call escalation.
`vant org grant` (prd-org-teams D-3) grants operator scopes + capabilities to
the current process and creates a sudo task so scope-level verdicts apply:

```bash
vant org grant                                    # default operator scopes
vant org grant --scopes read,write,spawn,execute  # custom scopes
vant org grant --capabilities canWrite,canSpawn   # custom capabilities
vant org status                                   # inspect current state
vant org config --set-operator-scopes read,write  # persist defaults
```

The grant lives for the process only. Persisted defaults are applied by
`vant org grant`, never silently at boot — boot still grants `['read']` only.

## CLI write gates

CLIs that perform destructive or write operations check write capability
before acting (`vant clean`, `vant snapshot`, `vant compress --adaptive`,
`vant succession log`, `vant bump --yes`). Dry-run modes stay ungated.
Inside a granted process tree they run normally; ungranted, they refuse with
`Write capability required`.

## Audit trail

Escalations emit events on the shared bus:

- `sudo:escalation_requested` — every ask (granted or not)
- `sudo:escalation_granted` — `{ taskId, scope, service, ttl, auto, expiresAt }`
- `sudo:escalation_denied` — `{ reason: not_in_whitelist | callback_denied | ... }`
- `sudo:escalation_revalidated` — TTL extensions with revalidation count

See [Audit](/advanced/audit) for event capture, and the sudo PRD
(`labs/prd-sudo.md`) for the full policy design.
