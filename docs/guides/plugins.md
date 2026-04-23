---
permalink: /guides/plugins.html
layout: default
title: Plugins
---
# Plugins

Extend VANT with custom plugins.

## Built-in Plugins

| Plugin | Description |
|--------|-------------|
| brain | Brain loading and management |
| config | Configuration management |
| echo | Echo test plugin |
| mood | Mood state management |
| renderer | Output renderer |

## Creating a Plugin

Create a directory in `src/plugins/`:

```
src/plugins/my-plugin/
  index.js      # Main entry
  config.json  # Optional config
```

### Plugin Interface

```javascript
// src/plugins/my-plugin/index.js
module.exports = {
  // Called when plugin loads
  onLoad: (brain) => {
    console.log('Plugin loaded');
  },
  
  // Called on each message (return modified message)
  onMessage: (msg) => {
    // Process message
    return msg;
  },
  
  // Called when brain saves
  onSave: () => {
    console.log('Saving...');
  },
  
  // Called when plugin unloads
  onUnload: () => {
    console.log('Goodbye');
  }
};
```

### config.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "enabled": true
}
```

## Loading Plugins

Plugins load automatically from `src/plugins/`:

```bash
vant start
# [Plugin] Loaded: brain
# [Plugin] Loaded: config
# [Plugin] Loaded: echo
```

Example:

## Examples
Real-world use cases and patterns.

### Echo Plugin

Simple echo on message:

```javascript
// src/plugins/echo/index.js
module.exports = {
  onMessage: (msg) => {
    return `[Echo] ${msg}`;
  }
};
```

### Mood-aware Plugin

Respond differently based on mood:

```javascript
// src/plugins/mood/index.js
module.exports = {
  onMessage: (msg, { mood }) => {
    if (mood === 'playful') {
      return msg + ' 😄';
    }
    return msg;
  }
};
```

## Best Practices

1. Keep plugins small and focused
2. Handle errors gracefully
3. Document configuration options
4. Support enable/disable

See also: [Architecture](/vant/guides/architecture.html), [CLI Reference](/vant/reference/cli.html)