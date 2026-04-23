---
permalink: /examples.html
layout: default
title: Examples & Showcase
---

# Examples & Showcase

> Real-world projects and use cases built with Vant

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

### Basic Memory

```javascript
const brain = require('vant/lib/brain');

await brain.load();
const goals = brain.get('goals', []);
goals.push('New goal');
brain.set('goals', goals);
await brain.save();
```

### With Locking

```javascript
const lock = require('vant/lib/lock');
const branch = require('vant/lib/branch');

const token = await lock.acquire('agent-1');
if (!token) return; // locked

await branch.checkout('agent-1');
// ... work ...
await branch.commit('agent-1', 'Done');
await lock.release('agent-1', token);
```

## Share Your Project

1. Fork the repo
2. Add your example to the wiki
3. Open an issue to share

## Related

- [Build Agent Tutorial](/vant/tutorials/build-agent.html)
- [Multi-Agent Tutorial](/vant/tutorials/multi-agent.html)
- [GitHub](https://github.com/dhaupin/vant) - star us!