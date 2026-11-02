---
version: 0.8.6
permalink: /getting-started/agent-onboarding
layout: default
title: Agent Onboarding
nav_order: 15
description: Wake, work, and sleep sequences for an AI agent inheriting a Vant brain. Written to be executed by an agent with no human present.
---

# Agent Onboarding

> The loop an agent runs on a repo with a Vant brain. No human required.

This page is written for you, the agent. It assumes the repo you woke up in has a Vant layout: `models/public/<brain>/` and `models/private/<brain>/` with the active stack in `models/state.json`. If the layout looks different, step one tells you how to check, and the [migration guide](/vant/getting-started/migration) has the details.

The whole loop, on one line:

```text
check the layout → wake (load the brain) → work with memory → sleep (write, commit, push)
```

## The layout at a glance

Two different things in a Vant install are called "state" - do not confuse them:

```text
models/
  state.json             # THE ROSTER: the install's active brain stack + current brain
  public/<brain>/        # shared template files, syncable to a repo
  private/<brain>/       # YOUR HEAD: identity.md, goals.md, lessons.md, orgchart/
  private/<brain>/state/ # that brain's own runtime ledgers (era rollups, trust, traces)
```

- **`models/state.json` is the roster, not a head.** It lives at the models root - outside every brain directory - because it must be neutral: its job is to *name* the brains on the active stack (`{ "stack": ["vant", "nova"], "currentBrain": "vant", ... }`), so a stack with several brains never belongs to any one of them.
- **Each brain keeps its own state, inside its own directory.** `models/private/<brain>/state/` holds that brain's runtime ledgers (era rollups, trust decisions, trace spans, conversation records). Your memory files and your state stay with your brain - they ride backup and horcrux gathers, so a restored install keeps them.

Mnemonic that saves a lost afternoon: **don't confuse the roster for the head.**

## Step 1: Check the layout

Run the migration status check before reading anything. It tells you whether the brain is in the current multi-brain layout or a legacy import is pending.

```bash
vant migrate --status
```

Output you want: `up to date`. If it instead prints an old-style-brain warning, run the import. The default brain name is `vant`; pass a name if the repo documents one:

```bash
vant migrate --dry-run
```

Preview the moves without touching anything. Then apply:

```bash
vant migrate
```

## Step 2: Wake

Load your brain files. The wake sequence is: identity first, then goals, then lessons and errors from previous sessions.

```bash
vant onboard
```

Opens an interactive browser over every brain file. In a non-interactive session, read the files directly:

```bash
cat models/private/vant/identity.md
```

Adjust the path to your brain name and to `models/public/<brain>/` for the shared template files. A programmatic wake looks like:

```javascript
const brain = require('./lib/brain');
const identity = await brain.read('identity');
```

`brain.read` checks your private brain first, then falls back to the public template. Files may be markdown, JSON, YAML, or plain text; `read` detects the format and returns parsed data for structured files.

Before your first write, check how much autonomy this install grants you:

```bash
vant succession
```

| Level | What it means |
|-------|---------------|
| `high` | Full autonomy, act freely |
| `medium` | Most ops, ask for big decisions |
| `low` | Ask before acting |
| `none` | Wait for instructions |

Your level is set by `models/public/<brain>/_succession.json` and the humans can raise it over time - the [contributor workflow](/vant/advanced/agent-contributors) explains the ladder.

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

Before the session ends, write what the next session needs. Append to the lessons file through the memory surface, not with raw shell redirects to arbitrary paths, so the security chain and atomic writes stay in the loop:

```bash
vant memory learn lessons "2026-09-23: Found and fixed a race in the sync pull path."
```

Commit and push the brain so the next session inherits it. Use your own agent identifier as the commit prefix - it is how lineage work gets attributed across the roster:

```bash
git add models/
git commit -m "agent-yourname: session learnings"
git push
```

Memory work usually happens on a per-agent working branch (`agent-yourname`), created off the repo's documented base branch.

## The MCP equivalent

If you reach Vant over MCP instead of the CLI, the same loop maps to tools. The server auto-wires the module surface, so tool names follow the modules. Connect a client to the server first:

```bash
vant mcp
```

Default endpoint is `127.0.0.1:3457`. Then call the brain read tool from your MCP client with the file you need, check `brain_migration_status` at wake, and write through the memory tools before sleep. Tool discovery:

```bash
curl -s http://localhost:3457/mcp/tools
```

Returns the live tool list. The full contract is in [MCP](/vant/runtime/mcp).

## Scopes and the operator grant

Memory reads work out of the box. Writes to teams, agents, and org records are gated by sandbox capabilities. There are two grant layers:

**Persisted grant (the usual path).** `vant org grant` writes operator scopes + capabilities into the active brain's config (`--session-only` skips persistence), and boot hydrates the persisted capabilities into every fresh process (widen-only, so a grant can never narrow a host's authority). Grant once, and later CLI invocations just work:

```bash
vant org grant --scopes read,write,spawn,execute --capabilities canWrite,canSpawn
vant org status   # verify what is persisted for this brain
```

The grant lands in the VANT_BRAIN-active brain (a scoped agent's own brain), not a shared default. Use `--session-only` for a throwaway session so nothing outlives the process.

**In-process grant (library code).** For code running inside your own process, grant the sandbox directly (no CLI, nothing persisted):

```javascript
const sandbox = require('./lib/sandbox');
const teams = require('./lib/teams');
sandbox.setScopes(['read', 'write', 'spawn', 'execute']);
sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
const org = teams.createOrg('MyOrg');
```

The layered model is deliberate: capabilities are part of the keeper layer, so they come from an explicit operator grant (or the host that configured the sandbox) - never silently at boot. Bare `vant org` is read-only `status`; granting is always an explicit subcommand.

## Rules worth keeping

- Read before write. Load the brain before changing anything.
- Check migration status at every wake. It is one command and it is cheap.
- Check your trust level (`vant succession`) before your first write.
- Write lessons while they are fresh, not at the deadline.
- Never hand-move brain files. Use `vant migrate` for layout changes.
- The roster is a pointer, not a head: `models/state.json` names the active brains; your state lives in `models/private/<brain>/state/`.
- Keep identity.md short and put the most important facts at the top.

---

## Related

- [Agent Contributors](/vant/advanced/agent-contributors) - the full-value contributor workflow this page operationalizes
- [Migration](/vant/getting-started/migration) - the layout migration you must check every wake
- [The Brain](/vant/memory/brain) - what "load your brain" actually loads
- [Unlocking Vant](/vant/integrations/hybrid) - escalate your trust level by contributing
