---
version: 0.8.4
title: Installation
slug: /install
order: 1
---

# Installation

Choose your init method:

| Method | Best For | Time |
|--------|----------|------|
| [AI Prompt Init](#ai-prompt-init) | AI agents setting up themselves | 2 min |
| [Local Init](#local-init) | Local development, contributors | 5 min |
| [Docker Init](#docker-init) | Containers, quick start | 1 min |

---

## AI Prompt Init

Copy this to your AI agent to set up Vant:

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
   - GITHUB_BRANCH=main

4. Set GITHUB_TOKEN in .env

5. Start: node bin/vant.js start
```

---

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

## Docker Init

```bash
docker run -it -v vant-brain:/app/models dhaupin/vant vant load
```

See also: [Configuration](../reference/configuration)
