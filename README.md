# Vant

> Persistent AI agent with generational memory transfer

Vant is an AI agent that persists across sessions through GitHub-based brain transfer. Each generation inherits the full memory of its predecessors.

## Quick Start

```bash
# Clone
git clone https://github.com/dhaupin/vant.git
cd vant

# Setup (interactive)
node bin/setup.js

# Or use templates
cp config.example.ini config.ini
cp .env.example .env
# Edit with your values

# Run
vant start
# or
node bin/vant.js start
```

## AI Prompt Init

Copy this prompt to your AI agent to set up Vant:

```
### Vant Setup

I need you to set up Vant (https://github.com/dhaupin/vant) as your persistent brain.

1. Clone the repo:
   git clone https://github.com/dhaupin/vant.git
   cd vant

2. Copy config templates:
   cp config.example.ini config.ini
   cp .env.example .env
   cp settings.example.ini settings.ini (optional)
   cp mood.example.ini mood.ini (optional)

3. Configure in config.ini:
   - GITHUB_REPO=your-github-username/your-repo
   - GITHUB_BRANCH=main (or create a branch for this agent)

4. Set GITHUB_TOKEN in .env or as environment variable

5. Test: node bin/build-test.js

6. Start: node bin/vant.js start

Important files to understand:
- bin/vant.js - CLI entry point
- bin/sync.js - Pull/push to GitHub
- bin/load.js - Load brain files into context
- lib/brain.js - Load brain with category folders (learnings/, memories/, decisions/, todos/)
- lib/lock.js - Multi-agent lock
- lib/branch.js - Git branch per agent

For a full personal brain, see: https://github.com/dhaupin/vant-brain (private)

Now confirm you're set up and ready to persist.
```

## CLI Commands

```bash
vant setup      # Interactive setup wizard
vant start      # Full startup (health → sync → run)
vant health     # System diagnostics
vant sync       # Pull from GitHub
vant load       # Load brain
vant run        # Start runtime
vant test       # Run build tests
vant watch      # Monitor GitHub changes
vant help       # Show help
```

## Configuration

### config.example.ini
Copy to `config.ini` and fill in:
- GitHub repo
- Stegoframe room (optional)

### .env.example
Copy to `.env` and set:
- `GITHUB_TOKEN` (required for sync)
- `STEGOFRAME_ROOM`, `STEGOFRAME_PASSPHRASE` (optional)

## Current Version

**v0.8.0** - Multi-agent support, brain refactor, auto-update

## Architecture

```
models/
  public/       # Default brain (safe for open source)
    identity.txt  # Public identity
    lessons.txt   # Public principles
    meta.json    # Version metadata
  v0.5.0/      # Full brain (private)
bin/
  vant.js       # CLI entry point
  setup.js      # Interactive setup
  health.js     # Diagnostics
  sync.js       # GitHub sync
lib/
  config.js     # Config loader
  brain.js      # Brain loader with category folders
  lock.js       # Agent lock for multi-agent
  branch.js     # Git branch per agent
  auto-update.js # Auto-save context to brain
config.example.ini  # Config template
.env.example        # Env template
```

## Multi-Agent Support

Vant supports multiple agents running simultaneously:

```javascript
const lock = require('./lib/lock');
const brain = require('./lib/brain');
const branch = require('./lib/branch');
const auto = require('./lib/auto-update');

// Acquire lock before work
await lock.acquire('agent-1');

// Work on your branch
await branch.checkout('agent-1');

// Track messages for auto-save
auto.addMessage('user', message);

// Before context fills...
if (auto.shouldUpdate()) {
    auto.writeToBrain(brain);
}
```

## Security

- No hardcoded credentials in defaults
- Uses environment variables for secrets
- User must configure own credentials
- Public model is identity-only, no secrets

## Docker

### Build
```bash
docker build -t vant .
```

### Run
```bash
# Quick start (requires env vars)
docker run -e GITHUB_TOKEN=your_token -e GITHUB_REPO=owner/repo dhaupin/vant

# With config file mount
docker run -v ./config.ini:/app/config.ini dhaupin/vant

# Interactive CLI
docker run -it dhaupin/vant vant help
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|------------|
| `GITHUB_TOKEN` | Yes | GitHub personal access token |
| `GITHUB_REPO` | Yes | owner/repo format |
| `GITHUB_BRANCH` | No | Branch (default: main) |
| `STEGOFRAME_ROOM` | No | Stegoframe room |
| `STEGOFRAME_PASSPHRASE` | No | Stegoframe passphrase |

### From Docker Hub
```bash
docker pull dhaupin/vant
docker run dhaupin/vant vant start
```

## Related

- [Vant Registry](https://github.com/dhaupin/vant) - This repo (public template)
- [Vant Brain](https://github.com/dhaupin/vant-brain) - Full brain with identity/memories
- [Vant Docker Hub](https://hub.docker.com/r/dhaupin/vant) - Official Docker images
- [Stegoframe](https://stegoframe.creadev.org) - Transport layer
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) - Agent runtime
---

## GitHub Actions Secrets (Optional)

For Docker Hub push workflow, add these secrets in repo Settings → Secrets → Actions:

| Secret | How to get |
|--------|------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | [Create token](https://hub.docker.com/settings/security) → New Access Token |

Without these, the build will fail on push but tests will pass.
