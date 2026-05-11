---
version: 0.8.6
permalink: /guides/citations
layout: default
title: Citations
12
---
# Citations

Git-backed source citation for grounded AI answers.

> **NEW in v0.8.6**: Force agents to cite sources with commit hashes.

---

## Concept

Vant can track what sources informed agent answers. Each citation links to a Git commit that provided the information.

**Why?**
- **Traceability** - Know where answers came from
- **Verification** - Verify claims against source commits  
- **Grounding** - Reduce hallucination by anchoring to facts
- **Audit** - Full activity lineage for compliance

---

## How It Works

1. Agent searches/browses knowledge sources
2. Each result gets a commit hash citation
3. Final answer includes `[Source: abc1234]` footer
4. User can verify by checking the commit

```
📋 Citations:
- a1b2c3d: brain/identity.md
- e5f6g7h: docs/guides/audit.md
```

---

## Usage

```javascript
const citations = require('./lib/citations');

// Add a source from search
citations.addSource(commitHash, 'brain/identity.md');

// Get formatted citation
const source = citations.getAll().pop();
console.log(citations.formatCitation(source));
// Output: [Source: abc1234] (brain/identity.md)

// Generate receipt for answer
const results = searchResults;
const receipt = citations.generateReceipts(results);
```

---

## API

| Function | Description |
|----------|-------------|
| `addSource(commit, context)` | Add a citation source |
| `formatCitation(source)` | Format as `[Source: hash]` |
| `generateReceipts(results)` | Generate receipt block |
| `verify(commit)` | Check citation exists |
| `getCommitFooter()` | Get footer for commits |
| `clear()` | Clear all citations |

---

## Related

- [Audit](audit) - Activity logging
- [Hybrid Search](hybrid) - RRF search with citations
- [Search](search) - Search with source tracking
- [Brain](brain) - Where citations stored
- [Sync](sync) - Git-backed sync