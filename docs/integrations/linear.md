---
version: 0.8.11
permalink: /linear.md/linear
layout: default
title: Linear Integration
nav_order: 35
description: Using Linear issue tracking with Vant
---

# Linear Integration

Vant integrates with Linear for issue tracking via GraphQL API.

```
┌─────────────────────────────────────────┐
│         Linear Issue Flow                │
│                                          │
│  Vant ──▶ Create issue ──▶ Linear       │
│           │                             │
│           ▼                             │
│      Sync to brain                      │
│           │                             │
│           ▼                             │
│      Link issue in comments           │
└─────────────────────────────────────────┘
```

## Why

Track agent work in Linear:
- Agent creates issues for tasks
- Updates status as it works
- Links to brain learnings
- Full audit trail

## Configuration

Get API key:
1. Go to Linear Settings → API
2. Create API key
3. Set environment:

```bash
LINEAR_API_KEY=lin_api_xxx
LINEAR_TEAM=your-team-id
```

## Usage

### Create Issue

```javascript
const linear = require('vant').linear;

const issue = await linear.createIssue('Fix authentication bug', {
    description: 'User cannot login with OAuth',
    priority: 1,
    teamId: process.env.LINEAR_TEAM
});

console.log(issue.id);    // "SYS-123"
console.log(issue.url);   // "https://linear.app/team/SYS-123"
```

### List Issues

```javascript
// Get open issues
const issues = await linear.listIssues({
    state: { name: { ne: 'Done' } }
});

// Filter by label
const bugs = await linear.listIssues({
    labels: { name: { eq: 'bug' } }
});
```

### Update Issue

```javascript
// Update status
await linear.updateIssue('SYS-123', {
    state: 'In Progress'
});

// Add comment
await linear.addComment('SYS-123', 'Working on this!');

// Assign
await linear.updateIssue('SYS-123', {
    assigneId: 'user_id'
});
```

### Close Issue

```javascript
await linear.updateIssue('SYS-123', {
    state: 'Done',
    resolution: 'Fixed in PR #45'
});
```

## Vant Integration

### Auto-Create Issues

```javascript
vant.onGoalCreated(async (goal) => {
    const issue = await linear.createIssue(goal.title, {
        description: Goal: `${goal.description}`,
        priority: goal.priority
    });
    
    await vant.learn('goals/' + issue.id, goal.description);
});
```

### Sync to Brain

```javascript
// When issue closes, learn from it
linear.onIssueClosed(async (issue) => {
    await vant.learn('decisions/' + issue.id, issue.resolution);
});
```

## GraphQL

Linear uses GraphQL. Key queries:

```javascript
// Issues query
const issues = await linear.query('query { issues { nodes { id title state { name } priority } } }');

// Create mutation
const result = await linear.query('mutation { issueCreate(input: { title: "New issue" teamId: "team_id" }) { success issue { id } } }');
```

## MCP Tools

When Linear island loaded:
- vant_linear_create_issue
- vant_linear_list_issues
- vant_linear_update_issue
- vant_linear_add_comment

---

## Related

- [Islands]/essential/islands - Load on-demand
- [MCP]/reference/mcp-tools - MCP server
- [GitHub](integrations/github) - GitHub integration