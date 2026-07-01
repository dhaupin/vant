---
version: 0.8.6
permalink: /reference/consensus
layout: default
title: Consensus API
nav_order: 88
---

# Consensus API

Agent voting system - NOT crypto, just decision making.

## Functions

| Function | What |
|----------|------|
| `create(proposal)` | Create proposal |
| `vote(id, choice)` | Cast vote |
| `tally(id)` | Get vote count |
| `get(id)` | Get proposal |
| `list()` | All proposals |
| `resolve(id)` | Mark resolved |
| `getStats()` | Voting stats |
| `verify(id, voter)` | Verify vote |
| `checksum(id)` | Get integrity hash |

## Proposal States

| State | Meaning |
|-------|---------|
| `open` | Accepting votes |
| `closed` | Votes tallied |
| `resolved` | Decision made |

## Usage

```javascript
const consensus = require('vant/lib/consensus');

// Create proposal
const prop = await consensus.create({
    title: 'Update API',
    description: 'Change signature',
    choices: ['yes', 'no', 'abstain']
});
// → { id: 'prop_xxx', state: 'open' }

// Vote
await consensus.vote(prop.id, 'yes');

// Tally
const result = await consensus.tally(prop.id);
// → { yes: 3, no: 1, abstain: 0 }
```

## Events

| Event | When |
|-------|------|
| `vote:cast` | New vote |
| `proposal:created` | Proposal created |
| `proposal:resolved` | Resolved |