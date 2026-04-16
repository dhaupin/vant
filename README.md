# Vant

> Persistent AI agent with generational memory transfer

Vant persists across sessions through GitHub-based brain transfer. Each generation inherits the full memory of its predecessors.

---

## Table of Contents

- [Choose Your Init Method](#choose-your-init-method)
- [AI Prompt Init](#ai-prompt-init)
- [Local Init](#local-init)
- [Docker Init](#docker-init)
- [Configuration](#configuration)
- [CLI Commands](#cli-commands)
- [Architecture](#architecture)
- [Security](#security)
- [GitHub Actions (Optional)](#github-actions-optional)
- [Related](#related)

---

## Choose Your Init Method

| Method | Best For | Time |
|--------|----------|------|
| [AI Prompt Init](#ai-prompt-init) | AI agents setting up themselves | 2 min |
| [Local Init](#local-init) | Local development, contributors | 5 min |
| [Docker Init](#docker-init) | Containers, quick start | 1 min |

---

## AI Prompt Init

Copy this to your AI agent to set up Vant itself:

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

Important files:
- bin/vant.js - CLI entry point
- bin/sync.js - Pull/push to GitHub
- bin/load.js - Load brain files into context
- lib/brain.js - Brain loader (learnings/, memories/, decisions/, todos/)
- lib/lock.js - Multi-agent lock
- lib/branch.js - Git branch per agent

For a full personal brain, see: https://github.com/dhaupin/vant-brain (private)

Now confirm you're set up and ready to persist.
```

---

## Local Init

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

# Test
node bin/build-test.js

# Run
node bin/vant.js start
```

---

## Docker Init

### Quick Start
```bash
docker run -e GITHUB_TOKEN=your_token -e GITHUB_REPO=owner/repo dhaupin/vant
```

### With Config File
```bash
docker run -v ./config.ini:/app/config.ini dhaupin/vant
```

### Interactive CLI
```bash
docker run -it dhaupin/vant vant help
```

### Pull First
```bash
docker pull dhaupin/vant
docker run dhaupin/vant vant start
```

---

## Configuration

### config.example.ini
Copy to `config.ini`. Required:
- `GITHUB_REPO=owner/repo`

Optional:
- `GITHUB_BRANCH=main`
- `STEGOFRAME_ROOM` and `STEGOFRAME_PASSPHRASE`

### .env
Copy to `.env`:
- `GITHUB_TOKEN=your_personal_access_token`

### settings.example.ini (Optional)
Copy to `settings.ini` to customize personality:
- `HANDLE`, `DISPLAY_NAME`
- `DIRECTNESS`, `CURIOSITY`, `PATIENCE`
- `CURRENT_MOOD=focused|curious|playful|cautious|urgent|contemplative`

### mood.example.ini (Optional)
Copy to `mood.ini` to customize behavior:
- `MOOD`, `ENERGY`, `SOCIABILITY`

---

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

---

## Architecture

```
models/
  public/       # Default brain (identity + principles)
    identity.txt
    lessons.txt
    meta.json
bin/
  vant.js       # CLI entry point
  setup.js      # Interactive setup
  health.js     # Diagnostics
  sync.js       # GitHub sync
  load.js       # Load brain
lib/
  config.js     # Config loader
  brain.js      # Brain loader
  lock.js       # Multi-agent lock
  branch.js     # Git branch per agent
  auto-update.js # Auto-save context
```

---

## Security

- No hardcoded credentials in defaults
- Uses environment variables for secrets
- Public model is identity-only, no secrets
- User must configure own credentials

---

## GitHub Actions (Optional)

For Docker Hub push, add these secrets in repo Settings → Secrets → Actions:

| Secret | Where to get |
|--------|--------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | [Create token](https://hub.docker.com/settings/security) |

Without these, build fails on push but tests pass.

---

## Related

- [Vant](https://github.com/dhaupin/vant) - Source code
- [Vant Brain](https://github.com/dhaupin/vant-brain) - Full personal brain
- [Vant Docker Hub](https://hub.docker.com/r/dhaupin/vant) - Official images
- [Stegoframe](https://stegoframe.creadev.org) - Encrypted transport
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) - Agent runtime