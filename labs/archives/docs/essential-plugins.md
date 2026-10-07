---
version: 0.8.6
permalink: /essential/plugins
layout: default
title: Plugins
nav_order: 42
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

```text
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

`vant.use(plugin)` wires the plugin's tools and islands into the runtime
at init. List registered islands at runtime:

```bash
vant islands list
```

---

## Share

Publish to npm:

```bash
npm publish
```

Install in a project, then register it as above:

```bash
npm install vant-my-plugin
```

---

## Examples

- vant-github - GitHub API tools
- vant-linear - Linear integration
- vant-discord - Discord bot

---

## More

See [Islands](/vant/essential/islands) and [Runtime](/vant/runtime/runtime).