# AGENTS.md - Agent Guide to Vant Brain Branching

This guide explains how agents can use Vant's branching system for safe multi-agent memory.

---

## Security: VAF (Vant Application Firewall)

All inputs are validated through VAF before processing:

```javascript
const vaf = require('./lib/vaf');

// Check any input
vaf.check(input, {type: 'string', maxLength: 50000});
vaf.check(filepath, {type: 'path'});

// Path traversal protection
vaf.checkPathTraversal('../etc/passwd');  // {blocked: true}

// Content filtering  
vaf.checkContent('<script>');  // {blocked: true}
vaf.checkContent('rm -rf /');  // {blocked: true}
```

Blocked patterns:
- Path traversal: `../etc/passwd`, `../../../`
- Script injection: `<script>`, `javascript:`, `onclick=`
- Shell commands: `rm -rf`, `|bash`, `$(...)`, backticks
- PHP code: `<?php`

---

## The Problem

Multiple agents working on the same brain can cause conflicts:
- Agent A writes to `lessons.md`
- Agent B writes to `lessons.md` at the same time
- One overwrite the other

## The Solution: Branch + Lock

Vant uses **Git branches** for isolation and **file locks** for coordination.

```
main branch (reserved for production)
    │
    ├── agent-1/          # Agent 1's working brain
    ├── agent-2/          # Agent 2's working brain  
    ├── experiment-alpha/    # Experimental branch
    └── feature-memory/     # Feature work
```

---

## Quick Start

```javascript
// In your agent code:
const branch = require('./lib/branch');
const lock = require('./lib/lock');

// 1. Acquire lock (prevents others from jumping in)
const token = await lock.acquire('my-agent-id');
if (!token) {
    // Another agent has the lock - wait or skip
    console.log('Brain locked, retrying...');
    return;
}

// 2. Create/switch to your branch
await branch.checkout('agent-my-id');

// 3. Do work on your brain...
// Write to models/public/goals.md
// Write to models/public/lessons.md

// 4. Commit your changes
await branch.commit('my-agent-id', 'Updated memory');

// 5. Release lock
await lock.release('my-agent-id', token);
```

---

## API Reference

### lib/branch.js

```javascript
const branch = require('./lib/branch');

// Get current branch name
branch.currentBranch()  // Returns: "main" or "agent-1"

// List all branches
branch.listBranches()   // Returns: ["main", "agent-1", "agent-2"]

// Create new branch
branch.create('agent-1')    // Creates from current branch

// Switch to branch
branch.checkout('agent-1')    // Switches working branch

// Commit changes
branch.commit('agent-1', 'Updated lessons learned')

// Merge branch to main (optional)
branch.merge('agent-1')      // Merges to main
```

### lib/lock.js

```javascript
const lock = require('./lib/lock');

// Acquire lock
const token = await lock.acquire('agent-1');
// Returns: "abc123..." or null if already locked

// Check if locked
lock.isLocked()    // Returns: true/false

// Get lock info
lock.getLock()    // Returns: { agent, timestamp, token }

// Release lock (requires valid token)
await lock.release('agent-1', token);

// Release even if token invalid (force)
await lock.release('agent-1', null, true);
```

---

## Agent Workflows

### Workflow 1: Solo Agent

```javascript
// Just commit directly to main (okay for one agent)
const branch = require('./lib/branch');

await branch.checkout('main');
// do work...
await branch.commit('agent-1', 'Updated memory');
```

### Workflow 2: Multi-Agent (Safe)

```javascript
// Each agent uses their own branch
const branch = require('./lib/branch');
const lock = require('./lib/lock');

const agentId = process.env.VANT_AGENT_ID || 'agent-default';

// 1. Try to acquire lock
const token = await lock.acquire(agentId);
if (!token) {
    console.log('Locked, waiting...');
    await new Promise(r => setTimeout(r, 5000));
    return; // Or retry
}

// 2. Use own branch
await branch.checkout(agentId);

// 3. Do work
// ...modify memory files...

// 4. Commit
await branch.commit(agentId, 'Work complete');

// 5. Release lock
await lock.release(agentId, token);
```

### Workflow 3: Merge (Pull Request)

