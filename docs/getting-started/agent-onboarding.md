---
version: 0.8.6
permalink: /getting-started/agent-onboarding
layout: default
title: Agent Onboarding
nav_order: 14
description: Wake, work, and sleep sequences for an AI agent inheriting a Vant brain. Written to be executed by an agent with no human present.
---

# Agent Onboarding

> The loop an agent runs on a repo with a Vant brain. No human required.

This page is written for you, the agent. It assumes the repo you woke up in
has a Vant layout: `models/public/<brain>/` and `models/private/<brain>/`
with the active stack in `models/state.json`. If the layout looks different,
step one tells you how to check, and the [migration guide](setup) has the
details.

## Step 1: Check the layout

Run the migration status check before reading anything. It tells you whether
the brain is in the current multi-brain layout or a legacy import is pending.

```bash
vant migrate --status
```

Output you want: `up to date`. If it instead prints an old-style-brain
warning, run the import. The default brain name is `vant`; pass a name if
the repo documents one:

```bash
vant migrate --dry-run
```

Preview the moves without touching anything. Then apply:

```bash
vant migrate
```

## Step 2: Wake

Load your brain files. The wake sequence is: identity first, then goals,
then lessons and errors from previous sessions.

```bash
vant onboard
```

Opens an interactive browser over every brain file. In a non-interactive
session, read the files directly:

```bash
cat models/private/vant/identity.md
```

Adjust the path to your brain name and to `models/public/<brain>/` for the
shared template files. A programmatic wake looks like:

```javascript
const brain = require('./lib/brain');
const identity = await brain.read('identity');
```

`brain.read` checks your private brain first, then falls back to the public
template. Files may be markdown, JSON, YAML, or plain text; `read` detects
the format and returns parsed data for structured files.

## Step 3: Work with memory

During the session, write what you learn as it happens. The learning call:

```javascript
const vant = require('./lib/vant');
await vant.learn('deploy-gotcha', 'Never run migrations before a backup.');
```

Read it back later with:

```javascript
const content = await vant.remember('deploy-gotcha');
```

For retrieval over the whole corpus instead of one key, use brain search:

```bash
vant search "migration failure recovery"
```

## Step 4: Sleep

Before the session ends, write what the next session needs. Append to the
lessons file through the memory surface, not with raw shell redirects to
arbitrary paths, so the security chain and atomic writes stay in the loop:

```bash
vant memory learn lessons "2026-09-23: Found and fixed a race in the sync pull path."
```

Commit and push the brain so the next session inherits it:

```bash
git add models/
```

Stage the brain changes. Then:

```bash
git commit -m "agent: session learnings"
```

Then push:

```bash
git push
```

## The MCP equivalent

If you reach Vant over MCP instead of the CLI, the same loop maps to tools.
The server auto-wires the module surface, so tool names follow the modules.
Connect a client to the server first:

```bash
vant mcp
```

Default endpoint is `127.0.0.1:3457`. Then call the brain read tool from
your MCP client with the file you need, check `brain_migration_status` at
wake, and write through the memory tools before sleep. Tool discovery:

```bash
curl -s -X POST http://localhost:3457/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Returns the live tool list. The full contract is in [MCP](../runtime/mcp).

## Rules worth keeping

- Read before write. Load the brain before changing anything.
- Check migration status at every wake. It is one command and it is cheap.
- Write lessons while they are fresh, not at the deadline.
- Never hand-move brain files. Use `vant migrate` for layout changes.
- Keep identity.md short and put the most important facts at the top.
