---
version: 0.8.6
permalink: /multi-agent/branches
layout: default
title: Branches
nav_order: 47
---

# Branch

Git branch operations for multi-agent workflows.

## What

Manage git branches programmatically:

- Create/checkout branches
- List branches
- Switch branches## Get Current Branch

Branches live in `lib/branch.js` (there is no `vant.branch` getter -
`vant.agents` covers the runtime crew):

```javascript
const branch = require('./lib/branch');

const current = await branch.currentBranch();
console.log(current); // "main" or "agent-name"
```

## List Branches

```javascript
const branches = await branch.listBranches();
console.log(branches);
// ["main", "agent-1", "agent-2"]
```

## Create Branch

There is no bare `create` - checkout creates the branch when missing:

```javascript
await branch.checkout('agent-1');        // creates if absent (default)
await branch.fork('agent-1', 'agent-2'); // copy one agent's branch to another
```

## Checkout Branch

```javascript
await branch.checkout('agent-1', true);  // (agentId, create = true)
```

## Delete Branch

```javascript
await branch.deleteBranch('agent-1');          // local
await branch.deleteBranch('agent-1', true);    // also on the remote
```

## Merge Branch

```javascript
await branch.merge('agent-1');  // into current
```

Also exported: `commit(agentId, message)`, `push()`, `status()`,
`createPR()`, and the aliases `switchBranch` (= checkout) and
`getStatus` (= status).

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

- [Multi-Agent](/vant/multi-agent/agents) - Multi-agent workflow
- [GitHub Integration](/vant/integrations/github) - GitHub, GitLab, etc