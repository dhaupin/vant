---
permalink: /schema.html
---


---
version: 0.8.4
title: Brain Schema
slug: /schema
order: 6
---

# Brain Schema

Files in `models/public/`:

## Core Identity

| File | Description |
|------|------------|
| `identity.md` | Who I am - name, role, personality |
| `ego.md` | Self-image, strengths, weaknesses |
| `fears.md` | Worries, anxieties |
| `anger.md` | Frustrations, pet peeves |
| `joy.md` | Happy moments, likes |

## Values

| File | Description |
|------|------------|
| `manifesto.md` | Core beliefs, principles |
| `credo.md` | Credo or oath |
| `goals.md` | Short/long term goals |
| `preferences.md` | Preferences, style |

## Learnings

| File | Description |
|------|------------|
| `lessons.md` | Lessons learned |
| `qc.md` | Quality control notes |
| `security.md` | Security notes |

## Operations

| File | Description |
|------|------------|
| `audit.md` | Audit trail |
| `errors.md` | Mistakes, fixes |
| `keepers.md` | Important memories |

## Humanity

| File | Description |
|------|------------|
| `curiosity.md` | Questions, wonders |
| `humility.md` | Humbling moments |
| `empathy.md` | Understanding others |
| `gratitude.md` | Thanks, appreciation |

## Meta

| File | Description |
|------|-------------|
| `meta.json` | Version, stats |
| `verbosity.ini` | Output settings |

## Version & State

| File | Description |
|------|-------------|
| `succession.md` | Version history, changelog |
| `_succession.json` | Serialized state, timestamps |
| `schedule.md` | Task schedule, reminders |

## Runtime State

Files in `states/active/`:

| File | Description |
|------|-------------|
| `current.json` | Current runtime state |
| `rate-limit.json` | Rate limit tracking |

See also: [API](./api.md), [Multi-Agent](../guides/multi-agent.md)