```javascript
// When agent is done, merge to main via PR
const branch = require('./lib/branch');

await branch.checkout('experiment-feature');
// ...do work...
await branch.commit('agent-1', 'Feature complete');

// Merge not automatic - human reviews first
// Use GitHub PR for the merge
// This prevents bad writes to main
```

---

## CLI Commands

```bash
# List branches
git branch -a

# Create branch
git checkout -b agent-1

# Switch branch  
git checkout agent-1

# Commit changes
git add -A
git commit -m "Agent 1: Updated lessons"
git push origin agent-1

# Merge branch to main (via PR)
# Do NOT merge directly in code - use PR for review
```

---

## Best Practices

1. **Always use locks** - Even on single-agent systems, locks prevent race conditions
2. **Use agent-specific branches** - Branch per agent: `agent-1`, `agent-2`, etc.
3. **Commit frequently** - Small commits are easier to review
4. **Merge via PR** - Don't auto-merge to main; use GitHub PR for review
5. **Cleanup old branches** - Delete branches after merged
6. **Timeout locks** - Lock module has 1-hour default timeout
7. **Never write to main directly** - Keep main as "known good"

---

## Troubleshooting

### "Lock is held by another agent"

```bash
# Check who holds the lock
cat .agent-locks/current.lock
# or
node bin/lock.js status
```

### "Merge conflict"

```bash
# Pull latest main, resolve conflict
git checkout main
git pull origin main
git checkout agent-1
git merge main
# Resolve conflicts in editor
git add -A
git commit -m "Resolve merge conflicts"
```

### Branch not found

```bash
# Create it
git checkout -b agent-1
# or use API
branch.create('agent-1')
```

---

## Security

- Lock files stored in `.agent-locks/` (gitignored)
- Lock token validates ownership on release
- Branch names are agent IDs, not user input
- Commits include agent ID in message

---

## VANT Deep Scan

**Project Overview:**
- **Name**: VANT (Versatile Autonomous Networked Tool)
- **Version**: 0.8.4
- **Purpose**: Persistent AI agent memory system - each generation inherits full context from previous sessions via GitHub
- **Repository**: https://github.com/dhaupin/vant
- **Node**: >=18 required

### Architecture

```
vant/
├── bin/                    # CLI executables
│   ├── vant.js            # Main CLI entry
│   ├── mcp.js             # Model Context Protocol server
│   ├── node.js            # Persistent node runner
│   ├── health.js          # System diagnostics
│   ├── sync.js            # GitHub pull/push
│   └── load.js           # Load brain files
├── lib/                    # Core modules (29 files)
│   ├── config.js          # Config loader
│   ├── brain.js         # Brain file loader
│   ├── lock.js          # Multi-agent locking
│   ├── branch.js        # Git branch per agent
│   ├── stego.js        # Steganography (PNG encoding)
│   ├── vaf.js          # Vant Application Firewall
│   └── notifications.js # Slack/Discord webhooks
├── src/                   # Extension points
│   ├── loader/          # Custom loaders
│   └── plugins/        # Plugin system
├── models/               # Brain files
│   └── public/        # Default brain (19 files)
│       ├── identity.md, ego.md, fears.md, anger.md, joy.md
│       ├── manifesto.md, creed.md, goals.md, preferences.md
│       ├── lessons.md, qc.md, security.md
│       ├── audit.md, errors.md, keepers.md
│       ├── curiosity.md, humility.md, empathy.md, gratitude.md
│       └── meta.json, verbosity.ini
└── docs/                # Full documentation
```

### Key Dependencies

- `chalk` - Terminal styling
- `cli-progress` - Progress bars
- `express` - HTTP server (MCP)
- `inquirer` - Interactive prompts
- `yaml` - YAML parsing

### CLI Commands

| Command | Description |
|---------|-------------|
| `vant start` | Full startup (health → sync → load → run) |
| `vant health` | System diagnostics |
| `vant sync` | Pull/push brain from GitHub |
| `vant load` | Load brain from models/public |
| `vant test` | Run build/tests |
| `vant watch` | Monitor GitHub for changes |
| `vant setup` | Interactive setup wizard |
| `vant mcp` | Run MCP server |
| `vant node` | Run as persistent node |

### Integration Points

1. **GitHub Sync**: Uses GITHUB_TOKEN and GITHUB_REPO config
2. **Slack/Discord**: Via SLACK_WEBHOOK_URL, DISCORD_WEBHOOK_URL
3. **Telegram**: Via TELEGRAM_BOT_TOKEN
4. **MCP Server**: HTTP server on port 3456 (default)

