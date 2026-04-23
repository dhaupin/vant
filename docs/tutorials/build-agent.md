---
permalink: /tutorials/build-agent.html
layout: default
title: Build Your First Agent
---

# Tutorial: Build Your First Persistent Agent

> 15-minute tutorial to build an AI agent that remembers everything between sessions

## What You'll Build

A CLI agent that:
- Loads brain from previous sessions
- Makes decisions using accumulated context
- Saves memory after each interaction

## Step 1: Setup

```bash
# Install Vant
npm install -g vant

# Create brain repo on GitHub
# Go to github.com/new
# Name: my-first-agent-brain
# Make it private
# Create repo
```

## Step 2: Configure

```bash
vant setup

# Follow prompts:
# - GitHub token: (create at github.com/settings/tokens)
# - Brain repo: yourusername/my-first-agent-brain
# - Branch: main
```

## Step 3: Create Agent Script

Create `agent.js`:

```javascript
const { brain, config } = require('vant');

async function run() {
  // Load brain from previous session
  await brain.load();
  
  // Your agent logic here
  const history = brain.get('history', []);
  console.log(`Previous sessions: ${history.length}`);
  
  // Add to history
  history.push({ time: Date.now() });
  brain.set('history', history);
  
  // Save brain
  await brain.save();
}

run();
```

## Step 4: Run

```bash
node agent.js
```

## Step 5: Run Again

```bash
# Run a second time
node agent.js

# Output: Previous sessions: 1
```

## How Brain Transfer Works

```
Session 1          Session 2
    │                 │
    ▼                 ▼
[Load Brain]───────→[Memory]
    │                 │
    ▼                 ▼
[AI Makes ──────────→[Decisions]
    │    Decisions]        │
    │                 │
    ▼                 ▼
[Save Brain]───────→[GitHub Push]
    │                 │
    └─────────────────┘
       Next session inherits!
```

## Next Steps

- [Multi-Agent Tutorial](/vant/tutorials/multi-agent.html) - Scale to multiple agents
- [Succession System](/vant/guides/succession.html) - Version tracking
- [Architecture](/vant/guides/architecture.html) - Deep dive