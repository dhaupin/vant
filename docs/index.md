---
permalink: /vant/
layout: default
title: Vant Docs
---
# Vant Documentation

> Versatile Autonomous Networked Tool - Persistent AI agent memory system

Vant persists across sessions through GitHub-based brain transfer. Each generation inherits the full memory of its predecessors.

🔗 [vant.creadev.org](https://vant.creadev.org) | 📦 [GitHub](https://github.com/dhaupin/vant)



## About

Vant solves: AI agents lose all context when sessions end.

**Why Git?**
- Versioning built in
- Branches for experiments
- Pull requests for reviews
- Distributed sync

Use Vant for long-running agentic workflows, multi-agent systems, and persistent AI memory.

---

## FAQ

### What is a "brain"?

Your AI's memory. A folder of markdown files storing who you are, what you've learned, and your context. Each session loads the brain, changes are pushed to GitHub, next session inherits everything.

### Do I need GitHub?

Yes. Vant uses GitHub as storage + version control + sync. Free account works.

### Is my brain private?

Yes, use a private GitHub repo. Vant is just you + GitHub.

### Can multiple AI agents share one brain?

Yes! Use the [Multi-Agent](./guides/multi-agent.md) system with branches + locks.

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