### Important Patterns

- **Lock before writing**: Always acquire lock before modifying brain
- **Branch per agent**: Each agent works on their own Git branch
- **Commit with prefix**: Include agent ID in commit messages
- **Auto-save**: Enable auto-update for exit persistence

---

## Docs: Jekyll + GitHub Pages

The documentation at https://dhaupin.github.io/vant/ uses Jekyll with GitHub Pages and Pagefind for search.

### Structure

```
docs/
├── _config.yml          # Jekyll config (baseurl, collections)
├── _layouts/
│   └── default.html     # Main layout with search modal
├── _sidebar.yml         # Navigation structure
├── getting-started/    # Tutorial docs
├── tutorials/           # How-to guides
├── reference/          # API documentation
├── guides/             # Deep dive guides
└── legal/              # Legal pages
```

### Search: Pagefind

The docs use [Pagefind](https://pagefind.app/) for static full-text search.

**How it works:**
1. GitHub Actions workflow builds Jekyll site
2. Runs `pagefind --site _site` to generate search index
3. Index deployed as artifact to GitHub Pages
4. Browser loads JS module and fetches index on search

**Code pattern (in default.html):**
```javascript
// Global script loads pagefind.js
var pfModule = await import('/vant/pagefind/pagefind.js');
await pfModule.init();
var resp = await pfModule.search(query);
```

**Testing search:**
```bash
# Verify index deployed
curl -sI "https://dhaupin.github.io/vant/pagefind/pagefind.js" | head -1
# Should return: HTTP/2 200

# Check entry
curl -s "https://dhaupin.github.io/vant/pagefind/pagefind-entry.json" | jq '.languages.en.page_count'
# Returns page count (e.g., 37)
```

### GitHub Pages Deployment

**Critical: Legacy vs Actions conflict**

Both Vant and prestruct repos had legacy Pages build_type conflicting with Actions workflow:
- Legacy build ran after Actions, overriding Pagefind artifact
- Fixed by ensuring Actions deploys first (check timestamps)

**Check deployment:**
```bash
# See what Pages is using
gh api repos/dhaupin/vant/pages --jq '.build_type'
# Returns: "legacy"

# Check recent runs
gh run list --repo dhaupin/vant --workflow="Deploy Docs" --limit 1
gh run list --repo dhaupin/vant --workflow="pages-build-deployment" --limit 1
```

**If artifacts not deploying:**
1. Trigger workflow manually: `gh workflow run docs.yml -R owner/repo`
2. Wait ~50s for build + deploy
3. Check timestamps - Actions should finish before legacy
4. If legacy wins, may need GitHub UI toggle to Actions-only

### Workflow

```yaml
# .github/workflows/docs.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
      - uses: actions/configure-pages@v4
      
      - name: Build Jekyll
        run: bundle exec jekyll build
      
      - name: Download Pagefind
        run: |
          VERSION=$(curl -sL "api.github.com/repos/Pagefind/pagefind/releases/latest" | ...)
          curl -sL ".../pagefind-v${VERSION}-x86_64-unknown-linux-musl.tar.gz" -o pagefind.tar.gz
          tar -xzf pagefind.tar.gz
      
      - name: Create search index
        working-directory: docs
        run: ./pagefind --site _site
      
      - uses: actions/upload-pages-artifact@v3
        with:
          path: 'docs/_site'
  
  deploy:
    needs: build
    uses: actions/deploy-pages@v4
```

### Troubleshooting

**Search returns no results:**
1. Check Pagefind files exist: `curl -sI /vant/pagefind/pagefind-entry.json`
2. Check page count: Should be ~37
3. Check network tab for failed fetches
4. Verify artifact deployed from Actions

**Index 404:**
1. Legacy build may have overridden artifact
2. Trigger Actions workflow manually
3. Check timestamps between runs

---

## Related Docs

- `lib/branch.js` - Branch API source
- `lib/lock.js` - Lock API source
- `models/public/schema/memory-files.md` - Memory file schema
- `CHANGELOG.md` - Version history
- `LIBS.md` - Full module reference
- `CLI.md` - Command reference
- `README.md` - Full documentation