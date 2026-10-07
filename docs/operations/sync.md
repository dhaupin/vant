---
version: 0.8.6
permalink: /operations/sync
layout: default
title: Multi-Provider RAID Sync
nav_order: 53
---

# Multi-Provider RAID 1 - Sync Manager

Sync Vant brain to multiple providers simultaneously for redundancy. If one provider fails, the agent automatically fails over to the next available provider.

## Why RAID?

- **Resilience**: No single point of failure
- **Throttle resistance**: If GitHub throttles, use GitLab
- **Geographic distribution**: Sync to global + self-hosted
- **Peace of mind**: Your agent is always backed up

## How It Works

```text
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
console.log('RAID:', sync.isRAID() ? 'ACTIVE' : 'inactive');
console.log('Providers:', sync.getProviderCount());

// Push to ALL configured providers
const result = await sync.pushAll({
    commitMessage: 'Vant sync update'
});

// Pull from first available (order = registry order)
const pulled = await sync.pullAny();

// Prefer a specific provider on pull
const fromGitlab = await sync.pullAny({ provider: 'gitlab' });

// Per-provider connectivity + branch counts
const status = await sync.getStatus();
// { providers: { github: { connected, branches, current }, ... } }
```

`pullAny` returns the pulled corpus plus per-provider results; a
provider that fails is skipped and the next is tried. Also exported:
`rebase(provider)`, `diffCorpus()`, `scanConflictMarkers()`,
`getConfiguredProviders()`.

## Configuration

A provider is configured when its token + repo resolve. Tokens come
from config or env per provider class (`lib/connectors/`):

```bash
# GitHub
export GITHUB_TOKEN=ghp_xxx

# GitLab
export GITLAB_TOKEN=glpat_xxx
export GITLAB_REPO=owner/repo        # optional; else detected from git remote

# Bitbucket
export BITBUCKET_TOKEN=xxx

# Gitea / self-hosted (git-over-HTTPS via CLI git)
```

## Provider Priority

On pull, providers are tried in order:

1. First configured provider
2. Second configured provider
3. ...and so on

Set preference (reorders the trial order):

```javascript
const pulled = await sync.pullAny({ provider: 'gitlab' });
```

## Results Structure

```javascript
{
    success: true,  // At least one succeeded
    results: {
        github: { success: true },
        gitlab: { success: false, error: 'rate limited' }
    },
    errors: [
        { provider: 'gitlab', error: 'rate limited' }
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

- [Hybrid Sync](/vant/integrations/hybrid) - Public/Private split
- [Citations](/vant/memory/citations) - Git-backed source tracking
- [Multi-Repo](/vant/integrations/repos) - External repos