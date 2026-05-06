---
version: 0.8.6
permalink: /guides/linear
layout: default
title: Linear Integration
description: Using Linear issue tracking with Vant
nav_order: 14
---

# Linear Integration

Vant integrates with Linear for issue tracking via GraphQL API.

## Configuration

```bash
LINEAR_API_KEY=your-api-key
LINEAR_TEAM=your-team-id
```

## Usage

```javascript
const linear = require('./lib/linear');

// List issues
const issues = await linear.listIssues({
    state: { name: { ne: 'Done' } }
});

// Create issue
const issue = await linear.createIssue('Fix bug', {
    description: 'Details here',
    priority: 1
});

// Add comment
await linear.addComment('issue-id', 'Working on it!');

// Update issue
await linear.updateIssue('issue-id', {
    state: 'Done'
});
```

## MCP Tool

When Linear island is loaded:

```
vant_get_islands    # Check loaded
vant_load_island  # "linear"
```

## GraphQL

All operations use Linear's GraphQL API:

- `issues` - Query issues
- `issueCreate` - Create issue
- `commentCreate` - Add comment
- `issueUpdate` - Update status
- `labels` - List labels

## See Also

- [MCP Reference](/reference/api)
- [Islands Guide](/guides/islands)