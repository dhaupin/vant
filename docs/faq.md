---
permalink: /faq.html
layout: default
title: FAQ
---

# Frequently Asked Questions

## General

### What is Vant?

Vant (Versatile Autonomous Networked Tool) is an open source system for AI agent memory persistence. It uses GitHub as storage so agents can remember everything between sessions.

### Do I need GitHub?

Yes. Vant uses GitHub as the backend for:
- Storage (your brain is a GitHub repo)
- Version control (automatic versioning)
- Sync (push/pull from anywhere)

A free GitHub account works fine.

### Is my brain private?

Yes. Use a private GitHub repo and only you can access it. Vant is just you + GitHub.

### Does Vant cost money?

No - it's completely open source and free. You only need:
- A free GitHub account
- Your own AI API keys (OpenAI, Anthropic, etc.)

---

## Technical

### How does brain transfer work?

```
Session 1 ends:
  1. Save brain files
  2. Commit to GitHub
  3. Push to remote

Session 2 starts:
  1. Pull from remote
  2. Load brain files
  3. Continue from where left off
```

### What's the "succession" system?

Vant's version tracking:
- Knows which brain version to load
- Handles rollbacks
- Prevents conflicts

### Can multiple agents share one brain?

Yes! Use the [Multi-Agent System](/tutorials/multi-agent.html) with:
- Git branches per agent
- File locks for coordination

### Can I export my brain?

Yes! Just `git clone` your brain repo. It's all markdown files you can edit directly.

---

## Comparison

### vs Vector Databases

| Vant | Vector DB |
|------|----------|
| Full context (markdown) | Embeddings only |
| Git-based | API-based |
| Session inheritance | Semantic search |
| Free (GitHub only) | Often paid |

### vs Cloud Memory APIs

| Vant | Cloud APIs |
|------|----------|
| Your data stays yours | Data leaves your control |
| Git version control | No versioning |
| Open source | Proprietary |

### vs Prompt Engineering

| Vant | Prompts Only |
|------|-------------|
| Persistent | Lost each session |
| Structured memory | Slop accumulation |
| Version control | No history |

---

## Support

### How do I get help?

- [GitHub Issues](https://github.com/dhaupin/issues) - Bug reports
- [Discussions](https://github.com/dhaupin/discussions) - Q&A
- [Discord](https://discord.gg/vant) - Chat (if available)

### Where's the roadmap?

See [ROADMAP.md](https://github.com/dhaupin/blob/main/ROADMAP.md) in the repo.

### Can I contribute?

Yes! See [Contributing Guide](/contributing.html) in the docs.

---

## Related

- [Quickstart](/quickstart.html)
- [Architecture](/guides/architecture.html)
- [Build Agent Tutorial](/tutorials/build-agent.html)