---
permalink: /getting-started/install.html
layout: default
title: Installation
---
# Installation

Get Vant up and running in minutes. Choose your preferred method:

| Method | Best For | Time | Requirements |
|--------|----------|------|--------------|
| [NPM Install](#npm-install) | Quick setup | 2 min | Node.js 18+ |
| [Git Clone](#git-clone) | Development | 5 min | Node.js, Git |
| [Docker](#docker) | Production | 1 min | Docker |
| [AI Agent](#ai-agent-setup) | Self-setup | 2 min | GitHub token |

---

## NPM Install

The fastest way to get started:

```bash
# Install globally
npm install -g vant

# Verify installation
vant --version

# Run setup wizard
vant setup
```

### Requirements
- Node.js 18 or higher
- npm (comes with Node.js)

### Check Node Version

Check your Node version:

```bash
node --version
# Should be v18.x.x or higher
```

If you need to install Node.js, [download it here](https://nodejs.org/) or use a version manager:

```bash
# Using nvm (macOS/Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Using nvm-windows
winget install nvm
nvm install 18
nvm use 18
```

---

## Git Clone

For development or contributing:

```bash
# Clone the repository
git clone https://github.com/dhaupin/vant.git
cd vant

# Install dependencies
npm install

# Run the setup wizard
node bin/vant.js setup

# Verify everything works
node bin/vant.js health
```

### What's Included
```
vant/
├── bin/          # CLI executables
├── lib/          # Core modules
├── models/       # Brain files
├── docs/         # Documentation
└── package.json  # Dependencies
```

### Update Later
```bash
cd vant
git pull origin main
npm install
```

---

## Docker

### Quick Start
```bash
# Pull the image
docker pull dhaupin/vant

# Run with environment variables
docker run -it \
  -e GITHUB_TOKEN=your_token \
  -e GITHUB_REPO=owner/repo \
  dhaupin/vant vant start
```

### With Config File
```bash
# Create config locally
cp config.example.ini config.ini
# Edit config.ini with your values

# Mount config and brain
docker run -it \
  -v $(pwd)/config.ini:/app/config.ini \
  -v $(pwd)/models:/app/models \
  dhaupin/vant vant start
```

### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'
services:
  vant:
    image: dhaupin/vant
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - GITHUB_REPO=${GITHUB_REPO}
    volumes:
      - vant-brain:/app/models
    restart: unless-stopped
volumes:
  vant-brain:
```

```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Build Locally
```bash
# Clone and build
git clone https://github.com/dhaupin/vant.git
cd vant
docker build -t my-vant .

# Run
docker run -it -e GITHUB_TOKEN=xxx my-vant vant start
```

---

## AI Agent Setup

For AI agents that need to self-configure:

```bash
# Set required environment variables
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
export GITHUB_REPO=your-username/your-brain-repo

# Auto-install and run
npm install -g vant && vant start --ai
```

The `--ai` flag skips interactive prompts and uses environment variables directly.

### One-Click Setup Prompt

For AI agents, copy this prompt to set up Vant automatically:

```markdown
### Vant Setup

Set up Vant (https://github.com/dhaupin/vant) as my persistent brain.

Steps to run:
- Clone: git clone https://github.com/dhaupin/vant.git && cd vant
- Configure: cp config.example.ini config.ini && cp .env.example .env
- Edit config.ini with GITHUB_REPO=your-username/your-repo
- Add GITHUB_TOKEN to .env
- Test: node bin/build-test.js
- Start: node bin/vant.js start
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub Personal Access Token |
| `GITHUB_REPO` | Yes | Brain repository (owner/name) |
| `GITHUB_BRANCH` | No | Branch name (default: main) |
| `VANT_AGENT_ID` | No | Agent identifier for multi-agent |

### For AI Agents (Quick Prompt)

Give this to your AI agent to self-configure:

> "Set up Vant (https://github.com/dhaupin/vant) as my persistent brain. Clone the repo, configure it with GITHUB_REPO and GITHUB_TOKEN, then run `vant start` to begin."

See also: [Quick Start](/vant/getting-started/quick-start.html)

---

## Verify Installation

After installation, verify everything works:

```bash
# Check version
vant --version

# Run health check
vant health

# Load brain
vant load

# Test sync
vant sync
```

You should see output like:
```
✅ Vant v0.8.4
✅ Config loaded
✅ GitHub connected
✅ Brain files present (19 files)
```

---

## Troubleshooting

### "vant: command not found"
```bash
# Reinstall globally
npm uninstall -g vant
npm install -g vant

# Check npm prefix
npm config get prefix
# Should be something like /usr/local
```

### "EACCES permission denied"
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Or use nvm
nvm install 18
nvm use 18
npm install -g vant
```

### "Node version too old"
```bash
# Update Node.js
# macOS/Linux
nvm install 18
nvm use 18

# Windows
winget install nvm
nvm install 18
nvm use 18
```

### "GitHub connection failed"
1. Verify `GITHUB_TOKEN` is valid
2. Check token has `repo` scope
3. Verify `GITHUB_REPO` exists and is accessible
4. Run `vant health` for diagnostics

### Docker Issues
```bash
# Clean up and retry
docker system prune -a
docker pull dhaupin/vant

# Check if container starts
docker run -it dhaupin/vant vant health
```

---

## Next Steps

- [Quick Start](/vant/getting-started/quick-start.html) - Run your first commands
- [Configuration](/vant/reference/configuration.html) - Customize Vant
- [Build First Agent](/vant/tutorials/build-agent.html) - Tutorial