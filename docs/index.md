---
permalink: /
layout: default
title: Vant Docs
---
# Vant Documentation

> Versatile Autonomous Networked Tool - Persistent AI agent memory system

Vant persists across sessions through GitHub-based brain transfer. Each generation inherits the full memory of its predecessors.

🔗 [vant.creadev.org](https://vant.creadev.org) | 📦 [GitHub](https://github.com/dhaupin/vant)

---

## Quick Links

- [Quickstart](/vant/getting-started/quick-start.html) - 5 minute setup
- [Build Your First Agent](/vant/tutorials/build-agent.html) - 15 min tutorial
- [Examples](/vant/examples.html) - What others are building
- [FAQ](/vant/faq.html) - Common questions

---

## Key Features

Click any feature to learn more:

| Feature | Description | Docs |
|--------|-------------|------|
| **Persistent Memory** | GitHub-based brain storage with version control | [Brain Guide](/vant/guides/brain.html) |
| **Multi-Agent** | Branch + lock system for safe collaboration | [Multi-Agent](/vant/guides/multi-agent.html) |
| **MCP Server** | Model Context Protocol for AI integration | [MCP](/vant/guides/mcp.html) |
| **Steganography** | Hidden messages in PNG images | [Stego](/vant/guides/steganography.html) |
| **Slack/Discord** | Webhook notifications | [Operations](/vant/guides/operations.html) |
| **VAF Security** | Input validation and filtering | [Security](/vant/guides/security.html) |
| **Telegram Bot** | Control Vant via chat | [Bot Tutorial](/vant/tutorials/telegram-bot.html) |

---

## About

Vant solves a core problem: **AI agents lose all context when sessions end.**

Traditional AI memory solutions:
- Vector databases store embeddings, but lose full context
- External state management adds complexity
- No built-in versioning or audit trail

**Vant's approach:**
- Git-based storage (versioning, branches, PRs built-in)
- Markdown brain files (human-readable, editable)
- Session inheritance (each generation starts where the last left off)

**Use Vant for:**
- Long-running agentic workflows
- Multi-agent systems with safe collaboration
- Persistent AI memory across sessions

---

## FAQ
Frequently asked questions answered.

### What is a "brain"?

Your AI's memory. A folder of markdown files storing who you are, what you've learned, and your context. Each session loads the brain, changes are pushed to GitHub, next session inherits everything.

### Do I need GitHub?

Yes. Vant uses GitHub as storage + version control + sync. Free account works.

### Is my brain private?

Yes, use a private GitHub repo. Vant is just you + GitHub.

### Can multiple AI agents share one brain?

Yes! Use the [Multi-Agent](/vant/guides/multi-agent.html) system with branches + locks.

### How is this different from vector databases?

| Vant | Vector DB |
|------|----------|
| Full context | Embeddings only |
| Git-based | API-based |
| Session inheritance | Semantic search |

### Does Vant cost money?

No - it's open source. Just need a free GitHub account + your own AI API keys.

### What's the "succession" system?

Vant's version tracking - knows which brain version to load, handles rollbacks.

### Can I export my brain?

Yes! Just `git clone` your brain repo. It's all markdown.

---

## Legal

> **IMPORTANT**: Read before using Vant. By using this software, you agree to our terms.

| Document | Purpose |
|----------|---------|
| [Terms & Disclaimer](/vant/legal/index.html) | Warranty, liability, responsibilities |
| [Privacy](/vant/legal/privacy.html) | Data collection, your control |
| [Environment](/vant/legal/environment.html) | GitHub API, limits |

