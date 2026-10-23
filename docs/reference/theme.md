---
version: 0.8.6
permalink: /reference/theme
layout: default
title: Theme API
description: The theme API - palette faces, the zero-dependency ANSI renderer, and NO_COLOR/piped-output behavior.
nav_order: 134
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
| `ok` | `✓` green check |
| `fail` | `✗` red X |
| `warn` | `⚠` yellow |
| `info(text)` | Blue info shortcut - shares its name with the `ℹ` icon and shadows it in the export list (JS last-key-wins) |

## Modes

The default theme runs in `cli` mode; an `mcp` mode exists for the MCP
result-shape helpers (`applyToMCP` with status/icon/color). There is no
`json`/`html` enforcement - `create(mode)` just stores the mode string.

## Usage

```javascript
const theme = require('vant/lib/theme');

console.log(theme.vant);     // VANT (cyan bold)
console.log(theme.ok);       // ✓
console.log(theme.fail);     // ✗

const myTheme = theme.create({ mode: 'cli', prefix: '[MYAPP]' });
console.log(myTheme.status('ok', 'done'));
```

---

## Related

- [Style Guide](/vant/reference/code-comments) - how CLI output strings roll