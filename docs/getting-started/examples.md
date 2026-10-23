---
version: 0.8.6
permalink: /getting-started/examples
layout: default
title: Examples & Showcase
description: Examples and showcase - real brain layouts, skill packs, and templates you can copy into your own repo.
nav_order: 17
---

# Examples & Showcase

> Real-world projects and code examples built with Vant## Ideas for Projects

*(No community showcase yet - these are directions worth building, not
shipped projects. Submit yours via
[GitHub Issues](https://github.com/dhaupin/vant/issues) and it will land
here with a real link.)*

## AI Development Agents

- **Auto-Dev Agent**: a self-improving code agent that learns from debugging sessions
- **Code Review Bot**: an AI that performs code reviews and remembers patterns

## Research Agents

- **Literature Review Agent**: reads papers, synthesizes findings across sessions
- **Data Analysis Agent**: persistent data exploration and visualization

## Personal Assistants

- **Writing Coach**: helps with writing, remembers style preferences
- **Learning Assistant**: tracks learning progress across sessions

## Use Cases
Common scenarios where Vant excels.

### Long-Running Workflows

Agent runs that take days/weeks and need context preserved:

```text
Session 1: Research topic ──→ GitHub
Session 2: Analyze data  ──→ GitHub  
Session 3: Write report  ──→ GitHub
... continues ...
```

### Multi-Agent Teams

Coordinated agents with branch isolation:

```text
main (production brain)
    │
    ├── researcher-agent/
    ├── analyzer-agent/
    └── writer-agent/
```

### Edge Computing

Deploy to devices that lose power:

```text
Edge device starts → Load brain from GitHub
                  Does work
                  Save brain to GitHub
                  Power off
```

## Code Snippets

Working examples for common tasks.

### Basic Memory Operations

`lib/storage`'s BrainStorage store is the raw file layer under the brain
(`get` / `write` / `append` / `has` / `list` / `query` - there is no
`load`/`set`/`save`; every write persists as an atomic write, and the
GitHub push is `vant sync --push`):

```javascript
const brain = require('./lib/storage').get('brain');

async function basicExample() {
  // Read a brain file (category/key, plain text)
  const lessons = brain.get('vant', 'lessons.md');

  // Write a brain file (category/key; format option sets the extension)
  brain.write('vant', 'goals', '# goals\n- Learn more about Vant\n');

  // Append to an existing file (get + write under one call)
  brain.append('vant', 'lessons.md', '\n- Learned atomic writes\n');

  // Existence check + category listing (key-less get lists subdirs)
  brain.has('vant', 'lessons.md');
  brain.get('');
}
```

### Persistent Agent Loop

```javascript
const brain = require('./lib/storage').get('brain');
const execSync = require('child_process').execSync;

async function agentLoop() {
  while (true) {
    // Read previous context from the brain store (plain text)
    const history = brain.get('vant', 'history.md') || '';
    const lastTask = history.split('\n').filter(Boolean).pop();

    // Process task
    const task = await getNextTask();
    const result = await processTask(task);

    // Persist results (atomic write)
    brain.append('vant', 'history.md', `\n- [${Date.now()}] ${task}: ${result}`);

    // Sync to GitHub (the real CLI verb; pull is the default direction)
    execSync('node bin/vant.js sync --push "agent loop checkpoint"', { stdio: 'inherit' });
  }
}
```

### With Locking (Multi-Agent Safe)

```javascript
const brainLock = require('./lib/brain-lock');
const branch = require('./lib/branch');

async function safeWrite(agentId, content) {
  // 1. Acquire lock
  const token = await brainLock.acquireBrainLock(agentId);
  if (!token) {
    throw new Error('Brain is locked by another agent');
  }
  
  try {
    // 2. Switch to your branch
    await branch.checkout(agentId);
    
    // 3. Do work (plain fs under your agent's brain dir)
    const fs = require('fs');
    const lessonsPath = `models/private/${agentId}/lessons.md`;
    let lessons = fs.existsSync(lessonsPath) ? fs.readFileSync(lessonsPath, 'utf8') : '';
    lessons += `\n${content}\n`;
    fs.writeFileSync(lessonsPath, lessons);
    
    // 4. Commit
    await branch.commit(agentId, `Agent ${agentId}: ${content}`);
    
  } finally {
    // 5. Always release
    await brainLock.releaseBrainLock(agentId, token);
  }
}
```

### Reading Specific Files

```javascript
const brain = require('./lib/storage').get('brain');

function queryBrain() {
  // get(category, key) returns file CONTENT (or null when missing)
  const lessons = brain.get('vant', 'lessons.md');
  const goals = brain.get('vant', 'goals.md');

  // has(category, key) - existence check
  if (brain.has('vant', 'custom-file.md')) {
    const custom = brain.get('vant', 'custom-file.md');
  }

  return { lessons, goals };
}
```

(For the higher-level read with private-first fallback, use
`brain.read('lessons')` from `lib/brain.js` - see
[The Brain](/vant/memory/brain).)

### Appending to Lessons

```javascript
const brain = require('./lib/storage').get('brain');

function addLesson(lesson) {
  const timestamp = new Date().toISOString();
  const entry = `## ${timestamp}\n\n${lesson}\n`;

  // append(category, key, content) reads the existing file first
  brain.append('vant', 'lessons.md', '\n---\n' + entry);
}

