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
| `creed.md` | Core beliefs, principles |
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

## Schema / Cargo

Internal schema in `models/public/schema/`:

| File | Description |
|------|-------------|
| `memory-files.md` | Required + optional cargo definition |
| `transport-protocol.txt` | Instance transport protocol |

### Required Cargo

These MUST exist in every Vant instance:

| File | Description |
|------|-------------|
| `identity.json` | uuid, name, generation, parent_uuid |
| `ego.md` | Self-worth, what makes me valuable |
| `fears.md` | What scares me |
| `anger.md` | What frustrates me |
| `joy.md` | What delights me |

### Optional Cargo

Recommended files transported between instances:

| File | Description |
|------|-------------|
| `manifesto.md` | Self-definition |
| `goals.md` | Objectives |
| `humility.md` | Limitations |
| `creed.md` | Core beliefs |
| `lessons.md` | Hard lessons |
| `preferences.md` | Likes/dislikes |
| `schedule.md` | Time-based tasks |
| `security.md` | Access rules |
| `curiosity.md` | Questions |
| `empathy.md` | Human relations |
| `audit.md` | Change trail |
| `keepers.md` | Preserve across versions |
| `succession.md` | Version management |
| `qc.md` | Quality standards |
| `gratitude.md` | Appreciation |

See also: [API](./api.md), [Multi-Agent](../guides/multi-agent.md)
