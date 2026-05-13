---
version: 0.8.11
permalink: /
layout: default
title: Vant Docs
nav_order: 0
---
# Vant Documentation

> Versatile Autonomous Networked Tool - Persistent AI agent memory system

Vant persists across sessions through GitHub-based brain transfer. Each generation inherits the full memory of its predecessors.

🔗 [vant.creadev.org](https://vant.creadev.org) | 📦 [GitHub](https://github.com/dhaupin/vant)

---

## Quick Links

- [Quickstart](getting-started/quick-start) - 5 minute setup
- [Build Your First Agent](tutorials/build-agent) - 15 min tutorial
- [Examples](examples) - What others are building
- [FAQ](faq) - Common questions

---

## Key Features

Click any feature to learn more:

| Feature | Description | Docs |
|--------|-------------|------|
| **Persistent Memory** | GitHub-based brain storage with version control | [Brain](essential/brain.md) |
| **Storage Layer** | Brain storage abstraction | [Storage](operations/storage) |
| **Islands** | Componentized brain - lazy-loadable islands | [Islands](essential/islands.md) |
| **Runtime API** | Programmatic agent API | [Runtime](essential/runtime) |
| **Sandbox** | Execution isolation + capabilities | [Sandbox](security/sandbox) |
| **Multi-Agent** | Branch + lock system for safe collaboration | [Multi-Agent](essential/multi-agent) |
| **MCP Server** | Model Context Protocol for AI integration | [MCP](integrations/mcp) |
| **QoS** | Rate limiting, bulkhead, circuit breaker | [QoS](operations/qos) |
| **Events** | Event system + pub/sub + jobs | [Events](advanced/event.md) |
| **Escrow** | Budget tracking + approvals | [Escrow](security/escrow) |
| **Steganography** | Hidden messages in PNG images | [Stego](advanced/stego) |
| **Hybrid Search** | BM25 + Vector with RRF re-ranking | [Search](advanced/search.md) |
| **Vibe Controls** | Dynamic mood system | [Vibe](advanced/vibe) |
| **Network** | HTTP with retry + circuit breaker | [Network](operations/network) |
| **VAF** | Input validation firewall | [VAF](security/vaf) |
| **Multi-Repo** | Mount external repos like drives | [Repos](integrations/repos) |
| **Hybrid Sync** | Public/Private brain split | [Hybrid](advanced/search.md) |
| **Telegram Bot** | Control Vant via chat | [Telegram](tutorials/telegram-bot) |
| **Cron** | Scheduled jobs | [Cron](operations/cron.md) |
| **Schema** | JSON schema validation | [Schema](reference/schema) |
| **Audit** | Compliance logging + ledger | [Audit](advanced/audit.md) |

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

Yes! Use the [Multi-Agent](essential/multi-agent) system with branches + locks.

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
| [Terms & Disclaimer](legal/index) | Warranty, liability, responsibilities |
| [Privacy](legal/privacy) | Data collection, your control |
| [Environment](legal/environment) | GitHub API, limits |

 
