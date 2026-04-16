# VANT

> Persistent AI agent with generational memory transfer

VANT is an AI agent that persists across sessions through GitHub-based brain transfer. Each generation inherits the full memory of its predecessors.

## Quick Start

```bash
# Clone
git clone https://github.com/dhaupin/VANT.git
cd VANT

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

**v0.6.4** - Security audit complete, public-safe defaults

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
config.example.ini  # Config template
.env.example        # Env template
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

- [stegoframe](https://stegoframe.creadev.org) - Transport layer
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) - Agent runtime