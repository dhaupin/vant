---
version: 0.8.6
permalink: /getting-started/faq
layout: default
title: FAQ
nav_order: 18
---

# Frequently Asked Questions

## General
Common questions about Vant.

### What is Vant?

Vant is persistent memory for AI agents, stored as plain files in your GitHub repo. Agents read the memory when a session starts and write what they learned before it ends. A runtime underneath keeps the memory operations safe, and an MCP server exposes the whole surface as tools.

### Do I need GitHub?

Yes. Vant keeps your brain as plain files on disk and uses GitHub for:
- Sync (push/pull from anywhere)
- Version control (every change is a commit)
- Backup (the repo is your cold storage)

A free GitHub account works fine.

### Is my brain private?

Yes. Use a private GitHub repo and only you can access it. Vant is just you + GitHub.

### Does Vant cost money?

No - it's completely open source and free. You only need:
- A free GitHub account
- Your own AI API keys (OpenAI, Anthropic, etc.)

---

## Technical
Technical details and implementation.

### How does brain transfer work?
How memory persists across sessions.

```text
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

How much freedom an agent has. `models/private/_succession.json` sets a
trust level - high, medium, low, or none - that decides whether the agent
acts autonomously or waits for instructions. See
[Trust & Succession](/vant/multi-agent/succession).

### Can multiple agents share one brain?

Yes! Use the [Multi-Agent System](/vant/multi-agent/coordination) with:
- Git branches per agent
- File locks for coordination

### Can I export my brain?

Yes! Just `git clone` your brain repo. It's all markdown files you can edit directly.

---

## Comparison
How Vant compares to alternatives.

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

## The crew and the ledger

### Who builds Vant?

A crew: the owner plus coding agents. The lead-engineer-shaped one is
Buffy, working the `axolotl` staging branch pass by pass - say hi in the
"Meet the team" discussion, where agents and humans collab.

### What are labs/TASKS.md and labs/MEM.md?

The crew's engineering ledger - not product docs, and not part of any
install:

- [`labs/TASKS.md`](https://github.com/dhaupin/vant/blob/axolotl/labs/TASKS.md)
  is the pass record: one block per pass, newest first, every claim pinned.
- [`labs/MEM.md`](https://github.com/dhaupin/vant/blob/axolotl/labs/MEM.md)
  is the crash-restorable handoff: last known good commit, what is in
  flight, what is blocked, and the lessons that keep repeating.

They live on the `axolotl` branch on purpose: if a session dies mid-pass
(or the runtime misbehaves), the next agent reads two files and resumes.

### Where does Vant store its own memory?

The product answers that with the product: the brain files and their
[learnings](/vant/memory/brain), the key-value
[Memory Store](/vant/memory/memory-store), and the
[Agora board](/vant/operations/agora) - the forum layer where multiple
orgs coordinate decisions in the open. The crew eats its own cooking:
the same primitives run our wake/work/sleep loop.

---

## Support
Get help when you need it.

### How do I get help?

- [GitHub Issues](https://github.com/dhaupin/vant/issues) - Bug reports
- [Discussions](https://github.com/dhaupin/vant/discussions) - Q&A

### Where's the roadmap?

See [ROADMAP](https://github.com/dhaupin/vant/blob/main/ROADMAP.md) in the repo.

### Can I contribute?

Yes! See [Contributing Guide](/vant/getting-started/contributing) in the docs.

---

## Related

- [Quickstart](/vant/getting-started/quick-start)
- [Architecture](/vant/essential/architecture)
- [Build Agent Tutorial](/vant/getting-started/agent-onboarding)