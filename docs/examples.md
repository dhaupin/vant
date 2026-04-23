---
permalink: /examples.html
layout: default
title: Examples & Showcase
---

# Examples & Showcase

> Real-world projects and code examples built with Vant

## Community Projects

*(Submit yours via [GitHub Issues](https://github.com/dhaupin/issues))*

### AI Development Agents

- **Auto-Dev Agent** - Self-improving code agent that learns from debugging sessions
- **Code Review Bot** - AI that performs code reviews and remembers patterns

### Research Agents

- **Literature Review Agent** - Reads papers, synthesizes findings across sessions
- **Data Analysis Agent** - Persistent data exploration and visualization

### Personal Assistants

- **Writing Coach** - Helps with writing, remembers style preferences
- **Learning Assistant** - Tracks learning progress across sessions

## Use Cases
Common scenarios where Vant excels.

### Long-Running Workflows

Agent runs that take days/weeks and need context preserved:

```
Session 1: Research topic ──→ GitHub
Session 2: Analyze data  ──→ GitHub  
Session 3: Write report  ──→ GitHub
... continues ...
```

### Multi-Agent Teams

Coordinated agents with branch isolation:

```
main (production brain)
    │
    ├── researcher-agent/
    ├── analyzer-agent/
    └── writer-agent/
```

### Edge Computing

Deploy to devices that lose power:

```
Edge device starts → Load brain from GitHub
                  Does work
                  Save brain to GitHub
                  Power off
```

## Code Snippets

Working examples for common tasks.

### Basic Memory Operations

```javascript
const brain = require('./lib/brain');

async function basicExample() {
  // Load brain from GitHub
  await brain.load();
  
  // Read from brain
  const identity = brain.get('identity');
  const goals = brain.get('goals', []);
  const lessons = brain.get('lessons');
  
  // Write to brain
  goals.push({ text: 'Learn more about Vant', done: false });
  brain.set('goals', goals);
  
  // Save to disk (push with vant sync)
  await brain.save();
}
```

### Persistent Agent Loop

```javascript
const brain = require('./lib/brain');
const config = require('./lib/config');

async function agentLoop() {
  await brain.load();
  
  while (true) {
    // Load previous context
    const history = brain.get('history', []);
    const lastTask = history[history.length - 1];
    
    // Process task
    const task = await getNextTask();
    const result = await processTask(task);
    
    // Save results
    history.push({ task, result, time: Date.now() });
    brain.set('history', history);
    await brain.save();
    
    // Sync to GitHub
    await syncWithGitHub();
  }
}
```

### With Locking (Multi-Agent Safe)

```javascript
const lock = require('./lib/lock');
const branch = require('./lib/branch');

async function safeWrite(agentId, content) {
  // 1. Acquire lock
  const token = await lock.acquire(agentId);
  if (!token) {
    throw new Error('Brain is locked by another agent');
  }
  
  try {
    // 2. Switch to your branch
    await branch.checkout(agentId);
    
    // 3. Do work
    const lessons = readFile('models/public/lessons.md');
    lessons += `\n${content}`;
    writeFile('models/public/lessons.md', lessons);
    
    // 4. Commit
    await branch.commit(agentId, `Agent ${agentId}: ${content}`);
    
  } finally {
    // 5. Always release
    await lock.release(agentId, token);
  }
}
```

### Reading Specific Files

```javascript
const brain = require('./lib/brain');

async function queryBrain() {
  // Get specific files
  const identity = brain.get('identity');
  const goals = brain.get('goals');
  const fears = brain.get('fears');
  const joy = brain.get('joy');
  
  // Get all of one category
  const learnings = brain.get('learnings');
  
  // Check if file exists
  if (brain.has('custom-file')) {
    const custom = brain.get('custom-file');
  }
  
  return { identity, goals, fears, joy, learnings };
}
```

### Appending to Lessons

```javascript
const brain = require('./lib/brain');

async function addLesson(lesson) {
  const timestamp = new Date().toISOString();
  const entry = `## ${timestamp}\n\n${lesson}\n`;
  
  // Append to existing or create new
  const existing = brain.get('lessons') || '';
  brain.set('lessons', existing + '\n---\n' + entry);
  
  await brain.save();
}

// Usage
await addLesson('Remember to always test edge cases');
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
        arguments: { files: ['goals', 'lessons'] }
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

### Slack/Discord Notifications

```javascript
const notifications = require('./lib/notifications');

async function notifyExamples() {
  // Slack notification
  await notifications.slack('Brain synced!', {
    channel: '#agents',
    username: 'Vant Bot'
  });
  
  // Discord notification
  await notifications.discord('Deploy complete', {
    embed: true,
    color: 0x059669
  });
  
  // Event notification
  await notifications.event('sync', {
    branch: 'main',
    files: 19,
    success: true
  });
}
```

### Version & Succession

```javascript
const succession = require('./lib/succession');
const version = require('./lib/version');

async function versionExample() {
  // Get current brain version
  const current = await succession.get();
  console.log(`Brain version: ${current.version}`);
  
  // Mark as trusted
  await succession.trust();
  
  // Compare to previous
  const diff = await succession.diff();
  console.log('Changes:', diff);
  
  // Check Vant version
  const vantVersion = version.get();
  console.log(`Vant v${vantVersion}`);
}
```

### Auto-Save on Exit

```javascript
const autoUpdate = require('./lib/auto-update');

function setupAutoSave() {
  // Enable auto-save
  autoUpdate.enable();
  
  // Configure
  autoUpdate.on('save', () => {
    console.log('Brain auto-saved');
  });
  
  // Trigger manually
  process.on('SIGINT', async () => {
    await autoUpdate.trigger();
    process.exit();
  });
}
```

### Custom Brain Files

```javascript
const brain = require('./lib/brain');
const fs = require('fs');

async function customBrainExample() {
  // Create custom JSON file
  brain.write('decisions', 'project-x', JSON.stringify({
    decision: 'Use microservices',
    rationale: 'Scalability requirements',
    date: '2024-01-15'
  }), 'json');
  
  // Read custom file
  const projectX = brain.get('decisions', 'project-x');
  console.log(projectX.decision);
}
```

## Share Your Project

1. Fork the repo
2. Add your example to the wiki
3. Open an issue to share

## Related

- [Build Agent Tutorial](/vant/tutorials/build-agent.html)
- [Multi-Agent Tutorial](/vant/tutorials/multi-agent.html)
- [Telegram Bot Tutorial](/vant/tutorials/telegram-bot.html)
- [GitHub](https://github.com/dhaupin/vant) - star us!