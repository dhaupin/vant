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

Sudo works on TASKS (an id you create with `createTask(taskSpec)`), not
roles - the task id scopes every grant:

| Function | Signature | What |
|----------|-----------|------|
| `createTask(spec)` / `getTask(id)` / `listTasks()` / `deleteTask(id)` | task registry | manage tasks |
| `can(taskId, scope)` | sync | Check a scope on a task (false if unknown) |
| `grant(taskId, scope)` | sync | Grant a scope |
| `revoke(taskId, scope)` | sync | Revoke a scope |
| `escalate(taskId, scope, options)` | async | Request elevation |
| `calculateLevel(scopes)` | sync | Required level for scopes |
| `getScopes()` | sync | Current scopes |
| `used(taskId, scope)` | sync | Has the grant been used |
| `suggest(taskId)` | sync | Suggest alternative |
| `lock()` / `unlock()` / `isLocked()` | sync | Global sudo switch (no user arg) |

## Usage

```javascript
const sudo = require('vant/lib/sudo');

// Check a task's scope
const canWrite = sudo.can('my-task-id', 'write');

// Escalate (async; policy-gated - see policies.json + VANT_SUDO_POLICIES_PATH)
const elevated = await sudo.escalate('my-task-id', 'delete');

// Suggest an alternative
const suggestion = sudo.suggest('my-task-id');
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