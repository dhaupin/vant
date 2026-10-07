---
version: 0.8.6
permalink: /reference/canvas
layout: default
title: Canvas API
nav_order: 120
---

# Canvas API

Creative output engine - generates geometry art for sharing.

## Functions

| Function | What |
|----------|------|
| `paintSpiral(options)` | Generate Penrose spiral into state |
| `toSVG(options)` | Render current state to SVG |
| `save(name, {public, format})` | Save current art under a name |
| `toMarkdown(title)` | Embed as Markdown |
| `share(name, options)` | Generate shareable link |
| `list(options)` | List saved canvases |
| `load(name, options)` | Load canvas |
| `applyEffect(name, effect)` | Apply filter to a saved canvas |
| `embed(name, secret, password, options)` | Hide message in a saved SVG |
| `reveal(name, password, options)` | Read a hidden message back |
| `unwrap(startArt, options)` | Peel nested hidden layers |
| `vote/voteSecured/getVote` | Canvas vote records |
| `listStack/loadStack` | Multibrain stack access |

## Usage

```javascript
const canvas = require('vant/lib/canvas');

// Generate spiral (options object), then render
await canvas.paintSpiral({ iterations: 6 });
const svg = canvas.toSVG();

// Save current art under a name
await canvas.save('my-art', { public: true });

// Embed a secret message in the saved SVG
await canvas.embed('my-art', 'TODO: fix bug', 'optional-password');
const secret = await canvas.reveal('my-art', 'optional-password');
```

The embed path rides lib/stego's native SVG support (`encodeSvg`), so
revealing takes the same password.

## Effects

The one implemented effect:

| Effect | What |
|--------|------|
| glow | Adds an SVG glow filter to the artwork |

(`blur`, `invert`, `grayscale` were listed but never implemented -
`applyEffect` only handles `glow`.)