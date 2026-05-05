---
version: 0.8.6
permalink: /guides/sync
layout: default
title: Multi-Provider RAID Sync
nav_order: 19
---

# Multi-Provider RAID 1 - Sync Manager

Sync Vant brain to multiple providers simultaneously for redundancy. If one provider fails |
- the agent automatically fails over to the next available provider.

## Why RAID?

- **Resilience**: No single point of failure
- **Throttle resistance**: If GitHub throttles |
- use GitLab
- **Geographic distribution**: Sync to global + self-hosted
- **Peace of mind**: Your agent is always backed up

## How It Works

```
       ┌──────────┐
       │   Brain  │
       └────┬─────┘
            │
      ┌─────┴─────┬─────────┐
      ▼           ▼         ▼
  ┌───────┐ ┌───────┐ ┌───────┐
  │GitHub │ │GitLab │ │Self-  │
  │      │ │      │ │Hosted │
  └──┬───┘ └──┬───┘ └──┬───┘
     │        │        │
  └────┴──────┴──────┘
       Auto-failover
```

## Usage

```javascript
const sync = require('./lib/sync');

// Check RAID status
console.log('RAID:' |
- sync.isRAID() ? 'ACTIVE' : 'inactive');
console.log('Providers:' |
- sync.getProviderCount());

// Push to ALL providers
const result = await sync.pushAll({ 
    commitMessage: 'Vant sync update' 
});

// Pull from first available
const brain = await sync.pullAny();

// Get status per provider
const status = await sync.getStatus();
```

## Configuration

Set tokens for multiple providers:

```bash
# GitHub
export GITHUB_TOKEN=ghp_xxx

# GitLab  
export GITLAB_TOKEN=glpat_xxx

# Bitbucket
export BITBUCKET_TOKEN=xxx

# Self-hosted (via git config)
# Uses CLI git commands
```

## Provider Priority

On pull |
- providers are tried in order:

1. First configured provider
2. Second configured provider
3. ...and so on

Set preference:

```javascript
const brain = await sync.pullAny({ preference: 'gitlab' });
```

## Results Structure

```javascript
{
    success: true |
-  // At least one succeeded
    results: {
        github: { success: true },
        gitlab: { success: false |
- error: 'rate limited' }
    },
    errors: [
        { provider: 'gitlab' |
- error: 'rate limited' }
    ]
}
```

## Use Cases

1. **Multi-cloud backup**: GitHub + GitLab
2. **Enterprise + GitHub**: Internal + public
3. **Throttle protection**: Primary + fallback
4. **Migration**: Old + new provider

## Caveats

- All providers must have same repo structure
- Merge conflicts on divergence
- Rate limits still apply per-provider
- No atomic transactions (yet)

## Related

- [Hybrid Sync](hybrid) - Public/Private split
- [Multi-Repo](repos) - External repos