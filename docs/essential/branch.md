---
version: 0.8.11
permalink: /essential/branch
layout: default
title: Branch
nav_order: 10
9
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
const branch = require('./lib/branch');

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

## See Also

- [Multi-Agent](multi-agent) - Multi-agent workflow
- [Providers](providers) - GitHub, GitLab, etc