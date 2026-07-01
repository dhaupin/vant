---
version: 0.8.6
permalink: /tutorials/plugins
layout: default
title: Plugins
nav_order: 27
---

# Tutorial: Build Plugins

> Extend Vant with custom plugins

## What

Plugins extend Vant with:
- Custom tools
- New islands
- Integrations

## Create Plugin

### Structure

```
plugins/
└── my-plugin/
    ├── index.js
    └── package.json
```

### index.js

```javascript
module.exports = {
    name: 'my-plugin',
    version: '1.0.0',
    
    // Tools
    tools: {
        my_tool: async (args) => {
            return { result: args.value * 2 };
        }
    },
    
    // Islands
    islands: {
        my_island: async () => {
            return await brain.get('skills', 'my-skill');
        }
    },
    
    // Hooks
    hooks: {
        onInit: async () => {
            console.log('Plugin loaded');
        }
    }
};
```

### Register

```javascript
const vant = require('vant');
const plugin = require('./plugins/my-plugin');

vant.use(plugin);
```

## Use Plugin

```bash
# Load plugin
vant use ./plugins/my-plugin

# List plugins
vant plugins
```

---

## Share

Publish to npm:

```bash
npm publish
```

Install:

```bash
vant add vant-my-plugin
```

---

## Examples

- vant-github - GitHub API tools
- vant-linear - Linear integration
- vant-discord - Discord bot

---

## More

See [Islands](essential/islands) and [Runtime](essential/runtime).