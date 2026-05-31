---
version: 0.8.6
permalink: /reference/theme
layout: default
title: Theme API
nav_order: 90
---

# Theme API

Styling utility for CLI/UI output.

> Internal use mostly - for consistent formatting.

## Exports

| Export | What |
|--------|------|
| `create(options)` | Create theme |
| `Theme` | Theme class |
| `vant` | Styled VANT brand |
| `vantHeader` | Bracket style |
| `ok` | ✓ green check |
| `fail` | ✗ red X |
| `warn` | ⚠ yellow |
| `info` | ℹ blue info |

## Modes

| Mode | What |
|------|------|
| `cli` | Terminal output |
| `json` | JSON safe |
| `html` | HTML output |

## Usage

```javascript
const theme = require('vant/lib/theme');

console.log(theme.vant);     // VANT (cyan bold)
console.log(theme.ok);       // ✓
console.log(theme.fail);     // ✗

const myTheme = theme.create({ mode: 'html' });
```