---
version: 0.8.6
permalink: /getting-started/vibe-coders
layout: default
title: Vibe Coding with Vant
nav_order: 12
description: One-liner memory for hobbyists and solo devs - copy, paste, and your project remembers. No config required.
---

# Vibe Coding with Vant

> The fastest way in: one command, and your project has memory. Every
> command on this page works with zero configuration - no tokens, no
> accounts, no YAML. When you want more, the deep docs are linked at
> the bottom.

## On this page

- [One minute: give your project a memory](#one-minute-give-your-project-a-memory)
- [Five minutes: notes that stick](#five-minutes-notes-that-stick)
- [Ask your notes](#ask-your-notes)
- [When you want sync](#when-you-want-sync)
- [A tiny agent habit](#a-tiny-agent-habit)
- [Where the deep docs live](#where-the-deep-docs-live)

## One minute: give your project a memory

In your project folder:

```bash
vant memory learn todos "ship the login page, then the settings page"
```

That's it. The note is in your project's brain, on disk, in plain
markdown you can open and read.

## Five minutes: notes that stick

The same verb does everything - the first word after `learn` is just a
label you invent:

```bash
vant memory learn decisions "chose Postgres over Mongo - team already knows SQL"
vant memory learn gotchas "the API rate-limits at 60 req/min - back off on 429s"
vant memory learn vibe "this project uses tabs, not spaces. deal with it."
```

Short-term scratchpad values (they expire, unlike learned notes):

```bash
vant memory state session-id abc123
vant memory recall session-id
```

Read everything the brain holds:

```bash
vant memory list
```

## Ask your notes

Search across everything you taught it:

```bash
vant search "why did we choose postgres"
vant search "rate limits" --compact
```

Search is hybrid (text plus semantic), so paraphrases work - you do
not need to remember the exact words you stored.

## When you want sync

Everything above works offline with zero accounts. When you want the
brain to travel with the repo, add two lines to `.env`:

```bash
VANT_GITHUB_REPO=your-username/your-brain-repo
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

Then push and pull the brain like code:

```bash
vant sync --push
vant sync --pull
```

This is the original premise: ship the memory with the repo. Plain
markdown files in a git repo you own - never locked into a vendor.

## A tiny agent habit

If you code with an AI agent (Copilot, Claude, Cursor, anything with a
shell), teach it two sentences:

```text
Before we start, run: vant memory query decisions
When we decide something, run: vant memory learn decisions "<what and why>"
```

Now every session starts with the context and ends with the lesson.
That loop - remember, decide, record - is the whole methodology at
hobbyist scale. When your project grows into a crew of agents, it is
the same loop with more structure:

- The brain files an agent actually reads: [The Brain](/vant/memory/brain)
- The wake/work/sleep loop: [Agent Onboarding](/vant/getting-started/agent-onboarding)
- One install, many agents: [Multi-agent](/vant/multi-agent/)

## Where the deep docs live

| When you want... | Go to |
|------------------|-------|
| Real search, citations, RAG | [Brain Search](/vant/memory/search) |
| Multiple agents on one install | [Multi-Agent](/vant/multi-agent/) |
| Several installs working together | [Federation](/vant/multi-agent/federation) |
| Group decisions across orgs | [Steward Runbook](/vant/operations/steward-runbook) |
| Everything the CLI can do | [CLI Reference](/vant/reference/cli) |

One honest note: `vant health` will mention setup and GitHub sync as
"not initialized" when you skipped them. That is fine - the memory
commands on this page work without any of it. The health check is
guarding the full enterprise setup, not the one-liners.
