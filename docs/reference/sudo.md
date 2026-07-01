---
version: 0.8.6
permalink: /reference/sudo
layout: default
title: Sudo API
nav_order: 84
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