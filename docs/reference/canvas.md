---
version: 0.8.7
permalink: /reference/canvas
layout: default
title: Canvas API
nav_order: 87
---

# Canvas API

Creative output engine - generates geometry art for sharing.

## Functions

| Function | What |
|----------|------|
| `paintSpiral(iterations)` | Generate Penrose spiral |
| `toSVG()` | Convert to SVG |
| `save(filename)` | Save to file |
| `toMarkdown()` | Embed as Markdown |
| `share()` | Generate shareable link |
| `list()` | List saved canvases |
| `load(name)` | Load canvas |
| `applyEffect(effect)` | Apply filter |
| `embed(message)` | Hide message in SVG |

## Usage

```javascript
const canvas = require('vant/lib/canvas');

// Generate spiral
const svg = await canvas.paintSpiral(6);
// → SVG string

// Save
await canvas.save('my-art.svg');

// Embed secret message
const secret = await canvas.embed('TODO: fix bug');
// → SVG with hidden data
```

## Effects

| Effect | What |
|--------|------|
| blur | Gaussian blur |
| invert | Color invert |
| grayscale | B&W |