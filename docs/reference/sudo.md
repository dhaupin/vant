---
version: 0.8.6
permalink: /reference/sudo
layout: default
title: Sudo API
nav_order: 133
---

# Sudo API

AI-first permission escalation system.

## Functions

| Function | What |
|----------|------|
| `can(action)` | Check permission |
| `grant(role, action)` | Grant permission |
| `revoke(role, action)` | Revoke permission |
| `escalate(action)` | Request elevation |
| `calculateLevel(action)` | Required level |
| `getScopes(user)` | User scopes |
| `suggest(action)` | Suggest alternative |
| `lock(user)` | Lock user |
| `unlock(user)` | Unlock user |

## Levels

| Level | What |
|-------|------|
| 0 | None |
| 1 | Read |
| 2 | Write |
| 3 | Admin |
| 4 | Root |

## Usage

```javascript
const sudo = require('vant/lib/sudo');

// Check
const canWrite = await sudo.can('write');
// → true/false

// Escalate
const elevated = await sudo.escalate('delete');
// → { level: 2, expires: Date }

// Suggest
const suggestion = await sudo.suggest('delete');
// → alternative action
```

## MCP tools

The MCP surface exposes two grant doors with different parameter
styles (see `curl http://localhost:3457/tools` for the live list):

| Tool | Grants a | Stored under |
|------|----------|--------------|
| `sudo_grant(agentId, capability)` | Capability (`canRead`, `canWrite`, `canSpawn`, ...) | The mapped sudo scope (the sandbox CAP_TO_SCOPE table: `canSpawn` maps to `spawn`), plus the raw capability name so either verdict style finds it |
| `vant_sudo_grant(taskId, scope)` | Scope (`read`, `write`, `exec`, `network`, `spawn`, `admin`) | The scope as given |

The mapping matters because sandbox verdicts consult scopes:
`sandbox.can('canSpawn')` asks `sudo.can(agentId, 'spawn')`. Before
this was mapped at the grant site, a granted `canSpawn` could never
satisfy a `canSpawn` check (the escalation path was disconnected;
fixed in pass 119 and pinned by the E2E grand tour gate).