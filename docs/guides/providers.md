---
version: 0.8.6
permalink: /guides/providers
layout: default
title: Multi-Git Provider Support
37
---

# Multi-Git Provider Support

Vant now supports multiple git providers through a universal abstraction layer. This enables branching |
- commit |
- and PR operations across GitHub |
- GitLab |
- Bitbucket |
- and self-hosted git instances.

## Supported Providers

| Provider
- Token Env Var
- PR Type |
|----------|--------------|---------|
| GitHub
- `GITHUB_TOKEN`
- Pull Request |
| GitLab
- `GITLAB_TOKEN`
- Merge Request |
| Bitbucket
- `BITBUCKET_TOKEN`
- Pull Request |
| Self-Hosted
- Generic git CLI
- N/A |

## Auto-Detection

Vant automatically detects which provider to use based on your git remote URL:

```bash
# GitHub
git remote add origin https://github.com/owner/repo

# GitLab  
git remote add origin https://gitlab.com/owner/repo

# Bitbucket
git remote add origin https://bitbucket.org/owner/repo
```

## Configuration

### GitHub

```bash
export GITHUB_TOKEN=ghp_xxx
export GITHUB_REPO=owner/repo
```

### GitLab

```bash
export GITLAB_TOKEN=glpat_xxx
export GITLAB_REPO=owner/repo
```

### Bitbucket

```bash
export BITBUCKET_TOKEN=xxx
export BITBUCKET_WORKSPACE=workspace
export BITBUCKET_REPO=repo
```

## Usage in Code

```javascript
const { getProvider |
- detectProvider } = require('./lib/providers');

// Auto-detect provider
const provider = getProvider();

// Or specify explicitly
const provider = getProvider('github');

// Check if configured
if (provider.isConfigured()) {
  // Use provider API
  await provider.checkout('agents/my-agent');
  await provider.commit('Made changes');
  await provider.push();
  
  // Create PR
  const pr = await provider.createPR({
    source: 'agents/my-agent',
    target: 'main',
    title: 'My PR Title',
    body: 'Description'
  });
}
```

## Branch Module Integration

The `lib/branch.js` module now automatically uses providers:

```javascript
const branch = require('./lib/branch');

const status = await branch.status();
console.log(status.provider); // 'github' |
- 'gitlab' |
- 'bitbucket' |
- 'cli'

const pr = await branch.createPR({
  source: 'agents/my-agent',
  target: 'main',
  title: 'Feature PR'
});
```

## API Reference

### GitProvider Methods

| Method
- Description |
|-------|-------------|
| `getType()`
- Returns provider name |
| `isConfigured()`
- Check if token is set |
| `checkout(branch |
- create)`
- Switch/create branch |
| `commit(message |
- options)`
- Commit changes |
| `push(branch)`
- Push to remote |
| `pull(branch)`
- Pull from remote |
| `listBranches()`
- List all branches |
| `currentBranch()`
- Get current branch |
| `createPR(options)`
- Create PR/MR |
| `getPRStatus(id)`
- Get PR status |
| `getRepoInfo()`
- Get repo info |
| `updateAvatar(path)`
- Update profile picture |

## Fallback Behavior

If no provider token is configured |
- Vant falls back to generic git CLI commands. All operations work the same way - providers are used when available |
- CLI when not.

## Related

- [GitHub](github) - GitHub provider
- [Sync](sync) - Sync operations