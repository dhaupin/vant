---
permalink: /vant/guides/succession.html
layout: default
title: Succession
---
# Brain Succession

Track brain versions and trust levels across generations.

## Concept

**Succession** manages:
- Brain version tracking
- Trust levels for memory inheritance
- Ledger of generations

Similar to crypto - each brain has a version history.

## Trust Levels

How much to inherit from previous brain:

| Level | Behavior |
|-------|----------|
| `high` | Load all files, inherit memories |
| `medium` | Load core files, cherry-pick learnings |
| `low` | Load minimal core, treat as reference |
| `none` | Load only identity, ignore previous |

## Files

- `_succession.json` - Version + trust config
- `models/.ledger.json` - Succession history

## Running

```bash
# Show current version
vant succession

# Set trust level
vant succession trust high
vant succession trust medium
vant succession trust low
vant succession trust none
```

## _succession.json

```json
{
  "version": "0.8.4",
  "succession": {
    "trust": {
      "default": "medium",
      "levels": {
        "high": "Full memory inheritance",
        "medium": "Core memory, selective learnings",
        "low": "Minimal reference only",
        "none": "Fresh start, identity only"
      }
    },
    "previous": {
      "version": "0.8.3",
      "date": "2026-04-19",
      "trust": "high"
    }
  }
}
```

## Ledger

Tracks succession history:

```json
{
  "version": "0.8.4",
  "created": "2026-04-20",
  "successions": [
    { "version": "0.8.3", "date": "2026-04-19", "label": "initial" },
    { "version": "0.8.4", "date": "2026-04-20", "label": "qc-release" }
  ]
}
```

## Use Cases

- **Release flow** - Bump trust on successful QC
- **Rollback** - Set `none` to start fresh
- **Experiments** - Low trust to test new brain
- **Production** - High trust for stable ops

## API

```javascript
const succession = require('./lib/succession');

// Get current version
const version = succession.getCurrentVersion();

// Get trust level
const trust = succession.getTrustLevel();

// Set trust level
succession.setTrustLevel('high');

// Get files for trust
const files = succession.getFilesForTrust('medium');
```

## See Also

- [Nodes](./nodes.md) - Persistent node
- [Resolution](./troubleshooting.md) - Mark thoughts resolved
- [Multi-Agent](./multi-agent.md) - Multi-node coordination