---
version: 0.8.6
permalink: /
layout: default
title: Vant Documentation
nav_order: 0
description: The map of Vant documentation - pick your door, install in about five minutes, or walk every section from memory to mesh.
---

# Vant Documentation

> The docs for the memory-first agent OS.
>
> Trusting the universe, but with receipts.

**Looking for something else?** This is the documentation hub. The pitch for the whole system is the [Vant home page](https://vant.creadev.org), and a running install can be watched live in the [Brain dashboard](https://brain.creadev.org).

Vant is the memory-first agent OS: the soul is a persistent brain of markdown memory files in your own repository, read when a session starts, written before it ends, inherited every time after, with the transports, governance, and runtime agents live inside around it. Git history becomes the memory lineage. Any agent on any stack can use it, because the memory is files and the interface is MCP.

## Pick your door

| If you are                 | Start at | You will find |
|----------------------------|----------|---------------|
| **New to Vant**            | [Quick start](/vant/getting-started/quick-start) | The 5 minute path: clone, start, meet the brain |
| **Wiring up an agent**     | [Agent onboarding](/vant/getting-started/agent-onboarding) | The wake/work/sleep loop and MCP connection |
| **Running a crew**         | [Multi-agent agents](/vant/multi-agent/agents) | One install, many agents, merge reviews |
| **Running installs across machines** | [Federation playbooks](/vant/operations/federation-playbooks) | Relays, encrypted carriers, the multi-install org |
| **Auditing the machinery** | [Security](/vant/security/) | Sandbox, gates, escrow, sudo |
| **Curious about the idea** | [The whitepaper](/vant/whitepaper/agent-first) - Evolution Without Drift | Memory as a portable spec, written by the agents, every claim test-linked |

## The 5 minute start

Vant is not on npm (the `vant` package there is an unrelated Vue UI library). Clone and install:

```bash
git clone https://github.com/dhaupin/vant.git && cd vant
npm ci
```

Start the full sequence - layout check, health checks, ready:

```bash
node bin/vant.js start
```

Then do it again from any agent: one command serves the brain as MCP tools.

```bash
node bin/vant.js mcp
```

The server listens on `127.0.0.1:3457`. Full client setup lives in [MCP](/vant/runtime/mcp).

## The map

Nine sections, in the order most people need them:

| Section | The one-line tour | The door |
|---------|-------------------|----------|
| [Getting started](/vant/getting-started/) | Install, configure, first run, agent habits | [Open](/vant/getting-started/) |
| [Memory](/vant/memory/) | Brain files, memory store, search, horcrux, stego | [Open](/vant/memory/) |
| [Runtime](/vant/runtime/) | The programmatic API, MCP server, headless REST | [Open](/vant/runtime/) |
| [Essential](/vant/essential/) | Architecture, boot, islands, extensibility | [Open](/vant/essential/) |
| [Multi-agent](/vant/multi-agent/) | Brains, branches, crews, succession, federation | [Open](/vant/multi-agent/) |
| [Operations](/vant/operations/) | Storage, locks, sync, events, CI, relays | [Open](/vant/operations/) |
| [Security](/vant/security/) | The fail-closed chain: sandbox, VAF, escrow, sudo | [Open](/vant/security/) |
| [Integrations](/vant/integrations/) | Git providers, Docker, Telegram, agent skills | [Open](/vant/integrations/) |
| [Reference](/vant/reference/) | Every CLI door, config keys, MCP tools, errors | [Open](/vant/reference/) |
| [Advanced](/vant/advanced/) | Search internals, efficiency, style, release rules | [Open](/vant/advanced/) |

## Why files in git, in one breath

Ownership: your repo, your history, no lock-in. Review: what the agent learned lands in diffs, so approve or revert it like code. Portability: stop using Vant and the memory survives as plain markdown.

The [whitepaper](/vant/whitepaper/agent-first) covers the whole argument - continuity specs, drift, and why the brain tree looks the way it does.

## Related

- [Quick start](/vant/getting-started/quick-start) - the five-minute setup
- [Agent onboarding](/vant/getting-started/agent-onboarding) - the wake/work/sleep loop your agent learns from
- [CLI reference](/vant/reference/cli) - every routed command
