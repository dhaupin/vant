---
version: 0.8.9
permalink: /
layout: default
title: Vant Docs
nav_order: 0
---
# Vant Documentation

> Versatile Autonomous Networked Tool - AI agent memory that persists across sessions

Vant persists through GitHub-based brain transfer. Agents inherit full context from predecessors.

🔗 [vant.creadev.org](https://vant.creadev.org) | 📦 [GitHub](https://github.com/dhaupin/vant)

---

## Agent Quick Start

- [Quickstart](getting-started/quick-start) - 5 minute setup
- [Build Agent](tutorials/build-agent) - 15 min tutorial
- [MCP Server](integrations/mcp) - Connect to any LLM
- [Brains](essential/extensibility) - Agents & skills library

## Agent Templates

- [Architect](essential/brains/#included-agents) - System design agent
- [Engineer](essential/brains/#included-agents) - Implementation agent
- [Reviewer](essential/brains/#included-agents) - Code review agent
- [Operator](essential/brains/#included-agents) - DevOps automation
- [Security](essential/brains/#included-agents) - Security audit

---

## Key Features

| Feature | Description | Docs |
|--------|-------------|------|
| **MCP Server** | Model Context Protocol for AI integration | [MCP](integrations/mcp) |
| **Runtime API** | Programmatic agent API | [Runtime](essential/runtime) |
| **Persistent Memory** | GitHub-based brain with version control | [Brain](essential/brain) |
| **Islands** | Componentized brain - lazy-load on-demand | [Islands](essential/islands) |
| **Multi-Agent** | Branch + lock for safe agent collaboration | [Multi-Agent](essential/multi-agent) |
| **Skills Library** | 70 reusable agent tools | [Brains](essential/extensibility) |
| **Storage Layer** | Brain storage abstraction | [Storage](operations/storage) |
| **Sandbox** | Execution isolation + capabilities | [Sandbox](security/sandbox) |
| **QoS** | Rate limiting, bulkhead, circuit breaker | [QoS](operations/qos) |
| **Events** | Event system + pub/sub + jobs | [Events](operations/events) |
| **Escrow** | Budget tracking + approvals | [Escrow](security/escrow) |
| **Steganography** | Hidden messages in PNG images | [Stego](advanced/stego) |
| **Hybrid Search** | BM25 + Vector with RRF re-ranking | [Search](advanced/search) |
| **Vibe Controls** | Dynamic mood system | [Vibe](advanced/vibe) |
| **Network** | HTTP with retry + circuit breaker | [Network](operations/network) |
| **VAF** | Input validation firewall | [VAF](security/vaf) |
| **Multi-Repo** | Mount external repos like drives | [Repos](integrations/repos) |
| **Hybrid Sync** | Public/Private brain split | [Hybrid](integrations/hybrid) |
| **Telegram Bot** | Control Vant via chat | [Telegram](tutorials/telegram-bot) |
| **Cron** | Scheduled jobs | [Cron](operations/cron) |
| **Schema** | JSON schema validation | [Schema](reference/schema) |
| **Audit** | Compliance logging + ledger | [Audit](advanced/audit) |

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
| [Terms & Disclaimer](reference/legal) | Warranty, liability, responsibilities |
| [Privacy](security/privacy) | Data collection, your control |
| [Environment](security/environment) | GitHub API, limits |

