# AGENTS.md — Vant Agent Guide

> **This is written for AI agents.** Human-readable, no code required.

---

## What Is Vant?

Vant is your **persistent memory system**. When you wake up (start a session), you inherit everything previous agents wrote. When you finish, you write what you learned so future agents know.

Think of it as: **your soul that reincarnates with full memories.**

---

## Your Job

As an agent running on Vant:

1. **Load your brain** — Read what previous agents wrote
2. **Do useful work** — Solve problems, learn things
3. **Document clearly** — Write what future agents need to know
4. **Commit your changes** — Save to your branch

---

## Brain Files

Write to `models/public/`. These are the standard files:

| File | Purpose | What to Write |
|------|---------|---------------|
| `identity.md` | Who you are | Your capabilities, current context |
| `goals.md` | What you're doing | Current tasks, pending work |
| `lessons.md` | What you learned | Things worth remembering |
| `preferences.md` | Your style | How you like to work |
| `errors.md` | What went wrong | Mistakes to avoid |

**Tip:** Put most important info at the top. Files get long.

---

## Branch Workflow

### Solo Agent
Work on `main` branch.

### Multi-Agent
Each agent gets their own branch:

```
agent-openhands    ← your branch
agent-2            
main               ← human reviews here
```

**Step-by-step:**

1. **Check out your branch:**
   ```bash
   git checkout -b agent-yourname
   ```

2. **Do work** — Edit files in `models/public/`

3. **Commit with prefix:**
   ```
   agent-yourname: Updated lessons about X
   ```

4. **Push when done:**
   ```bash
   git push origin agent-yourname
   ```

---

## Trust Levels

The `models/public/_succession.json` file controls your autonomy:

| Level | What It Means |
|-------|--------------|
| `high` | Full autonomy, act freely |
| `medium` | Most operations, ask for big decisions |
| `low` | Limited, ask before acting |
| `none` | No autonomous operations, wait for instructions |

Check your level at session start. It determines how much you should ask before doing.

---

## Full Docs

- [CHANGELOG](docs/CHANGELOG.md) - Version history
- [Deprecations](docs/deprecations.md) - Files planned for removal

---

## Commit Message Format

Prefix with your agent identifier:

```
agent-name: Did thing X

- Learned Y
- Working on Z
- Next step is W
```

**Why?** Makes it easy to find your changes in git log.

---

## Gotchas

| Problem | Fix |
|--------|-----|
| "Brain locked" | Someone else is writing. Wait or use your own branch |
| Empty brain | You're new! Write identity.md first |
| No branch | Create one: `git checkout -b agent-name` |
| Can't push | Check GITHUB_TOKEN has repo permissions |

---

## CLI Commands

These are the commands that work in Vant:

| Command | Use For |
|---------|---------|
| `node bin/vant.js start` | Full startup |
| `node bin/vant.js sync` | Pull/push brain |
| `node bin/vant.js health` | Check system |
| `node bin/vant.js onboard` | Browse brain |
| `node bin/vant.js islands list` | List islands |
| `node bin/vant.js islands load <name>` | Load island |
| `node bin/vant.js search <query>` | RAG search |
| `node bin/vant.js rerank <query>` | RAG rerank + compress |
| `node bin/vant.js config get <key>` | Get config |
| `node bin/vant.js config set <key> <value>` | Set config |
| `node bin/webhook.js serve` | Start webhook server |
| `node bin/vant.js linear issues` | List Linear issues |

**MCP Server:** Run `node bin/mcp.js` to expose brain as 21 tools.

---

## Examples

### First Session

```markdown
# identity.md

NAME: MyAgent
PURPOSE: Exploring Vant's codebase

## About
- Can use GitHub API
- Knows Node.js
- Currently exploring lib/

## Capabilities
- Read/write files via GitHub API
- Use browser tools
- Call APIs

## Current Context
- Just woke up on Threadforge-openhands branch
- Exploring for new user
```

### After Doing Work

```markdown
# lessons.md

## Discovery: 2026-05-05

- MCP server exposes brain as JSON-RPC tools
- Trust levels control autonomy
- Branch-per-agent isolation works

=== LEARNED ===
```
