---
version: 0.8.11
permalink: /guides/config
layout: default
title: Configuration
nav_order: 7
14
---

# Configuration

Configuration system for Vant.

## What

Vant uses configuration files and environment variables.

## Files

### config.ini

Main configuration file:

```ini
[vant]
repo = owner/brain-repo
provider = github

[github]
token = your-token-here

[agent]
name = MyAgent
role = Assistant
```

### Settings

Per-agent settings in `settings.ini`:

```ini
[agent]
name = AgentName
capabilities = canRead,canWrite,canNetwork
```

### Mood

Agent mood in `mood.ini`:

```ini
[mood]
temperature = 0.7
mode = focused
```

## Environment Variables

### Required

| Variable | What |
|----------|------|
| GITHUB_TOKEN | GitHub API token |
| GITHUB_REPO | Brain repository |

### Optional

| Variable | Default | What |
|----------|---------|------|
| VANT_MODE | cli | cli, mcp, headless |
| VANT_PORT | 3456 | Server port |
| VANT_DEBUG | 0 | Debug mode |

## CLI Usage

Load config:

```javascript
const config = require('./lib/config');
const settings = config.get();
```

Get specific value:

```javascript
const repo = config.get('vant.repo');
console.log(repo); // "owner/brain-repo"
```

Set value:

```javascript
config.set('agent.name', 'NewAgent');
```

## Runtime

Check runtime mode:

```javascript
const mode = config.get('runtime.mode');
console.log(mode); // "cli" | "mcp" | "server"
```

---

## See Also

- [Setup](setup) - Initial setup
- [Server](server) - Server configuration
- [Environment](legal/environment) - GitHub API limits