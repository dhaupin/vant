---
permalink: /guides/resolution.html
layout: default
title: Resolution
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
```

## Files

- `models/public/.resolutions/*.json` - Per-file resolutions
- `models/public/.resolution.json` - Ledger

## Resolution File

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

## API

```javascript
const resolution = require('./lib/resolution');

// Get status
const status = resolution.getStatus();

// Get ledger
const ledger = resolution.getLedger();

// Resolve entry
resolution.resolve('fears', 'fear of X', 'resolved', 'therapy');

// Deprecate entry
resolution.deprecate('goals', 'old goal', 'new goal');

// Reject entry
resolution.reject('identity', 'old belief', 'ethics changed');
```

## See Also

- [Succession](./succession.md) - Brain version tracking
- [Onboarding](./troubleshooting.md) - Knowledge base browser
- [Audit](./audit.md) - Compliance tracking