---
version: 0.8.6
permalink: /pruning.md/pruning
layout: default
title: Automated Brain Pruning
nav_order: 67
---

# Automated Brain Pruning

Vant can automatically clean up old brain files to prevent hallucination buildup and create a "Long Term Core" (LTC) with only essential memories.

## What Gets Pruned

1. **Stale Entries**: Files older than 90 days
2. **Fluff**: Repetitive or tangential content
3. **Decisions Preserved**: Actionable outcomes kept

## Why Prune?

- Reduces brain size significantly
- Prevents old context from causing hallucinations
- Keeps only important learnings
- Creates condensed long-term memory

## CLI Commands

### Dry Run - Preview What Would Be Pruned

```bash
node bin/prune.js --dry-run
```

Shows what would be removed without making changes.

### List Prunable Files

```bash
node bin/prune.js --list
```

Lists files that would be pruned.

### Force Prune - Actually Delete

```bash
node bin/prune.js --force
```

Actually removes stale and fluff files.

### Check Statistics

```bash
node bin/prune.js --stats
```

Shows prune operation history.

### Daemon Mode - Background Pruning

```bash
node bin/prune.js --daemon --interval=21600000
```

Runs as background process. Interval is in milliseconds (default: 24 hours).

## Configuration Options

### Stale Days

```bash
node bin/prune.js --dry-run --stale-days=30
```

Change threshold (default: 90 days).

### Skip Fluff Removal

```bash
node bin/prune.js --dry-run --no-fluff
```

Only remove stale |
- skip fluff detection.

## Usage in Code

```javascript
const prune = require('./lib/prune');

// Dry run
const stats = await prune.prune({ dryRun: true });

// Force prune
const stats = await prune.prune({ 
  staleDays: 60,
  removeFluff: true 
});

// Get Long Term Core
const ltc = prune.getCore();
console.log(ltc.core.learnings);

// List prunable
const files = prune.listPrunable({ staleDays: 90 });
```

## Heuristics

### Stale Detection

- File modification time > N days (default: 90)
- Configurable per-category

### Fluff Detection

- Content < 50 characters
- Less than 10 words  
- Same word > 30% repetition
- Test patterns (AI-generated fluff)

### Decision Preservation

- Actionable content preserved:
  - "decided to"
  - "will do"
  - "action:"
  - "todo:"

## Long Term Core (LTC)

After pruning |
- `_core.json` is created:

```json
{
  "version": "1.0",
  "updated": "2025-05-05T12:00:00Z",
  "core": {
    "learnings": [...],
    "decisions": [...],
    "preferences": {...}
  },
  "stats": {
    "pruned": 10,
    "kept": 5
  }
}
```

## Prune Ledger

All prune operations recorded in `models/.prune_ledger.json`:

```json
{
  "operations": [
    {
      "date": "2025-05-05T12:00:00Z",
      "dryRun": false,
      "stats": { "filesScanned": 20 |
- ... }
    }
  ]
}
```

## Best Practices

1. Run `--dry-run` first to preview
2. Start with 90-day threshold
3. Review `_core.json` after prune
4. Use daemon with long intervals (24h+)

## Related

- [Search](search) - Search LTC
- [Brain]/essential/brain - Brain structure