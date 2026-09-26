---
version: 0.8.6
permalink: /
layout: default
title: Vant Documentation
nav_order: 0
description: Vant is persistent memory for AI agents, stored as plain files in your GitHub repo, loaded by any agent through MCP.
---

# Vant Documentation

> Agent memory that lives in your repo.

Vant gives AI agents a brain: memory files the agent reads when it wakes and
writes when it sleeps. The files are plain markdown in your own repository.
Git history becomes the memory lineage. Any agent on any stack can use it,
because the memory is files and the tool interface is MCP.

Think of it as your agent's soul that reincarnates with full memories. What
that means in practice: on wake, the agent loads identity, goals, lessons,
and errors from `models/`; on sleep, it writes what it learned back. The
next session starts with all of it.

## Three memory systems

| System | What it stores | Where |
|--------|----------------|-------|
| **The brain** | Markdown memory files: identity, goals, lessons, errors, preferences | `models/public/<brain>/` and `models/private/<brain>/` |
| **The memory store** | Key-value state and documents, with TTL and sandbox gating | storage layer, per-brain scoped |
| **Brain search** | Semantic retrieval over the corpus: embeddings, rerank, citations for grounding | embeddings over brain files |

Everything is in your repo. Nothing is in someone else's database. If you
stop using Vant, the memory is still there, readable with `cat`.

## Quick paths

### For humans: install and start

Install Vant globally:

```bash
npm install -g vant
```

Start the full sequence: layout check, health, ready:

```bash
vant start
```

`vant start` also imports an old single-brain layout automatically if it
detects one. See [the migration guide](/vant/getting-started/setup).

### For agents: connect over MCP

Start the MCP server with auto-wired tools:

```bash
vant mcp
```

The server listens on `127.0.0.1:3457` by default. Point any MCP client at
it and the brain surface arrives as tools: read, write, search, migrate
status. Full client setup in [MCP](/vant/runtime/mcp).

Agents inheriting a repo with an existing brain need one command before
anything else:

```bash
vant migrate --status
```

It reports the brain layout version and whether a legacy import is pending.

## Why files in git

- **Ownership.** Your repo, your history, your backup story.
- **Review.** What your agent learned shows up in diffs. Approve lessons in
  a PR, revert the bad ones.
- **Branching.** Run an agent crew with one branch per agent, then merge
  what is worth keeping.
- **Portability.** No API, no export step, no lock-in. The memory is
  files.

## Runtime underneath

Memory is the product; the runtime makes it safe to use unattended. A
security chain gates every brain operation (sandbox capabilities, input
validation, rate limiting, escrow approval). A write-ahead journal and
atomic writes survive crashes. Metrics and health endpoints expose what the
system is doing. Start at [Runtime](/vant/runtime/runtime).

## Multi-brain and multi-agent

One Vant install holds several named brains with a stack you switch
between. Agents get their own branches and work in isolation. Trust levels
and a succession ledger control how much state each generation inherits.
See [Multi-brain](/vant/multi-agent/brains) and [Succession](/vant/multi-agent/succession).

## Sections

| Section | Contents |
|---------|----------|
| [Getting started](/vant/getting-started/quick-start) | Install, configure, first run, agent onboarding |
| [Memory](/vant/memory/brain) | The brain, memory store, search, citations, horcrux, geometry |
| [Runtime](/vant/runtime/runtime) | Programmatic API, MCP, headless server |
| [Multi-agent](/vant/multi-agent/brains) | Brains, branches, succession, crews |
| [Operations](/vant/operations/storage) | Storage, journal, events, cache, CI |
| [Security](/vant/security/sandbox) | Sandbox, gates, escrow, sudo |
| [Integrations](/vant/integrations/github) | GitHub, agent skills, Linear, Docker, S3 |
| [Reference](/vant/reference/cli) | CLI commands, configuration, changelog |
| [Advanced](/vant/advanced/search-architecture) | Search internals, API architecture, NSC9 spec |