addLesson('Remember to always test edge cases');
```

### MCP Server Integration

```javascript
// Client code to interact with Vant MCP server
async function mcpExample() {
  const response = await fetch('http://localhost:3456/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'vant_get_memory',
        arguments: { category: 'goals', filename: 'goals.md' }
      },
      id: 1
    })
  });
  
  const { result } = await response.json();
  console.log(result);
}
```

### Telegram Bot Command

```javascript
const telegram = require('./lib/telegram');

async function botSetup() {
  // Add command handlers
  telegram.onCommand('status', async (msg) => {
    const health = await runHealthCheck();
    await telegram.send(msg.chat, `
📊 Vant Status

Version: ${health.version}
Branch: ${health.branch}
Brain: ${health.files} files
Last Sync: ${health.lastSync}
    `);
  });
  
  telegram.onCommand('sync', async (msg) => {
    await telegram.send(msg.chat, '🔄 Syncing...');
    await syncWithGitHub();
    await telegram.send(msg.chat, '✅ Synced!');
  });
  
  // Start listening
  await telegram.startPolling();
}
```

### Outbound Notifications

There is no built-in Slack/Discord/email notifier. The real outbound
surfaces are the in-process event bus, outbound webhooks, and the
Telegram bot (see [Telegram Bot](/vant/integrations/telegram-bot)):

```javascript
// 1. React to brain events in-process (lib/event.js exports the Event
//    class + a defaultEvent instance; sync emits sync:push:complete etc.)
const { defaultEvent } = require('./lib/event');

defaultEvent.on('sync:push:complete', (info) => {
  console.log(`Synced across ${info.providers} provider(s)`);
});

// 2. Or register an outbound webhook - an HTTP endpoint gets POSTed
//    (server refuses to bind without VANT_WEBHOOK_SECRET set)
//    CLI: vant webhooks add <url> <event>
```

### Version & Succession

```javascript
const succession = require('./lib/succession');
const vantVersion = require('./lib/version');

function versionExample() {
  // Where the brain hands over between generations
  const cfg = succession.getConfig();
  const trustLevel = succession.getTrustLevel();   // high | medium | low | none
  const prev = succession.getPreviousBrain();      // prior generation summary
  const current = succession.getCurrentVersion();  // current brain version
  const ledger = succession.getLedger();           // succession history

  // Inspect Vant's own version (lib/version.js is the raw version string)
  console.log(`Vant v${vantVersion}`);

  // Setting a trust level is a separate surface: succession.setTrustLevel(lvl)
}
```

### Auto-Save on Exit

> **Warning for GitHub.com**: Auto-save triggers a sync which counts against rate limits and violates GitHub.com ToS if used for continuous polling. **Use for manual save only**, or use with self-hosted GitLab/Gitea.

There is no `lib/auto-update` module. Auto-save-on-exit is what
`lib/sync.js` push does: wire a SIGINT handler around `vant sync
--push`, or run `vant sync --push "session save"` before you exit.

```javascript
const sync = require('./lib/sync');

async function saveOnExit() {
  await sync.push('session save'); // your own rate-limit guard applies
}
```

### Custom Brain Files

```javascript
const brain = require('./lib/storage').get('brain');

function customBrainExample() {
  // Create a custom JSON file (opts object: format sets the extension)
  brain.write('decisions', 'project-x', {
    decision: 'Use microservices',
    rationale: 'Scalability requirements',
    date: '2024-01-15'
  }, { format: 'json' });

  // Read it back - get() returns the raw file STRING; parse JSON yourself
  const projectX = JSON.parse(brain.get('decisions', 'project-x.json'));
  console.log(projectX.decision);
}
```

## Share Your Project

1. Fork the repo
2. Add your example to the wiki
3. Open an issue to share

## Related

- [Build Agent Tutorial](/vant/getting-started/agent-onboarding)
- [Multi-Agent Tutorial](/vant/multi-agent/coordination)
- [Telegram Bot Tutorial](/vant/integrations/telegram-bot)
- [GitHub](https://github.com/dhaupin/vant) - star us!