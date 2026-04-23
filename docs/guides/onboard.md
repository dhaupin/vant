---
permalink: /guides/onboard.html
layout: default
title: Onboarding
---
# Knowledge Base Browser

Browse and search Vant's knowledge base (brain).

## Concept

**Onboarding** provides:
- List brain files
- Search knowledge
- Read content
- Previews

## Running
Run the resolution system.

```bash
# Interactive browse
vant onboard

# Query specific file
vant onboard identity

# List all files
vant onboard --list

# Search for term
vant onboard --search therapy

# Search in file
vant onboard identity --search therapy

# Show summary
vant onboard --summary
```

## Brain Files

Standard brain layout in `models/public/`:

| File | What |
|------|------|
| `identity.md` | Core identity |
| `lessons.md` | Learnings |
| `goals.md` | Goals |
| `fears.md` | Fears/concerns |
| `knowledge.md` | Knowledge base |
| `style.md` | Working style |

## System Files

Underscore-prefixed files:

| File | What |
|------|------|
| `_schema.json` | Brain schema |
| `_succession.json` | Version/trust |
| `.ledger.json` | History |
| `.resolutions/*` | Thought status |

## Use Cases

- **Explore** - See what's in brain
- **Debug** - Check specific file
- **Search** - Find memory
- **Audit** - List all knowledge

## API
API reference and methods.

```javascript
const onboard = require('./lib/onboard');

// Get all brain files
const files = onboard.getBrainFiles();

// Get file content + metadata
const info = onboard.getFileInfo('identity.md');

// Full summary
const summary = onboard.getOnboardSummary();

// Search content
const results = onboard.searchFiles('therapy');
```

## Output Example
Parse onboarding output.

```
=== Onboarding: Vant Brain ===

Files:
  identity.md    (core identity)
  lessons.md   (learnings)
  goals.md     (goals)
  fears.md    (concerns)

Search: "therapy"
  - identity.md: 2 matches
  - lessons.md: 5 matches
```

## See Also

- [Succession](/vant/guides/succession.html) - Version/trust
- [Resolution](/vant/guides/resolution.html) - Thought status
- [Knowledge](/vant/guides/troubleshooting.html) - Knowledge base