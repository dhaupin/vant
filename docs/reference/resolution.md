---
version: 0.8.6
permalink: /reference/resolution
layout: default
title: Resolution
nav_order: 89
---
# Thought Resolution

Track thought status - resolved, deprecated, or rejected.

## Concept

**Resolution** tracks the state of thoughts:
- **Active** - Currently relevant
- **Resolved** - Addressed, completed
- **Deprecated** - Outdated, use new approach
- **Rejected** - Rejected, not applicable

## Statuses

| Status | What |
|--------|------|
| `active` | Currently relevant |
| `resolved` | Addressed, completed |
| `deprecated` | Use new approach |
| `rejected` | Not applicable |

## Running
Run the resolution system.

```bash
# Show status
vant resolution

# List all
vant resolution list

# List by status
vant resolution list resolved
vant resolution list deprecated
vant resolution list rejected

# Mark resolved
vant resolution resolve fears "fear of X" overcame via therapy

# Mark deprecated
vant resolution deprecate goals "old goal" replaced by new

# Mark rejected
vant resolution reject identity "old belief" ethics changed

# Show deltas
vant resolution deltas identity 5

# Mark with TTL (auto-expiry)
vant resolution resolve fears "fear of X" --ttl 86400000
vant resolution deprecate goals "old goal" --ttl 604800000
vant resolution reject identity "old belief" --ttl 2592000000

# Check if still active (returns ACTIVE or RESOLVED/DEPRECATED/REJECTED)
vant resolution is-active fears "fear of X"

# Clean up expired resolutions
vant resolution evict
```

## TTL (Time-To-Live)

Resolutions can have optional TTL for automatic expiry:

```bash
--ttl 86400000      # 24 hours
--ttl 604800000     # 1 week
--ttl 2592000000    # 30 days
```

**Behavior:**
- Expired resolutions are treated as `ACTIVE` (like they never happened)
- Use `vant resolution evict` to permanently remove expired resolutions
- Without TTL, resolutions persist forever
- `is-active` checks both status AND TTL expiry

## Files

- `models/public/.resolutions/*.json` - Per-file resolutions
- `models/public/.resolution.json` - Ledger

## Resolution File
How Vant handles brain conflicts and resolution.

```json
{
  "fears": [
    {
      "entry": "fear of X",
      "status": "resolved",
      "resolvedAt": "2026-04-20",
      "reason": " overcame via therapy"
    }
  ],
  "goals": [
    {
      "entry": "old goal",
      "status": "deprecated",
      "deprecatedAt": "2026-04-20",
      "replacedBy": "new goal"
    }
  ]
}
```

## Ledger
Track decisions on the blockchain.

```json
{
  "resolutions": [
    { "file": "fears", "status": "resolved", "entry": "fear of X" }
  ],
  "deltas": [
    { "file": "identity", "change": -3 }
  ]
}
```

## Use Cases

- **Therapy** - Mark fears as resolved
- **Pivot** - Deprecate old goals, add new
- **Ethics** - Reject outdated beliefs
- **Audit** - Track thinking changes


## Advanced

This doc has advanced API reference. See GitHub for latest.

## Related

- [Succession](essential/succession) - Trust levels
- [Brain](essential/brain) - Brain structure
- [Audit](advanced/audit) - Activity logging