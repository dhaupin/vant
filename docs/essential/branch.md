---
version: 0.8.6
permalink: /essential/branch
layout: default
title: Branch
nav_order: 10
---

# Branch

Git branch operations for multi-agent workflows.

## What

Manage git branches programmatically:

- Create/checkout branches
- List branches
- Switch branches

## Get Current Branch

```javascript
const branch = require('vant').branch;

const current = await branch.currentBranch();
console.log(current); // "main" or "agent-name"
```

## List Branches

```javascript
const branches = await branch.list();
console.log(branches);
// ["main", "agent-1", "agent-2"]
```

## Create Branch

```javascript
await branch.create('agent-1');
```

## Checkout Branch

```javascript
await branch.checkout('agent-1');
```

## Delete Branch

```javascript
await branch.delete('agent-1');
```

## Merge Branch

```javascript
await branch.merge('agent-1');  // into current
```

---

## Provider Support

Branch works with:

- GitHub
- GitLab
- Bitbucket
- Gitea

```javascript
const { getProvider } = require('./lib/remote');

const provider = getProvider();
const branches = await provider.listBranches();
```

---

## Related

- [Multi-Agent](essential/multi-agent) - Multi-agent workflow
- [GitHub Integration](integrations/github) - GitHub, GitLab, etc