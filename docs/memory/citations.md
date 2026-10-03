---
version: 0.8.6
permalink: /memory/citations
layout: default
title: Citations
nav_order: 24
description: Git-backed grounding for agent claims - sources, formatted citations, and commit footers.
---

# Citations

> Claims in brain files get receipts. Receipts are git-backed.

When an agent writes a lesson or a decision, citations record where the
claim came from. The sources ride along in the brain and can be rendered
into commit footers, so memory and evidence travel together.

## Record a source

```javascript
const citations = require('./lib/citations');
citations.addSource('lessons.md#sync-race');
```

The argument is any reference your convention agrees on: a file, a file and
anchor, or a commit-ish.

## Render

List everything recorded:

```javascript
citations.getAll();
```

Format a single citation:

```javascript
citations.formatCitation(source);
```

Get the footer block for a commit message:

```javascript
citations.getCommitFooter();
```

Appending that footer to `git commit -m` puts the evidence trail directly
into history, where `git blame` finds it again.

## Verify and clean up

Check the stack:

```javascript
citations.getStack();
```

Verify receipts point at things that exist:

```javascript
citations.verify();
```

Clear the current set:

```javascript
citations.clear();
```

## Relationship to the brain

Citations are metadata about brain content, not a memory system of their
own. They live with the claims they support, and pruning the corpus does
not silently orphan them: generate a receipts file before a prune if you
want a point-in-time record:

```javascript
citations.generateReceipts();
```
