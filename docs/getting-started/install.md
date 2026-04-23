---
permalink: /getting-started/install.html
layout: default
title: Installation
---
# Installation

Choose your init method:

| Method | Best For | Time |
|--------|----------|------|
| [AI Prompt Init](#ai-prompt-init) | AI agents setting up themselves | 2 min |
| [Local Init](#local-init) | Local development, contributors | 5 min |
| [Docker Init](#docker-init) | Containers, quick start | 1 min |



## Local Init

```bash
git clone https://github.com/dhaupin/vant.git
cd vant
npm install
node bin/vant.js setup
node bin/vant.js health
node bin/vant.js load
```

---

## AI Prompt Init {#ai-prompt-init}

For AI agents that need to set up themselves (auto-configuration):

```bash
# Set environment variables
export GITHUB_TOKEN=$AI_GITHUB_TOKEN
export GITHUB_REPO=$AI_BRAIN_REPO

# Auto-install and run
npm install -g vant && vant start --ai
```

This mode skips interactive prompts and uses env vars for full automation.

---

## Docker Init

```bash
docker run -it -v vant-brain:/app/models dhaupin/vant vant load
```

See also: [Configuration](/vant/reference/configuration.html)