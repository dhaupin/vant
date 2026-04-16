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

```bash
docker build -t vant .
docker run vant
```

## Related

- [Vant Registry](https://github.com/dhaupin/vant) - This repo (public template)
- [Vant Brain](https://github.com/dhaupin/vant-brain) - Full brain with identity/memories
- [Vant Docker Hub](https://hub.docker.com/r/dhaupin/vant) - Official Docker images
- [stegoframe](https://stegoframe.creadev.org) - Transport layer
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) - Agent runtime
---

## GitHub Actions Secrets (Optional)

For Docker Hub push workflow, add these secrets in repo Settings → Secrets → Actions:

| Secret | How to get |
|--------|------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | [Create token](https://hub.docker.com/settings/security) → New Access Token |

Without these, the build will fail on push but tests will pass.
